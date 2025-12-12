import os
import uuid
import re
import json
import hashlib
import time
import secrets
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import Flask, request, redirect, jsonify, session, Response, abort, make_response, send_from_directory
import requests
from io import BytesIO
from pathlib import Path
from flask_session import Session
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google.oauth2 import service_account
from authlib.integrations.flask_client import OAuth
from werkzeug.middleware.proxy_fix import ProxyFix # New Import
from werkzeug.utils import secure_filename

app = Flask(__name__)

# --- CRITICAL FIX START: Tell Flask to trust the proxy headers (Apache) ---
# This ensures url_for(_external=True) uses the public domain and protocol
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_host=1, x_proto=1)

# CRITICAL FIX 2: Define the explicit public redirect URI
# Public domain for external URLs (adjust to your deployed domain)
PUBLIC_DOMAIN = 'http://alexandria.sd123.org'
# Avoid calling url_for at module import time (no request context). Use the explicit
# callback path registered in Google Cloud Console instead.
OAUTH_REDIRECT_URI = PUBLIC_DOMAIN + '/authorize'
# --- CRITICAL FIX END ---

# Require SECRET_KEY from environment (no baked-in default)
app.secret_key = os.getenv("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("SECRET_KEY environment variable is required")

app.config['SESSION_TYPE'] = 'filesystem'
# Secure session cookies for production
IS_PRODUCTION = os.getenv("PRODUCTION", "0") == "1"
app.config['SESSION_COOKIE_SECURE'] = IS_PRODUCTION  # HTTPS only in production
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Prevent JavaScript access
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # CSRF protection
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour session
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'FRONTEND_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173'
    ).split(',')
    if origin.strip()
]

# Default admin bootstrap values (hoisted before use)
INIT_ADMIN_EMAIL = os.getenv('INIT_ADMIN_EMAIL', 'admin')
INIT_ADMIN_PASSWORD = os.getenv('INIT_ADMIN_PASSWORD')

# File upload configuration
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'documents')
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'xlsx', 'xls'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize extensions
Session(app)

# Cache configuration
CACHE_DURATION = 86400  # 24 hours in seconds
CACHE = {}

# Admin allowlist (env-driven; comma-separated emails/usernames)
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv('ADMIN_EMAILS', '').split(',')
    if email.strip()
}
if INIT_ADMIN_EMAIL:
    ADMIN_EMAILS.add(INIT_ADMIN_EMAIL.strip().lower())

# CSRF Protection
@app.before_request
def ensure_csrf_token():
    """Generate a CSRF token per session if missing"""
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_urlsafe(32)

def validate_csrf(token):
    """Validate CSRF token"""
    if not token or 'csrf_token' not in session:
        return False
    try:
        return secrets.compare_digest(session['csrf_token'], token)
    except Exception:
        return False

# Allow simple CORS for API endpoints (dev convenience)
@app.after_request
def add_cors_headers(response):
    try:
        if request.path.startswith('/api/'):
            origin = request.headers.get('Origin')
            if origin in FRONTEND_ORIGINS:
                response.headers['Access-Control-Allow-Origin'] = origin
            elif FRONTEND_ORIGINS:
                response.headers['Access-Control-Allow-Origin'] = FRONTEND_ORIGINS[0]
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Vary'] = 'Origin'
            if request.method == 'OPTIONS':
                response.status_code = 204
    except Exception:
        pass
    return response


@app.route('/api/<path:any_path>', methods=['OPTIONS'])
def handle_api_options(any_path):
    """Handle CORS preflight for any /api/* route."""
    resp = make_response('', 204)
    return add_cors_headers(resp)

# Cache decorator with TTL
def cache_ttl(ttl_seconds):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = hashlib.md5(str(args[1]).encode('utf-8')).hexdigest()
            if key in CACHE:
                cached_time, data = CACHE[key]
                if time.time() - cached_time < ttl_seconds:
                    return data
            
            result = func(*args, **kwargs)
            CACHE[key] = (time.time(), result)
            return result
        return wrapper
    return decorator

@cache_ttl(ttl_seconds=CACHE_DURATION)
def fetch_image(url):
    """Fetch image with timeout and retry logic"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, stream=True, headers=headers, timeout=5)
        response.raise_for_status()
        return response.content, response.headers.get('content-type')
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Error fetching image {url}: {str(e)}")
        return None, None

# Image proxy route to handle CORS issues with caching
@app.route('/image-proxy')
def image_proxy():
    """Proxy image requests to avoid CORS issues with caching"""
    url = request.args.get('url')
    if not url:
        return 'URL parameter is required', 400
    
    try:
        # Try to get from cache first
        cache_key = hashlib.md5(url.encode('utf-8')).hexdigest()
        if cache_key in CACHE:
            cached_time, (image_data, content_type) = CACHE[cache_key]
            if time.time() - cached_time < CACHE_DURATION:
                return Response(image_data, content_type=content_type)
        
        # If not in cache or expired, fetch and cache
        image_data, content_type = fetch_image(url)
        
        if not image_data or not content_type:
            return 'Error loading image', 500
            
        # Cache the result
        CACHE[cache_key] = (time.time(), (image_data, content_type))
        
        # Return the image
        return Response(image_data, content_type=content_type)
        
    except Exception as e:
        app.logger.error(f"Error in image proxy: {str(e)}")
        return 'Error loading image', 500
oauth = OAuth(app)
from dotenv import load_dotenv
load_dotenv()

# Google SSO credentials can be configured via environment variables or database

# Database configuration
USE_SQLITE = True
SQLITE_DB_PATH = os.getenv('SQLITE_DB_PATH', os.path.join(app.root_path, 'data', 'alexandria.db'))
# Ensure SQLite directory exists
os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)

# Single Tenant Configuration
DISTRICT_NAME = os.getenv('DISTRICT_NAME', 'Default District')
DISTRICT_CONTACT_EMAIL = os.getenv('DISTRICT_CONTACT_EMAIL', 'admin@example.com')


# File upload helper functions
def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file, prefix='doc', include_static_prefix=True):
    """Save uploaded file and return the path
    
    Args:
        file: The uploaded file object
        prefix: Prefix for the filename (e.g., 'ndpa', 'logo', 'invoice')
        include_static_prefix: If True, returns /static/documents/filename
                              If False, returns documents/filename (for use with templates that add /static/)
    """
    if file and allowed_file(file.filename):
        # Create a unique filename
        filename = secure_filename(file.filename)
        unique_filename = f"{prefix}_{uuid.uuid4().hex[:8]}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        # Return path with or without 'static' prefix depending on usage
        if include_static_prefix:
            return f"/static/documents/{unique_filename}"
        else:
            return f"documents/{unique_filename}"
    return None


def normalize_doc_path(path: str) -> str:
    """Normalize stored document paths to a public /static/documents/* URL.

    Handles older records that may have stored bare filenames, documents/, or static/documents/ prefixes.
    Leaves full http(s) URLs untouched.
    """
    if not path:
        return ''
    path = path.strip()
    if path.startswith(('http://', 'https://')):
        return path
    # Drop any leading slashes and directories; keep just the filename
    name = Path(path).name
    if not name:
        return ''
    return f"static/documents/{name}"

def is_google_drive_link(url):
    """Check if URL is a Google Drive link"""
    if not url:
        return False
    return 'drive.google.com' in url or 'docs.google.com' in url


_ACTIVITY_LOG_TABLE_READY = False

class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        
    def execute(self, query, params=None):
        if query:
            # Replace Postgres %s placeholders with SQLite ?
            query = query.replace('%s', '?')
            # Replace Postgres ILIKE with SQLite LIKE (case-insensitive by default in SQLite for ASCII)
            query = query.replace(' ILIKE ', ' LIKE ')
            # Handle TRUE/FALSE literals in queries
            query = query.replace('TRUE', '1').replace('FALSE', '0')
            
        return self.cursor.execute(query, params or ())

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def close(self):
        self.cursor.close()

    @property
    def description(self):
        return self.cursor.description

    @property
    def rowcount(self):
        return self.cursor.rowcount
    
    @property
    def lastrowid(self):
        return self.cursor.lastrowid
        
    def __iter__(self):
        return iter(self.cursor)

class SQLiteConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
    
    def cursor(self):
        return SQLiteCursorWrapper(self.conn.cursor())
        
    def commit(self):
        return self.conn.commit()
        
    def rollback(self):
        return self.conn.rollback()
        
    def close(self):
        return self.conn.close()

# -----------------------
# Database Helper Functions
# -----------------------
def get_db_connection():
    """Establish a SQLite connection (PostgreSQL disabled)."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return SQLiteConnectionWrapper(conn)

def init_db():
    """Initializes the database schema (SQLite only)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            unique_id TEXT NOT NULL,
            notes TEXT,
            company TEXT,
            privacy_link TEXT NOT NULL,
            soppa_compliant TEXT CHECK(soppa_compliant IN (
                'Compliant', 'Staff use only', 'Not applicable', 'Unknown',
                'Policies are SOPPA compliant', 'Not fully SOPPA compliant',
                'Noncompliant', 'Parent consent required'
            )),
            otherdocs TEXT,
            invoices TEXT,
            status TEXT CHECK(status IN (
                'Pending', 'Not Supported by District', 'Approved for Use',
                'Use Alternate', 'Core Tool', 'Supplemental Tool', 'Reviewed & Denied'
            )) NOT NULL,
            tags TEXT,
            product_visibility INTEGER CHECK(product_visibility IN (0, 1)) NOT NULL DEFAULT 1,
            product_link TEXT
        )
    ''')

    conn.commit()
    cursor.close()
    conn.close()
    # Ensure audit log table exists as well
    try:
        ensure_users_schema() # CRITICAL: Ensure users table exists for local auth
        ensure_activity_log_schema()
        ensure_app_requests_schema()
        ensure_vendor_contacts_schema()
        ensure_districts_schema()
        migrate_districts_schema() # Ensure new columns are added
        ensure_district_users_schema()
        ensure_district_apps_schema()
        ensure_default_district()
        ensure_default_admin()
    except Exception as exc:
        app.logger.warning('Failed ensuring schema during init: %s', exc)


def ensure_activity_log_schema(force: bool = False):
    """Create the audit log table/index if they do not already exist."""
    global _ACTIVITY_LOG_TABLE_READY
    if _ACTIVITY_LOG_TABLE_READY and not force:
        return

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS app_activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    action TEXT NOT NULL CHECK (action IN ('create','update','delete')),
                    app_id INTEGER,
                    app_name TEXT,
                    user_email TEXT,
                    details TEXT
                )
            ''')
        else:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS app_activity_logs (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    action TEXT NOT NULL CHECK (action IN ('create','update','delete')),
                    app_id INTEGER,
                    app_name TEXT,
                    user_email TEXT,
                    details JSONB
                )
            ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_app_activity_logs_created_at ON app_activity_logs (created_at DESC)
        ''')
        conn.commit()
        _ACTIVITY_LOG_TABLE_READY = True
    finally:
        cursor.close()
        conn.close()


def ensure_app_requests_schema(force: bool = False):
    """Create the app_requests table used for staff-submitted app requests."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute(
                '''CREATE TABLE IF NOT EXISTS app_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    district_slug TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    company TEXT,
                    url TEXT,
                    notes TEXT,
                    requester_email TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )'''
            )
        else:
            cursor.execute(
                '''CREATE TABLE IF NOT EXISTS app_requests (
                    id SERIAL PRIMARY KEY,
                    district_slug TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    company TEXT,
                    url TEXT,
                    notes TEXT,
                    requester_email TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )'''
            )
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_app_requests_slug ON app_requests (district_slug)')
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def ensure_users_schema(force: bool = False):
    """Create local user accounts table for password auth."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute(
                '''CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )'''
            )
        else:
            cursor.execute(
                '''CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )'''
            )
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)')
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def ensure_vendor_contacts_schema(force: bool = False):
    """Create vendor contacts table and indexes if missing."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS vendor_contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT,
                    role TEXT,
                    notes TEXT,
                    is_primary BOOLEAN DEFAULT FALSE,
                    tags TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        else:
            cursor.execute(
                '''CREATE TABLE IF NOT EXISTS vendor_contacts (
                    id SERIAL PRIMARY KEY,
                    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT,
                    role TEXT,
                    notes TEXT,
                    is_primary BOOLEAN DEFAULT FALSE,
                    tags TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )'''
            )
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_vendor_contacts_app_id ON vendor_contacts (app_id)'
        )
        cursor.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_contacts_app_email ON vendor_contacts (app_id, email)'
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def ensure_districts_schema(force: bool = False):
    """Create districts table and indexes if missing."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS districts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL UNIQUE,
                    contact_email TEXT NOT NULL,
                    created_by_email TEXT NOT NULL,
                    logo_url TEXT,
                    primary_color TEXT,
                    accent_color TEXT,
                    allowed_domain TEXT,
                    google_client_id TEXT,
                    google_client_secret TEXT,
                    apple_client_id TEXT,
                    apple_team_id TEXT,
                    apple_key_id TEXT,
                    apple_private_key TEXT,
                    microsoft_client_id TEXT,
                    microsoft_tenant_id TEXT,
                    microsoft_client_secret TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        else:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS districts (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL UNIQUE,
                    contact_email TEXT NOT NULL,
                    created_by_email TEXT NOT NULL,
                    logo_url TEXT,
                    primary_color TEXT,
                    accent_color TEXT,
                    allowed_domain TEXT,
                    google_client_id TEXT,
                    google_client_secret TEXT,
                    apple_client_id TEXT,
                    apple_team_id TEXT,
                    apple_key_id TEXT,
                    apple_private_key TEXT,
                    microsoft_client_id TEXT,
                    microsoft_tenant_id TEXT,
                    microsoft_client_secret TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            ''')
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_districts_slug ON districts (slug)'
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

def migrate_districts_schema():
    """Add new columns to districts table if they don't exist."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Columns to ensure exist
        columns = [
            'logo_url', 'primary_color', 'accent_color', 'allowed_domain',
            'google_client_id', 'google_client_secret',
            'apple_client_id', 'apple_team_id', 'apple_key_id', 'apple_private_key',
            'microsoft_client_id', 'microsoft_tenant_id', 'microsoft_client_secret'
        ]
        for col in columns:
            try:
                if USE_SQLITE:
                    cursor.execute(f"ALTER TABLE districts ADD COLUMN {col} TEXT")
                else:
                    cursor.execute(f"ALTER TABLE districts ADD COLUMN IF NOT EXISTS {col} TEXT")
                conn.commit()
            except Exception:
                # Ignore error if column exists (SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
                pass
    finally:
        cursor.close()
        conn.close()


def ensure_district_users_schema(force: bool = False):
    """Create district_users table for user roles per district."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS district_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
                    email TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
                    name TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(district_id, email)
                )
            ''')
        else:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS district_users (
                    id SERIAL PRIMARY KEY,
                    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
                    email TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
                    name TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(district_id, email)
                )
            ''')
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_district_users_district_id ON district_users (district_id)'
        )
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_district_users_email ON district_users (email)'
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def ensure_district_apps_schema(force: bool = False):
    """Create district_apps table to scope apps per district."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if USE_SQLITE:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS district_apps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
                    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(district_id, app_id)
                )
            ''')
        else:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS district_apps (
                    id SERIAL PRIMARY KEY,
                    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
                    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(district_id, app_id)
                )
            ''')
        cursor.execute(
            'CREATE INDEX IF NOT EXISTS idx_district_apps_district_id ON district_apps (district_id)'
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def ensure_default_district():
    """Ensure the single default district exists."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if any district exists
        if USE_SQLITE:
            cursor.execute("SELECT count(*) FROM districts")
        else:
            cursor.execute("SELECT count(*) FROM districts")
        
        count = cursor.fetchone()[0]
        
        if count == 0:
            app.logger.info(f"Creating default district: {DISTRICT_NAME}")
            slug = 'local' # Hardcode slug for single-tenant
            if USE_SQLITE:
                cursor.execute(
                    "INSERT INTO districts (name, slug, contact_email, created_by_email) VALUES (?, ?, ?, ?)",
                    (DISTRICT_NAME, slug, DISTRICT_CONTACT_EMAIL, 'system')
                )
            else:
                cursor.execute(
                    "INSERT INTO districts (name, slug, contact_email, created_by_email) VALUES (%s, %s, %s, %s)",
                    (DISTRICT_NAME, slug, DISTRICT_CONTACT_EMAIL, 'system')
                )
            conn.commit()
    except Exception as e:
        app.logger.error(f"Error ensuring default district: {e}")
    finally:
        cursor.close()
        conn.close()

def ensure_default_admin():
    """Ensure the initial admin user exists."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if admin exists in users table
        if USE_SQLITE:
            cursor.execute("SELECT id FROM users WHERE email = ?", (INIT_ADMIN_EMAIL,))
        else:
            cursor.execute("SELECT id FROM users WHERE email = %s", (INIT_ADMIN_EMAIL,))
            
        user = cursor.fetchone()
        
        if not user:
            if not INIT_ADMIN_PASSWORD:
                app.logger.warning("INIT_ADMIN_PASSWORD is not set; skipping default admin creation")
                return
            app.logger.info(f"Creating default admin: {INIT_ADMIN_EMAIL}")
            password_hash = generate_password_hash(INIT_ADMIN_PASSWORD)
            
            if USE_SQLITE:
                cursor.execute(
                    "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
                    (INIT_ADMIN_EMAIL, 'Super Admin', password_hash)
                )
            else:
                cursor.execute(
                    "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s)",
                    (INIT_ADMIN_EMAIL, 'Super Admin', password_hash)
                )
            conn.commit()
            
            # Now assign admin role to the district
            # Get the district id
            if USE_SQLITE:
                cursor.execute("SELECT id FROM districts LIMIT 1")
            else:
                cursor.execute("SELECT id FROM districts LIMIT 1")
            district_id = cursor.fetchone()[0]
            
            # Add to district_users
            try:
                if USE_SQLITE:
                    cursor.execute(
                        "INSERT INTO district_users (district_id, email, role, name) VALUES (?, ?, 'admin', 'Super Admin')",
                        (district_id, INIT_ADMIN_EMAIL)
                    )
                else:
                    cursor.execute(
                        "INSERT INTO district_users (district_id, email, role, name) VALUES (%s, %s, 'admin', 'Super Admin')",
                        (district_id, INIT_ADMIN_EMAIL)
                    )
                conn.commit()
            except Exception as e: 
                app.logger.warning(f"Admin might already be in district_users: {e}")

    except Exception as e:
        app.logger.error(f"Error ensuring default admin: {e}")
    finally:
        cursor.close()
        conn.close()


def record_app_activity(action, app_id=None, app_name=None, user_email=None, details=None):
    """Insert an app activity log entry. Non-blocking: logs failures are caught and emitted to the app logger.

    Args:
        action: 'create'|'update'|'delete'
        app_id: integer id of the app (may be None)
        app_name: app name string
        user_email: email of acting user
        details: dict-like additional metadata
    """
    try:
        if action not in ('create', 'update', 'delete'):
            app.logger.warning(f"Invalid activity action attempted: {action}")
            return

        ensure_activity_log_schema()
        conn = get_db_connection()
        cur = conn.cursor()
        details_json = json.dumps(details, default=str) if details is not None else None
        cur.execute(
            """INSERT INTO app_activity_logs (action, app_id, app_name, user_email, details) VALUES (%s, %s, %s, %s, %s)""",
            (action, app_id, app_name, user_email, details_json),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        app.logger.exception('Failed to record app activity log')


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Serve the React Frontend (SPA)."""
    # If the path points to a file in the 'client' directory (e.g. assets), serve it.
    if path != "" and os.path.exists(os.path.join(app.root_path, 'client', path)):
        return send_from_directory(os.path.join(app.root_path, 'client'), path)
    
    # Otherwise, fallback to index.html for client-side routing
    if os.path.exists(os.path.join(app.root_path, 'client', 'index.html')):
        return send_from_directory(os.path.join(app.root_path, 'client'), 'index.html')
    
    return "Frontend not found. Did you run the build?", 404




# -----------------------
# Authentication Routes
# -----------------------


@app.route('/api/auth/register', methods=['POST'])
def register_user():
    """Create a local user account and start a session."""
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        # Support 'username' or 'email' field, mapped to email variable
        email = (data.get('username') or data.get('email') or '').strip().lower()
        name = (data.get('name') or '').strip()
        password = data.get('password') or ''

        if not email:
            return jsonify({'error': 'Username is required'}), 400
        if len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        ensure_users_schema()
        conn = get_db_connection()
        cursor = conn.cursor()

        if USE_SQLITE:
            cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
        else:
            cursor.execute('SELECT id FROM users WHERE email = %s', (email,))
        if cursor.fetchone():
            return jsonify({'error': 'Account already exists'}), 409

        password_hash = generate_password_hash(password)
        display_name = name or email.split('@')[0]

        if USE_SQLITE:
            cursor.execute(
                '''INSERT INTO users (email, name, password_hash)
                   VALUES (?, ?, ?)''',
                (email, display_name, password_hash),
            )
            user_id = cursor.lastrowid
        else:
            cursor.execute(
                '''INSERT INTO users (email, name, password_hash)
                   VALUES (%s, %s, %s)
                   RETURNING id''',
                (email, display_name, password_hash),
            )
            user_id = cursor.fetchone()[0]

        conn.commit()
        session['user'] = {'id': user_id, 'email': email, 'name': display_name}
        session.permanent = True
        return jsonify({'success': True, 'user': session['user']}), 201
    except Exception as exc:
        if conn:
            conn.rollback()
        app.logger.error('Error registering user: %s', exc)
        return jsonify({'error': 'Unable to create account'}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/api/auth/login', methods=['POST'])
def login_user_api():
    """Authenticate local user and start a session."""
    conn = None
    cursor = None
    try:
        data = request.get_json() or {}
        # Support 'username' or 'email' field, mapped to email variable
        email = (data.get('username') or data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not email or not password:
            return jsonify({'error': 'Username and password are required'}), 400

        ensure_users_schema()
        conn = get_db_connection()
        cursor = conn.cursor()

        if USE_SQLITE:
            cursor.execute('SELECT id, email, name, password_hash FROM users WHERE email = ?', (email,))
        else:
            cursor.execute('SELECT id, email, name, password_hash FROM users WHERE email = %s', (email,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Invalid credentials'}), 401

        # sqlite rows support key access, but tuples will still work with indexes
        # password_hash = row[3] if isinstance(row, tuple) else row['password_hash']
        # if not check_password_hash(password_hash, password):
        #     return jsonify({'error': 'Invalid credentials'}), 401

        # The row object can be a tuple (for psycopg2) or a sqlite3.Row object (for sqlite3)
        # sqlite3.Row objects allow access by column name or index.
        # For consistency, we'll try to access by name first, then by index if it's a tuple.
        import sqlite3 # Ensure sqlite3 is imported for sqlite3.Row check

        user = {
            'id': row['id'] if isinstance(row, sqlite3.Row) else (row[0] if isinstance(row, tuple) else row['id']),
            'email': row['email'] if isinstance(row, sqlite3.Row) else (row[1] if isinstance(row, tuple) else row['email']),
            'name': row['name'] if isinstance(row, sqlite3.Row) else (row[2] if isinstance(row, tuple) else row['name']),
            'password_hash': row['password_hash'] if isinstance(row, sqlite3.Row) else (row[3] if isinstance(row, tuple) else row['password_hash']),
        }

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Invalid credentials'}), 401

        # user = {
        #     'id': row[0] if isinstance(row, tuple) else row['id'],
        #     'email': row[1] if isinstance(row, tuple) else row['email'],
        #     'name': row[2] if isinstance(row, tuple) else row['name'],
        # }
        # Remove password_hash from the session user object for security
        session_user_data = {k: v for k, v in user.items() if k != 'password_hash'}
        session['user'] = session_user_data
        session.permanent = True
        return jsonify({'success': True, 'user': session_user_data})
    except Exception as exc:
        app.logger.exception('Error logging in user: %s', exc)
        return jsonify({'error': 'Unable to log in'}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    """Return current user info and role."""
    if 'user' not in session:
        return jsonify({'authenticated': False})
    
    user = session['user']
    email = user.get('email')
    
    # Fetch role
    role = 'staff' # default
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if USE_SQLITE:
            app.logger.info(f"Checking role for {email} in SQLite")
            cursor.execute("SELECT role FROM district_users WHERE email=? LIMIT 1", (email,))
        else:
            cursor.execute("SELECT role FROM district_users WHERE email=%s LIMIT 1", (email,))
        row = cursor.fetchone()
        if row:
            role = row[0]
            app.logger.info(f"Found role for {email}: {role}")
        else:
            app.logger.warning(f"No role found for {email} in district_users")
            
        if role != 'admin':
             if USE_SQLITE:
                 cursor.execute("SELECT 1 FROM users WHERE email=? AND is_admin=1", (email,)) # Assuming an 'is_admin' column for local users
             else:
                 cursor.execute("SELECT 1 FROM users WHERE email=%s AND is_admin=TRUE", (email,)) # Assuming an 'is_admin' column for local users
             if cursor.fetchone():
                 role = 'admin' # Local users created via setup are admins? Setup made them admin in district_users anyway.
                 
    except Exception as e:
        app.logger.error(f"Error fetching user role for {email}: {e}")
        # If there's an error, role remains 'staff' or default.
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return jsonify({
        'authenticated': True,
        'user': {
            'email': email,
            'name': user.get('name'),
            'picture': user.get('picture'), # Assuming 'picture' might be in session for OAuth users
            'role': role
        },
        'csrf_token': session.get('csrf_token')
    })


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/districts', methods=['POST'])
def create_district():
    """Initial district setup (single-tenant only). Called during first-run setup."""
    try:
        data = request.get_json() or {}
        session_user = session.get('user')
        if not session_user or not session_user.get('email'):
            return jsonify({'error': 'Please log in before creating a district'}), 401
        
        district_name = data.get('name', '').strip()
        district_slug = data.get('slug', '').strip().lower()
        contact_email = data.get('contact_email', '').strip()
        creator_email = session_user.get('email')
        creator_name = session_user.get('name') or data.get('creator_name', 'Admin')
        
        # Validate inputs
        if not district_name or not district_slug or not contact_email:
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Validate slug format (alphanumeric and hyphens only)
        if not all(c.isalnum() or c == '-' for c in district_slug):
            return jsonify({'error': 'Slug can only contain letters, numbers, and hyphens'}), 400
        
        # Validate emails
        if '@' not in contact_email or '@' not in creator_email:
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Create district
        try:
            ensure_districts_schema()
            ensure_district_users_schema()

            conn = get_db_connection()
            cursor = conn.cursor()

            if USE_SQLITE:
                cursor.execute(
                    '''INSERT INTO districts (name, slug, contact_email, created_by_email)
                       VALUES (?, ?, ?, ?)''',
                    (district_name, district_slug, contact_email, creator_email),
                )
                district_id = cursor.lastrowid
                cursor.execute(
                    '''INSERT INTO district_users (district_id, email, name, role)
                       VALUES (?, ?, ?, ?)''',
                    (district_id, creator_email, creator_name, 'admin'),
                )
            else:
                cursor.execute(
                    '''INSERT INTO districts (name, slug, contact_email, created_by_email)
                       VALUES (%s, %s, %s, %s)
                       RETURNING id''',
                    (district_name, district_slug, contact_email, creator_email),
                )
                district_id = cursor.fetchone()[0]
                cursor.execute(
                    '''INSERT INTO district_users (district_id, email, name, role)
                       VALUES (%s, %s, %s, %s)''',
                    (district_id, creator_email, creator_name, 'admin'),
                )

            conn.commit()
            cursor.close()
            conn.close()

            return jsonify({
                'success': True,
                'district_id': district_id,
                'slug': district_slug,
                'message': f'District {district_name} created successfully'
            }), 201

        except Exception as e:
            if "UNIQUE constraint failed" in str(e) or "duplicate" in str(e):
                return jsonify({'error': f'District slug "{district_slug}" already exists'}), 409
            app.logger.error(f'Error creating district: {str(e)}')
            return jsonify({'error': 'Failed to create district'}), 500
    
    except Exception as e:
        app.logger.error(f'Error in create_district: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/auth/google')
def google_auth():
    """Initiate Google OAuth login using dynamic credentials."""
    if 'user' in session:
        return redirect('/')
    
    # Fetch credentials
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    
    # Try fetching from DB (Local District)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        if USE_SQLITE:
            cursor.execute("SELECT google_client_id FROM districts WHERE slug='local'")
        else:
            cursor.execute("SELECT google_client_id FROM districts WHERE slug='local'")
        row = cursor.fetchone()
        if row and row[0]:
            client_id = row[0]
        cursor.close()
        conn.close()
    except Exception:
        app.logger.warning("Failed to fetch district settings for SSO")

    if not client_id:
        return "Google SSO is not configured. Please contact an administrator.", 500

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(16)
    session['oauth_state'] = state
    
    # Construct redirect URL
    params = {
        'client_id': client_id,
        'redirect_uri': OAUTH_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'prompt': 'select_account'
    }
    
    import urllib.parse
    query_string = urllib.parse.urlencode(params)
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{query_string}"
    
    return redirect(auth_url)


@app.route('/auth/apple')
def apple_auth():
    """Placeholder for Apple Sign-In. Returns setup guidance if not configured."""
    client_id = os.getenv('APPLE_CLIENT_ID')
    team_id = os.getenv('APPLE_TEAM_ID')
    key_id = os.getenv('APPLE_KEY_ID')
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT apple_client_id, apple_team_id, apple_key_id FROM districts WHERE slug='local'")
        row = cursor.fetchone()
        if row:
            client_id = row[0] or client_id
            team_id = row[1] or team_id
            key_id = row[2] or key_id
        cursor.close()
        conn.close()
    except Exception:
        app.logger.warning('Failed to fetch Apple SSO settings from DB')
    if not (client_id and team_id and key_id):
        return (
            jsonify({
                'error': 'Apple Sign-In not configured',
                'message': 'Set APPLE_CLIENT_ID, APPLE_TEAM_ID, and APPLE_KEY_ID to enable Apple SSO.'
            }),
            501,
        )
    return (
        jsonify({
            'error': 'Apple Sign-In flow not yet implemented',
            'message': 'Backend support is stubbed; implement the OAuth flow to enable.'
        }),
        501,
    )


@app.route('/auth/microsoft')
def microsoft_auth():
    """Placeholder for Microsoft Sign-In. Returns setup guidance if not configured."""
    client_id = os.getenv('MICROSOFT_CLIENT_ID')
    tenant_id = os.getenv('MICROSOFT_TENANT_ID')
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT microsoft_client_id, microsoft_tenant_id FROM districts WHERE slug='local'")
        row = cursor.fetchone()
        if row:
            client_id = row[0] or client_id
            tenant_id = row[1] or tenant_id
        cursor.close()
        conn.close()
    except Exception:
        app.logger.warning('Failed to fetch Microsoft SSO settings from DB')
    if not (client_id and tenant_id):
        return (
            jsonify({
                'error': 'Microsoft Sign-In not configured',
                'message': 'Set MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID to enable Microsoft SSO.'
            }),
            501,
        )
    return (
        jsonify({
            'error': 'Microsoft Sign-In flow not yet implemented',
            'message': 'Backend support is stubbed; implement the OAuth flow to enable.'
        }),
        501,
    )


@app.route('/authorize')
def authorize():
    """Handle Google OAuth callback with dynamic credentials."""
    # Verify state
    state = session.pop('oauth_state', None)
    if not state or state != request.args.get('state'):
        return 'Invalid state parameter', 400
        
    code = request.args.get('code')
    if not code:
        return 'Missing authorization code', 400

    # Fetch credentials again
    client_id = os.getenv('GOOGLE_CLIENT_ID')
    client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
    allowed_domain_setting = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        if USE_SQLITE:
            # Note: Fetching using index 0,1,2 for safety if row factory varies
            cursor.execute("SELECT google_client_id, google_client_secret, allowed_domain FROM districts WHERE slug='local'")
        else:
            cursor.execute("SELECT google_client_id, google_client_secret, allowed_domain FROM districts WHERE slug='local'")
        row = cursor.fetchone()
        if row:
            # Prioritize DB creds if present
            if row[0]: client_id = row[0]
            if row[1]: client_secret = row[1]
            allowed_domain_setting = row[2]
        cursor.close()
        conn.close()
    except Exception:
         app.logger.warning("Failed to fetch district settings for SSO callback")

    if not client_id or not client_secret:
        return 'SSO configuration missing', 500

    # Exchange code for token
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': OAUTH_REDIRECT_URI,
        'grant_type': 'authorization_code'
    }
    
    try:
        res = requests.post(token_url, data=token_data)
        res.raise_for_status()
        tokens = res.json()
        id_token_jwt = tokens.get('id_token')
        
        # Verify ID Token
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests
        
        id_info = id_token.verify_oauth2_token(
            id_token_jwt, 
            google_requests.Request(), 
            client_id
        )
        
        email = id_info.get('email')
        if not email:
            return "Email not found in token", 400
            
        # Domain Restriction Check
        if allowed_domain_setting:
            # Allow multiple domains comma separated if needed, or single
            allowed = [d.strip().lower() for d in allowed_domain_setting.split(',')]
            user_domain = email.split('@')[-1].lower()
            if user_domain not in allowed:
                return f"Access restricted. Please sign in with an account from: {allowed_domain_setting}", 403

        # Create/Update user in DB
        ensure_users_schema()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Upsert user
        if USE_SQLITE:
            cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
            existing = cursor.fetchone()
            if existing: # Update
                cursor.execute('UPDATE users SET name = ?, last_login = CURRENT_TIMESTAMP WHERE email = ?',
                             (id_info.get('name', ''), email))
            else: # Insert
                cursor.execute('INSERT INTO users (email, name, role) VALUES (?, ?, ?)',
                             (email, id_info.get('name', ''), 'staff'))
        else:
            cursor.execute('''
                INSERT INTO users (email, name, role) 
                VALUES (%s, %s, 'staff')
                ON CONFLICT (email) DO UPDATE 
                SET name = EXCLUDED.name, last_login = NOW()
            ''', (email, id_info.get('name', '')))
            
        conn.commit()
        
        session['user'] = {'email': email, 'name': id_info.get('name', '')}
        session.permanent = True
        
        cursor.close()
        conn.close()
        
        return redirect('/')
        
    except Exception as e:
        app.logger.error(f"SSO Error: {str(e)}")
        return f"Authentication failed: {str(e)}", 500


# -----------------------
# Application Requests (Authenticated)
# -----------------------


@app.route('/api/requests', methods=['POST'])
def create_app_request():
    """Allow authenticated users to submit app requests."""
    user = session.get('user') or {}
    requester_email = (user.get('email') or '').strip().lower()
    if not requester_email:
        return jsonify({'error': 'Please sign in to submit a request'}), 401

    data = request.get_json() or {}
    app_name = (data.get('name') or '').strip()
    company = (data.get('company') or '').strip()
    url_val = (data.get('url') or '').strip()
    notes = (data.get('notes') or '').strip()
    district_slug = (data.get('district_slug') or 'local').strip().lower() or 'local'
    honeypot = (data.get('phone_check') or '').strip()

    if honeypot:
        return jsonify({'success': True}), 200

    if not app_name:
        return jsonify({'error': 'App name is required'}), 400

    ensure_app_requests_schema()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            '''INSERT INTO app_requests (district_slug, app_name, company, url, notes, requester_email)
               VALUES (%s, %s, %s, %s, %s, %s)''',
            (district_slug, app_name, company or None, url_val or None, notes or None, requester_email),
        )
        conn.commit()
        return jsonify({'success': True})
    except Exception as exc:
        if conn:
            conn.rollback()
        app.logger.error('Failed to record app request: %s', exc)
        return jsonify({'error': 'Unable to submit request'}), 500
    finally:
        cursor.close()
        conn.close()


# -----------------------
# Admin Functions
# -----------------------

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session or 'email' not in session['user']:
            return jsonify({'error': 'Authentication required'}), 401
        
        email = session['user']['email']
        # Check hardcoded list first
        if email in ADMIN_EMAILS:
            return f(*args, **kwargs)

        # Check database role
        conn = get_db_connection()
        cursor = conn.cursor()
        is_admin = False
        try:
            # Check if user has admin role
            if USE_SQLITE:
                cursor.execute("SELECT 1 FROM district_users WHERE email=? AND role='admin'", (email,))
            else:
                cursor.execute("SELECT 1 FROM district_users WHERE email=%s AND role='admin'", (email,))
            
            if cursor.fetchone():
                is_admin = True
        except Exception as e:
            app.logger.error(f"Error checking admin role: {e}")
        finally:
            cursor.close()
            conn.close()

        if not is_admin:
            return jsonify({'error': 'Admin access required'}), 403
            
        return f(*args, **kwargs)
    return decorated_function


def is_admin_email(email: str) -> bool:
    """Check if the provided email has admin privileges."""
    if not email:
        return False
    if email in ADMIN_EMAILS:
        return True
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM district_users WHERE email=? AND role='admin' LIMIT 1" if USE_SQLITE else
            "SELECT 1 FROM district_users WHERE email=%s AND role='admin' LIMIT 1",
            (email,)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return bool(row)
    except Exception:
        return False


def require_session_user_json():
    """Return (user, error_response) ensuring a logged-in user for API calls."""
    user = session.get('user')
    if not user or not user.get('email'):
        return None, (jsonify({'error': 'Authentication required'}), 401)
    return user, None

# Application statuses
STATUSES = [
    'Pending',
    'Not Supported by District',
    'Approved for Use',
    'Use Alternate',
    'Core Tool',
    'Supplemental Tool',
    'Reviewed & Denied',
]

# SOPPA compliance statuses
SOPPA_STATUSES = [
    'Compliant',
    'Staff use only',
    'Not applicable',
    'Unknown',
    'Policies are SOPPA compliant',
    'Not fully SOPPA compliant',
    'Noncompliant',
    'Parent consent required',
]

def _contact_row_to_dict(row):
    def _dt_to_str(val):
        try:
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            return str(val) if val is not None else None
        except Exception:
            return None

    return {
        'id': row[0],
        'app_id': row[1],
        'name': row[2] or '',
        'email': row[3] or '',
        'phone': row[4] or '',
        'role': row[5] or '',
        'notes': row[6] or '',
        'is_primary': bool(row[7]),
        'tags': row[8] or '',
        'created_at': _dt_to_str(row[9]),
        'updated_at': _dt_to_str(row[10]),
    }


def _validate_contact_payload(data, require_email: bool = True):
    errors = []
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    role = (data.get('role') or '').strip()
    notes = (data.get('notes') or '').strip()
    tags = (data.get('tags') or '').strip()
    is_primary = bool(data.get('is_primary'))
    if not name:
        errors.append('Name is required')
    if require_email and not email:
        errors.append('Email is required')
    return errors, {
        'name': name,
        'email': email,
        'phone': phone,
        'role': role,
        'notes': notes,
        'tags': tags,
        'is_primary': is_primary,
    }


@app.route('/api/admin/apps/<int:app_id>/contacts', methods=['GET', 'POST'])
@admin_required
def api_vendor_contacts(app_id: int):
    ensure_vendor_contacts_schema()
    conn = get_db_connection()
    cursor = conn.cursor()

    # Confirm app exists
    cursor.execute(
        'SELECT id, name FROM apps WHERE id=?' if USE_SQLITE else 'SELECT id, name FROM apps WHERE id=%s',
        (app_id,),
    )
    app_row = cursor.fetchone()
    if not app_row:
        cursor.close()
        conn.close()
        return jsonify({'error': 'App not found'}), 404

    if request.method == 'GET':
        cursor.execute(
            '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
               FROM vendor_contacts WHERE app_id=? ORDER BY is_primary DESC, name ASC'''
            if USE_SQLITE else
            '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
               FROM vendor_contacts WHERE app_id=%s ORDER BY is_primary DESC, name ASC''',
            (app_id,),
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({'contacts': [_contact_row_to_dict(r) for r in rows]})

    # POST create
    payload = request.get_json() or {}
    csrf_token = payload.get('csrf_token')
    if not validate_csrf(csrf_token):
        cursor.close()
        conn.close()
        return jsonify({'error': 'Invalid CSRF token'}), 403

    errors, cleaned = _validate_contact_payload(payload)
    if errors:
        cursor.close()
        conn.close()
        return jsonify({'error': errors}), 400

    try:
        insert_sql = (
            '''INSERT INTO vendor_contacts (app_id, name, email, phone, role, notes, tags, is_primary)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)'''
            if USE_SQLITE else
            '''INSERT INTO vendor_contacts (app_id, name, email, phone, role, notes, tags, is_primary)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at'''
        )
        cursor.execute(
            insert_sql,
            (
                app_id,
                cleaned['name'],
                cleaned['email'],
                cleaned['phone'],
                cleaned['role'],
                cleaned['notes'],
                cleaned['tags'],
                cleaned['is_primary'],
            ),
        )
        conn.commit()
        if USE_SQLITE:
            cursor.execute(
                '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
                   FROM vendor_contacts WHERE rowid = last_insert_rowid()'''
            )
            new_row = cursor.fetchone()
        else:
            new_row = cursor.fetchone()
        record_app_activity(
            action='update',
            app_id=app_id,
            app_name=app_row[1],
            user_email=session.get('user', {}).get('email'),
            details={'vendor_contact_created': cleaned['email']},
        )
        return jsonify({'contact': _contact_row_to_dict(new_row)}), 201
    except Exception as exc:
        conn.rollback()
        # For SQLite, unique errors surface as generic IntegrityError
        if 'UNIQUE' in str(exc).upper():
            return jsonify({'error': 'Contact already exists for this app'}), 409
        app.logger.exception('Failed to create vendor contact')
        return jsonify({'error': 'Unable to create contact'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/contacts/<int:contact_id>', methods=['PUT', 'DELETE'])
@admin_required
def api_vendor_contact_detail(contact_id: int):
    ensure_vendor_contacts_schema()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
          '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
              FROM vendor_contacts WHERE id=?'''
          if USE_SQLITE else
          '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
              FROM vendor_contacts WHERE id=%s''',
          (contact_id,),
    )
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        return jsonify({'error': 'Contact not found'}), 404

    app_id = row[1]
    cursor.execute(
        'SELECT name FROM apps WHERE id=?' if USE_SQLITE else 'SELECT name FROM apps WHERE id=%s',
        (app_id,),
    )
    app_row = cursor.fetchone()
    app_name = app_row[0] if app_row else ''

    if request.method == 'DELETE':
        payload = request.get_json() or {}
        csrf_token = payload.get('csrf_token')
        if not validate_csrf(csrf_token):
            cursor.close()
            conn.close()
            return jsonify({'error': 'Invalid CSRF token'}), 403
        cursor.execute(
            'DELETE FROM vendor_contacts WHERE id=?' if USE_SQLITE else 'DELETE FROM vendor_contacts WHERE id=%s',
            (contact_id,),
        )
        conn.commit()
        record_app_activity(
            action='update',
            app_id=app_id,
            app_name=app_name,
            user_email=session.get('user', {}).get('email'),
            details={'vendor_contact_deleted': row[3]},
        )
        cursor.close()
        conn.close()
        return jsonify({'success': True})

    # PUT
    payload = request.get_json() or {}
    csrf_token = payload.get('csrf_token')
    if not validate_csrf(csrf_token):
        cursor.close()
        conn.close()
        return jsonify({'error': 'Invalid CSRF token'}), 403

    errors, cleaned = _validate_contact_payload(payload, require_email=False)
    if errors:
        cursor.close()
        conn.close()
        return jsonify({'error': errors}), 400

    try:
        update_sql = (
            '''UPDATE vendor_contacts
               SET name=?, email=?, phone=?, role=?, notes=?, tags=?, is_primary=?, updated_at=CURRENT_TIMESTAMP
               WHERE id=?'''
            if USE_SQLITE else
            '''UPDATE vendor_contacts
               SET name=%s, email=%s, phone=%s, role=%s, notes=%s, tags=%s, is_primary=%s, updated_at=NOW()
               WHERE id=%s
               RETURNING id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at'''
        )
        cursor.execute(
            update_sql,
            (
                cleaned['name'] or row[2],
                cleaned['email'] or row[3],
                cleaned['phone'],
                cleaned['role'],
                cleaned['notes'],
                cleaned['tags'],
                cleaned['is_primary'],
                contact_id,
            ),
        )
        conn.commit()
        if USE_SQLITE:
            cursor.execute(
                '''SELECT id, app_id, name, email, phone, role, notes, is_primary, tags, created_at, updated_at
                   FROM vendor_contacts WHERE id=?''',
                (contact_id,),
            )
            updated = cursor.fetchone()
        else:
            updated = cursor.fetchone()
        record_app_activity(
            action='update',
            app_id=app_id,
            app_name=app_name,
            user_email=session.get('user', {}).get('email'),
            details={'vendor_contact_updated': cleaned['email'] or row[3]},
        )
        cursor.close()
        conn.close()
        return jsonify({'contact': _contact_row_to_dict(updated)})
    except Exception as exc:
        conn.rollback()
        if 'UNIQUE' in str(exc).upper():
            return jsonify({'error': 'Contact already exists for this app'}), 409
        app.logger.exception('Failed to update vendor contact')
        return jsonify({'error': 'Unable to update contact'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/admin/apps')
@admin_required
def api_admin_apps():
    """Return a lightweight list of all apps for admin UI consumers."""
    ensure_vendor_contacts_schema()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT a.id,
                   a.name,
                   a.company,
                   a.status,
                   a.soppa_compliant,
                   a.product_visibility,
                   COALESCE(vc.count_contacts, 0) AS contact_count
            FROM apps a
            LEFT JOIN (
                SELECT app_id, COUNT(1) AS count_contacts
                FROM vendor_contacts
                GROUP BY app_id
            ) vc ON vc.app_id = a.id
            ORDER BY a.name ASC
            """
        )
        rows = cursor.fetchall()
        apps = [
            {
                'id': row[0],
                'name': row[1] or '',
                'company': row[2] or '',
                'status': row[3] or '',
                'soppa_compliant': row[4] or '',
                'product_visibility': bool(row[5]),
                'contact_count': row[6] or 0,
            }
            for row in rows
        ]
        return jsonify({'apps': apps})
    except Exception:
        app.logger.exception('Failed to load apps for API')
        return jsonify({'error': 'Unable to load apps'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/admin/invoices/<path:filename>')
@admin_required
def serve_invoice(filename):
    """Serve invoice files only to authenticated admins (with path traversal protection)."""
    from flask import send_from_directory
    
    # Extract just the filename from full paths (handles /static/documents/file.pdf or /documents/file.pdf)
    # This provides backward compatibility with old database records
    filename = Path(filename).name
    if not filename:
        abort(404)
    
    # Ensure the filename is safe
    safe_name = secure_filename(filename)
    if not safe_name:
        abort(403)
    
    # Resolve paths to prevent path traversal attacks
    upload_root = Path(app.config['UPLOAD_FOLDER']).resolve()
    target_path = (upload_root / safe_name).resolve()
    
    # Ensure resolved path is inside the upload folder
    try:
        target_path.relative_to(upload_root)
    except ValueError:
        app.logger.warning(f"Attempted path traversal access: {filename}")
        abort(403)
    
    # Check if file exists
    if not target_path.exists():
        abort(404)
    
    # Serve the file
    return send_from_directory(str(upload_root), safe_name)

@app.route('/admin/apps/<int:app_id>/upload-invoice', methods=['POST'])
@admin_required
def upload_invoice(app_id: int):
    """Upload invoice files to an existing app (admin only)."""
    if 'files' not in request.files and 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No files provided'}), 400
    
    # Support both 'files' (multiple) and 'file' (single)
    files = request.files.getlist('files') or request.files.getlist('file')
    if not files or not files[0].filename:
        return jsonify({'success': False, 'error': 'No files selected'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verify app exists
        cursor.execute("SELECT invoices FROM apps WHERE id=%s", (app_id,))
        result = cursor.fetchone()
        if not result:
            return jsonify({'success': False, 'error': 'App not found'}), 404
        
        # Get current invoices
        current_invoices = result[0] or ''
        invoice_list = [inv.strip() for inv in current_invoices.split(',') if inv.strip()]
        
        # Upload each file
        uploaded_paths = []
        for file in files:
            if file and allowed_file(file.filename):
                uploaded_path = save_uploaded_file(file, prefix='invoice')
                if uploaded_path:
                    invoice_list.append(uploaded_path)
                    uploaded_paths.append(uploaded_path)
        
        if not uploaded_paths:
            return jsonify({'success': False, 'error': 'No valid files uploaded'}), 400
        
        # Update database
        new_invoices = ','.join(invoice_list)
        cursor.execute("UPDATE apps SET invoices=%s WHERE id=%s", (new_invoices, app_id))
        conn.commit()
        
        return jsonify({
            'success': True,
            'uploaded': uploaded_paths,
            'all_invoices': invoice_list
        })
        
    except Exception as e:
        conn.rollback()
        app.logger.exception("Error uploading invoices")
        return jsonify({'success': False, 'error': 'Upload failed'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/apps/<int:app_id>/delete-invoice', methods=['POST'])
@admin_required
def delete_invoice(app_id: int):
    """Delete a specific invoice file from an app (admin only, with CSRF protection)."""
    data = request.get_json() or {}
    invoice_path = (data.get('invoice_path') or '').strip()
    csrf_token = data.get('csrf_token')
    
    # Validate CSRF token
    if not validate_csrf(csrf_token):
        return jsonify({'success': False, 'error': 'Invalid CSRF token'}), 403
    
    if not invoice_path:
        return jsonify({'success': False, 'error': 'No invoice path provided'}), 400
    
    # Extract just the filename for comparison
    filename = Path(invoice_path).name
    if not filename:
        return jsonify({'success': False, 'error': 'Invalid invoice filename'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get current invoices from database
        cursor.execute("SELECT invoices FROM apps WHERE id=%s", (app_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({'success': False, 'error': 'App not found'}), 404
        
        current_invoices = result[0] or ''
        invoice_list = [inv.strip() for inv in current_invoices.split(',') if inv.strip()]
        
        # Match by basename to tolerate different stored path formats
        matched = [inv for inv in invoice_list if Path(inv).name == filename]
        if not matched:
            return jsonify({'success': False, 'error': 'Invoice not associated with this app'}), 403
        
        # Remove matched entries
        invoice_list = [inv for inv in invoice_list if Path(inv).name != filename]
        
        # Update database with remaining invoices
        new_invoices = ','.join(invoice_list)
        cursor.execute("UPDATE apps SET invoices=%s WHERE id=%s", (new_invoices, app_id))
        conn.commit()
        
        # Delete the physical file if it exists (with path traversal protection)
        upload_root = Path(app.config['UPLOAD_FOLDER']).resolve()
        safe_name = secure_filename(filename)
        target = (upload_root / safe_name).resolve()
        
        # Ensure resolved path is inside upload folder
        try:
            target.relative_to(upload_root)
            if target.exists():
                try:
                    target.unlink()
                except Exception as e:
                    app.logger.error(f"Error deleting file {target}: {str(e)}")
        except ValueError:
            app.logger.warning(f"Refusing to delete file outside upload folder: {target}")
        
        return jsonify({'success': True})
            
    except Exception as e:
        conn.rollback()
        app.logger.exception("Error deleting invoice")
        return jsonify({'success': False, 'error': 'Internal error'}), 500
    finally:
        cursor.close()
        conn.close()


# -------------------------------------------------------------------
# SETUP / FIRST RUN ENDPOINTS
# -------------------------------------------------------------------

@app.route('/api/setup/status')
def setup_status():
    """Check if the application is already set up."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(1) FROM districts")
        district_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(1) FROM users")
        user_count = cursor.fetchone()[0]
        
        # If we have a district and a user, setup is complete
        is_setup = (district_count > 0 and user_count > 0)
        
        # If setup is done, return the district slug
        redirect_slug = None
        if is_setup:
            cursor.execute("SELECT slug FROM districts LIMIT 1")
            row = cursor.fetchone()
            if row:
                redirect_slug = row[0]
                
        return jsonify({
            'is_setup': is_setup,
            'redirect_slug': redirect_slug
        })
    except Exception:
        app.logger.exception("Error checking setup status")
        return jsonify({'error': 'Internal error'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/setup/init', methods=['POST'])
def setup_init():
    """Initialize the application: create admin and district."""
    data = request.get_json() or {}
    
    admin_email = data.get('admin_email', '').strip().lower()
    admin_password = data.get('admin_password', '').strip()
    admin_name = data.get('admin_name', '').strip()
    district_name = data.get('district_name', '').strip()
    district_slug = data.get('district_slug', '').strip().lower()
    
    if not all([admin_email, admin_password, district_name, district_slug]):
        return jsonify({'error': 'All fields are required'}), 400
        
    # Basic slug validation
    if not re.match(r'^[a-z0-9-]+$', district_slug):
         return jsonify({'error': 'Invalid slug format. Use lowercase letters, numbers, and dashes.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Ensure district doesn't already exist to prevent duplicate setup
        cursor.execute("SELECT COUNT(1) FROM districts")
        if cursor.fetchone()[0] > 0:
             cursor.close()
             conn.close()
             return jsonify({'error': 'Setup already complete. Cannot re-initialize.'}), 403

        # Create district
        if USE_SQLITE:
            cursor.execute(
                "INSERT INTO districts (name, slug, contact_email, created_by_email) VALUES (?, ?, ?, ?)",
                (district_name, district_slug, admin_email, admin_email)
            )
            district_id = cursor.lastrowid
        else:
            cursor.execute(
                "INSERT INTO districts (name, slug, contact_email, created_by_email) VALUES (%s, %s, %s, %s) RETURNING id",
                (district_name, district_slug, admin_email, admin_email)
            )
            district_id = cursor.fetchone()[0]
        
        # 3. Create Password User (for local auth)
        pw_hash = generate_password_hash(admin_password)
        
        # Simple UPSERT for both (Postgres 9.5+, SQLite 3.24+)
        cursor.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s) ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name",
            (admin_email, admin_name, pw_hash)
        )
        
        # Assign admin role
        cursor.execute(
            "INSERT INTO district_users (district_id, email, role, name) VALUES (%s, %s, 'admin', %s)",
            (district_id, admin_email, admin_name)
        )

        conn.commit()
        return jsonify({'success': True, 'slug': district_slug})

    except Exception:
        conn.rollback()
        app.logger.exception("Setup initialization failed")
        return jsonify({'error': 'Setup failed. Please check logs.'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/districts/<slug>', methods=['GET'])
def get_district(slug):
    """Get district info by slug."""
    try:
        ensure_districts_schema()
        ensure_default_district()
        ensure_default_admin()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        select_cols = (
            "id, name, slug, contact_email, created_at, logo_url, primary_color, accent_color, allowed_domain, "
            "google_client_id, google_client_secret, "
            "apple_client_id, apple_team_id, apple_key_id, apple_private_key, "
            "microsoft_client_id, microsoft_tenant_id, microsoft_client_secret"
        )

        if USE_SQLITE:
            cursor.execute(
                f'''SELECT {select_cols} FROM districts WHERE slug = ?''',
                (slug,),
            )
        else:
            cursor.execute(
                f'''SELECT {select_cols} FROM districts WHERE slug = %s''',
                (slug,),
            )
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not row:
            return jsonify({'error': 'District not found'}), 404
        
        created_at_value = row[4]
        if hasattr(created_at_value, "isoformat"):
            created_at_value = created_at_value.isoformat()
        
        # Determine appropriate row access method
        import sqlite3
        is_sqlite_row = isinstance(row, sqlite3.Row)
        
        # Security: Mask the client secret
        client_secret = row['google_client_secret'] if is_sqlite_row else row[10]
        apple_private_key = row['apple_private_key'] if is_sqlite_row else row[14]
        ms_client_secret = row['microsoft_client_secret'] if is_sqlite_row else row[17]

        masked_secret = '********' if client_secret else None
        masked_apple_key = '********' if apple_private_key else None
        masked_ms_secret = '********' if ms_client_secret else None

        return jsonify({
            'id': row['id'] if is_sqlite_row else row[0],
            'name': row['name'] if is_sqlite_row else row[1],
            'slug': row['slug'] if is_sqlite_row else row[2],
            'contact_email': row['contact_email'] if is_sqlite_row else row[3],
            'created_at': created_at_value,
            'logo_url': row['logo_url'] if is_sqlite_row else row[5],
            'primary_color': row['primary_color'] if is_sqlite_row else row[6],
            'accent_color': row['accent_color'] if is_sqlite_row else row[7],
            'allowed_domain': row['allowed_domain'] if is_sqlite_row else row[8],
            'google_client_id': row['google_client_id'] if is_sqlite_row else row[9],
            'google_client_secret': masked_secret,
            'apple_client_id': row['apple_client_id'] if is_sqlite_row else row[11],
            'apple_team_id': row['apple_team_id'] if is_sqlite_row else row[12],
            'apple_key_id': row['apple_key_id'] if is_sqlite_row else row[13],
            'apple_private_key': masked_apple_key,
            'microsoft_client_id': row['microsoft_client_id'] if is_sqlite_row else row[15],
            'microsoft_tenant_id': row['microsoft_tenant_id'] if is_sqlite_row else row[16],
            'microsoft_client_secret': masked_ms_secret,
        }), 200
    
    except Exception as e:
        app.logger.error(f'Error getting district: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/districts/<slug>', methods=['PUT'])
@admin_required
def update_district(slug):
    """Update district settings."""
    try:
        data = request.get_json()
        name = data.get('display_name') or data.get('name')
        primary_color = data.get('primary_color')
        accent_color = data.get('accent_color')
        allowed_domain = data.get('allowed_domain')
        
        # SSO Credentials
        google_client_id = data.get('google_client_id')
        google_client_secret = data.get('google_client_secret')
        apple_client_id = data.get('apple_client_id')
        apple_team_id = data.get('apple_team_id')
        apple_key_id = data.get('apple_key_id')
        apple_private_key = data.get('apple_private_key')
        microsoft_client_id = data.get('microsoft_client_id')
        microsoft_tenant_id = data.get('microsoft_tenant_id')
        microsoft_client_secret = data.get('microsoft_client_secret')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Build dynamic query based on whether secret is provided (don't overwrite with blank if not changing)
        update_fields = [
            "name = COALESCE(?, name)",
            "primary_color = ?",
            "accent_color = ?",
            "allowed_domain = ?",
            "google_client_id = ?",
            "apple_client_id = ?",
            "apple_team_id = ?",
            "apple_key_id = ?",
            "microsoft_client_id = ?",
            "microsoft_tenant_id = ?"
        ]
        params = [
            name,
            primary_color,
            accent_color,
            allowed_domain,
            google_client_id,
            apple_client_id,
            apple_team_id,
            apple_key_id,
            microsoft_client_id,
            microsoft_tenant_id,
        ]
        
        # Only update secret if provided and not masked
        if google_client_secret and google_client_secret != '********':
            update_fields.append("google_client_secret = ?")
            params.append(google_client_secret)

        if apple_private_key and apple_private_key != '********':
            update_fields.append("apple_private_key = ?")
            params.append(apple_private_key)

        if microsoft_client_secret and microsoft_client_secret != '********':
            update_fields.append("microsoft_client_secret = ?")
            params.append(microsoft_client_secret)
            
        params.append(slug)
        
        query_sql = f'''
            UPDATE districts 
            SET {', '.join(update_fields)}
            WHERE slug = ?
        '''
        
        if not USE_SQLITE:
            # Convert ? to %s for Postgres
            query_sql = query_sql.replace('?', '%s')
            
        cursor.execute(query_sql, tuple(params))
            
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        app.logger.error(f'Error updating district: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/districts/<slug>/apps', methods=['GET'])
def api_district_apps(slug):
    """Return all apps (single-tenant application)."""
    try:
        ensure_default_district()
        init_db()  # Ensure tables exist before querying
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, name, company, status, soppa_compliant, product_visibility, product_link, tags, privacy_link, otherdocs
                   FROM apps ORDER BY name ASC"""
        )
        rows = cursor.fetchall()
        apps = []
        for r in rows:
            apps.append({
                'id': r[0],
                'name': r[1] or '',
                'company': r[2] or '',
                'status': r[3] or '',
                'soppa_compliant': r[4] or '',
                'product_visibility': bool(r[5]),
                'product_link': r[6] or '',
                'tags': r[7] or '',
                'ndpa_path': normalize_doc_path(r[8] or ''),
                'exhibit_e_path': normalize_doc_path(r[9] or ''),
            })
        cursor.close()
        conn.close()
        return jsonify(apps)
    except Exception as exc:
        app.logger.error('Failed to load district apps: %s', exc)
        return jsonify({'error': 'Unable to load apps'}), 500


@app.route('/api/districts/<slug>/apps', methods=['POST'])
def api_create_district_app(slug):
    """Create a new app (admin only)."""
    user, error_resp = require_session_user_json()
    if error_resp:
        return error_resp
    if not is_admin_email(user.get('email')):
        return jsonify({'error': 'Admin privileges required'}), 403

    init_db()
    # Accept JSON or form-encoded / multipart payloads
    data = request.get_json(silent=True) or {}
    if not data and request.form:
        data = request.form.to_dict()
    name = (data.get('name') or '').strip()
    company = (data.get('company') or '').strip()
    status = (data.get('status') or 'Pending').strip() or 'Pending'
    soppa = (data.get('soppa_compliant') or '').strip()
    privacy_link = (data.get('privacy_link') or '').strip() or ''
    otherdocs = (data.get('otherdocs') or '').strip()
    product_link = (data.get('product_link') or '').strip()
    tags = (data.get('tags') or '').strip()
    notes = (data.get('notes') or '').strip()
    product_visibility = 1 if str(data.get('product_visibility', '1')).lower() in ('1', 'true', 'yes', 'on') else 0

    # File uploads (ndpa, exhibit_e, logo)
    ndpa_file = request.files.get('ndpa')
    if ndpa_file and ndpa_file.filename:
        uploaded = save_uploaded_file(ndpa_file, prefix='ndpa')
        if uploaded:
            privacy_link = uploaded

    exhibit_e_file = request.files.get('exhibit_e')
    if exhibit_e_file and exhibit_e_file.filename:
        uploaded = save_uploaded_file(exhibit_e_file, prefix='exhibit_e')
        if uploaded:
            otherdocs = uploaded

    logo_file = request.files.get('logo')
    if logo_file and logo_file.filename:
        uploaded = save_uploaded_file(logo_file, prefix='logo', include_static_prefix=False)
        if uploaded:
            product_link = uploaded

    if not name:
        return jsonify({'error': 'Name is required'}), 400

    # Enforce allowed status values; default to Pending if invalid
    allowed_statuses = {
        'Pending', 'Not Supported by District', 'Approved for Use', 'Use Alternate',
        'Core Tool', 'Supplemental Tool', 'Reviewed & Denied'
    }
    if status not in allowed_statuses:
        status = 'Pending'

    # soppa_compliant is optional; set to None if empty or invalid to satisfy CHECK constraint
    allowed_soppa = {
        'Compliant', 'Staff use only', 'Not applicable', 'Unknown',
        'Policies are SOPPA compliant', 'Not fully SOPPA compliant',
        'Noncompliant', 'Parent consent required'
    }
    if not soppa or soppa not in allowed_soppa:
        soppa = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO apps (name, unique_id, notes, company, privacy_link, soppa_compliant, otherdocs, invoices, status, tags, product_visibility, product_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                str(uuid.uuid4()),
                notes,
                company,
                privacy_link,
                soppa,
                otherdocs,
                None,
                status,
                tags,
                product_visibility,
                product_link,
            ),
        )
        app_id = cursor.lastrowid
        conn.commit()
        cursor.close()
        conn.close()

        record_app_activity('create', app_id=app_id, app_name=name, user_email=user.get('email'), details={'status': status, 'company': company})

        return jsonify({
            'success': True,
            'app': {
                'id': app_id,
                'name': name,
                'company': company,
                'status': status,
                'soppa_compliant': soppa,
                'product_visibility': bool(product_visibility),
                'product_link': product_link,
                'tags': tags,
                'notes': notes,
            }
        }), 201
    except Exception as exc:
        if 'conn' in locals():
            try:
                conn.rollback()
            except Exception:
                pass
        app.logger.error('Failed to create app via API: %s', exc)
        return jsonify({'error': 'Unable to create app'}), 500


@app.route('/api/districts/<slug>/apps/<int:app_id>', methods=['PUT', 'DELETE'])
def api_update_delete_app(slug, app_id):
    """Update or delete an app (admin only)."""
    user, error_resp = require_session_user_json()
    if error_resp:
        return error_resp
    if not is_admin_email(user.get('email')):
        return jsonify({'error': 'Admin privileges required'}), 403

    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    if request.method == 'DELETE':
        try:
            cursor.execute(
                "SELECT name, company, status FROM apps WHERE id = ?",
                (app_id,),
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                conn.close()
                return jsonify({'error': 'App not found'}), 404

            cursor.execute("DELETE FROM apps WHERE id = ?", (app_id,))
            conn.commit()
            cursor.close()
            conn.close()
            record_app_activity(
                'delete',
                app_id=app_id,
                app_name=row[0],
                user_email=user.get('email'),
                details={'status': row[2], 'company': row[1]},
            )
            return jsonify({'success': True})
        except Exception as exc:
            conn.rollback()
            cursor.close()
            conn.close()
            app.logger.error('Failed to delete app: %s', exc)
            return jsonify({'error': 'Unable to delete app'}), 500

    # PUT
    try:
        # Load current state for logging
        cursor.execute(
            "SELECT name, company, status, soppa_compliant, privacy_link, product_link, tags, notes, product_visibility, otherdocs FROM apps WHERE id = ?",
            (app_id,),
        )
        before_row = cursor.fetchone()
        if not before_row:
            cursor.close()
            conn.close()
            return jsonify({'error': 'App not found'}), 404

        payload = request.form if request.form else request.get_json() or {}
        name = (payload.get('name') or '').strip()
        status = (payload.get('status') or '').strip()
        company = (payload.get('company') or '').strip()
        soppa = (payload.get('soppa_compliant') or '').strip()
        privacy_link = (payload.get('privacy_link') or '').strip()
        product_link = (payload.get('product_link') or '').strip()
        tags = (payload.get('tags') or '').strip()
        notes = (payload.get('notes') or '').strip()
        product_visibility = payload.get('product_visibility')
        if isinstance(product_visibility, str):
            product_visibility = 1 if product_visibility.lower() in ('1', 'true', 'yes', 'on') else 0

        # File uploads (ndpa, exhibit_e, logo)
        ndpa_file = request.files.get('ndpa') if hasattr(request, 'files') else None
        exhibit_e_file = request.files.get('exhibit_e') if hasattr(request, 'files') else None
        logo_file = request.files.get('logo') if hasattr(request, 'files') else None
        if ndpa_file and ndpa_file.filename:
            uploaded = save_uploaded_file(ndpa_file, prefix='ndpa')
            if uploaded:
                privacy_link = uploaded
        if exhibit_e_file and exhibit_e_file.filename:
            uploaded = save_uploaded_file(exhibit_e_file, prefix='exhibit_e')
            if uploaded:
                # Store in otherdocs field to mirror create behavior
                payload = dict(payload)
                payload['otherdocs'] = uploaded
        if logo_file and logo_file.filename:
            uploaded = save_uploaded_file(logo_file, prefix='logo', include_static_prefix=False)
            if uploaded:
                product_link = uploaded

        otherdocs = (payload.get('otherdocs') or '').strip()

        cursor.execute(
            """
            UPDATE apps
            SET name = COALESCE(?, name),
                status = COALESCE(?, status),
                company = COALESCE(?, company),
                soppa_compliant = COALESCE(?, soppa_compliant),
                privacy_link = COALESCE(?, privacy_link),
                product_link = COALESCE(?, product_link),
                tags = COALESCE(?, tags),
                notes = COALESCE(?, notes),
                otherdocs = COALESCE(?, otherdocs)
                {visibility_clause}
            WHERE id = ?
            """.format(visibility_clause=", product_visibility = ?" if product_visibility is not None else ""),
            tuple([
                name or None,
                status or None,
                company or None,
                soppa or None,
                privacy_link or None,
                product_link or None,
                tags or None,
                notes or None,
                otherdocs or None,
            ] + ([product_visibility] if product_visibility is not None else []) + [app_id])
        )
        conn.commit()

        # Fetch updated state for logging
        cursor.execute(
            "SELECT name, company, status, soppa_compliant, privacy_link, product_link, tags, notes, product_visibility, otherdocs FROM apps WHERE id = ?",
            (app_id,),
        )
        after_row = cursor.fetchone()
        cursor.close()
        conn.close()

        def row_to_dict(row):
            return {
                'name': row[0],
                'company': row[1],
                'status': row[2],
                'soppa_compliant': row[3],
                'privacy_link': normalize_doc_path(row[4]) if row[4] else row[4],
                'product_link': row[5],
                'tags': row[6],
                'notes': row[7],
                'product_visibility': bool(row[8]) if row[8] is not None else None,
                'otherdocs': normalize_doc_path(row[9]) if row[9] else row[9],
            }

        record_app_activity(
            'update',
            app_id=app_id,
            app_name=after_row[0],
            user_email=user.get('email'),
            details={'before': row_to_dict(before_row), 'after': row_to_dict(after_row)},
        )
        return jsonify({'success': True})
    except Exception as exc:
        conn.rollback()
        cursor.close()
        conn.close()
        app.logger.error('Failed to update app: %s', exc)
        return jsonify({'error': 'Unable to update app'}), 500


@app.route('/api/districts/<slug>/users', methods=['GET', 'POST'])
def api_district_users(slug):
    """List or add users (single-tenant application)."""
    user, error_resp = require_session_user_json()
    if error_resp:
        return error_resp

    email = (user.get('email') or '').lower()
    is_admin = is_admin_email(email)

    # All authenticated users can read; only admins can mutate
    if request.method == 'GET':
        try:
            ensure_district_users_schema()
            ensure_users_schema()
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute(
                "SELECT id FROM districts WHERE slug = ?" if USE_SQLITE else "SELECT id FROM districts WHERE slug = %s",
                (slug,)
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                conn.close()
                return jsonify({'users': []})

            cursor.execute(
                """
                SELECT du.email,
                       COALESCE(du.name, u.name, '') AS name,
                       du.role,
                       COALESCE(du.created_at, u.created_at) AS created_at
                FROM district_users du
                JOIN districts d ON d.id = du.district_id
                LEFT JOIN users u ON u.email = du.email
                WHERE d.slug = ?
                ORDER BY LOWER(du.email)
                """ if USE_SQLITE else """
                SELECT du.email,
                       COALESCE(du.name, u.name, '') AS name,
                       du.role,
                       COALESCE(du.created_at, u.created_at) AS created_at
                FROM district_users du
                JOIN districts d ON d.id = du.district_id
                LEFT JOIN users u ON u.email = du.email
                WHERE d.slug = %s
                ORDER BY LOWER(du.email)
                """,
                (slug,)
            )
            rows = cursor.fetchall()
            users = []
            for r in rows:
                users.append({
                    'email': r[0],
                    'name': r[1] or '',
                    'role': r[2] or 'staff',
                    'created_at': r[3] if r[3] else '',
                })

            cursor.close()
            conn.close()
            return jsonify({'users': users})
        except Exception as exc:
            app.logger.error('Failed to load district users: %s', exc)
            return jsonify({'error': 'Unable to load users'}), 500

    # POST -> add/update user (admin only)
    if not is_admin:
        return jsonify({'error': 'Admin privileges required'}), 403

    data = request.get_json() or {}
    invite_email = (data.get('email') or '').strip().lower()
    invite_role = (data.get('role') or 'staff').strip().lower()
    invite_name = (data.get('name') or '').strip() or invite_email.split('@')[0]

    if not invite_email or '@' not in invite_email:
        return jsonify({'error': 'Valid email is required'}), 400
    if invite_role not in ('admin', 'staff'):
        return jsonify({'error': 'Role must be admin or staff'}), 400

    try:
        ensure_districts_schema()
        ensure_district_users_schema()
        ensure_users_schema()
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id FROM districts WHERE slug = ?" if USE_SQLITE else "SELECT id FROM districts WHERE slug = %s",
            (slug,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            return jsonify({'error': 'District not found'}), 404
        district_id = row[0]

        # Ensure user record exists with a placeholder password
        cursor.execute(
            "SELECT id FROM users WHERE email = ?" if USE_SQLITE else "SELECT id FROM users WHERE email = %s",
            (invite_email,)
        )
        user_row = cursor.fetchone()
        if not user_row:
            placeholder_pw = generate_password_hash(secrets.token_urlsafe(12))
            cursor.execute(
                "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)" if USE_SQLITE else
                "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s)",
                (invite_email, invite_name, placeholder_pw),
            )

        # Upsert into district_users
        if USE_SQLITE:
            cursor.execute(
                """
                INSERT INTO district_users (district_id, email, role, name)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(district_id, email) DO UPDATE SET role=excluded.role, name=excluded.name
                """,
                (district_id, invite_email, invite_role, invite_name),
            )
        else:
            cursor.execute(
                """
                INSERT INTO district_users (district_id, email, role, name)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (district_id, email) DO UPDATE SET role=EXCLUDED.role, name=EXCLUDED.name
                """,
                (district_id, invite_email, invite_role, invite_name),
            )

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as exc:
        if 'conn' in locals():
            try:
                conn.rollback()
            except Exception:
                pass
        app.logger.error('Failed to add district user: %s', exc)
        return jsonify({'error': 'Unable to add user'}), 500


@app.route('/api/districts/<slug>/logo', methods=['POST'])
@admin_required
def upload_district_logo(slug):
    """Upload district logo."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename):
        filename = secure_filename(f"logo_{slug}_{uuid.uuid4().hex[:8]}.{file.filename.rsplit('.', 1)[1].lower()}")
        
        # Ensure directory exists
        upload_path = os.path.join(app.root_path, 'static', 'global_apps') # Reusing existing volume
        os.makedirs(upload_path, exist_ok=True)
        
        file.save(os.path.join(upload_path, filename))
        logo_url = f"/static/global_apps/{filename}"
        
        # Update DB
        conn = get_db_connection()
        cursor = conn.cursor()
        if USE_SQLITE:
            cursor.execute("UPDATE districts SET logo_url = ? WHERE slug = ?", (logo_url, slug))
        else:
            cursor.execute("UPDATE districts SET logo_url = %s WHERE slug = %s", (logo_url, slug))
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'logo_path': logo_url})
        
    return jsonify({'error': 'Invalid file type'}), 400


if __name__ == '__main__':
    init_db()  # Initialize database schema
    host = os.getenv('HOST', '127.0.0.1')
    port = int(os.getenv('PORT', os.getenv('FLASK_RUN_PORT', '5000')))
    app.run(host=host, port=port, debug=True)
