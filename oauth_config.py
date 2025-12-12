from functools import wraps
import os
from flask import redirect, url_for, session, request, current_app

def get_google_auth_config():
    """Return Google OAuth2 configuration."""
    return {
        'client_id': os.getenv('GOOGLE_CLIENT_ID'),
        'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
        'authorization_base_url': 'https://accounts.google.com/o/oauth2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'userinfo_url': 'https://www.googleapis.com/oauth2/v1/userinfo',
        'scope': ['openid', 'email', 'profile']
    }

def login_required(f):
    """Decorator to ensure user is logged in and has a valid email domain."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            current_app.logger.debug('User not in session, redirecting to login')
            return redirect(url_for('login', next=request.url))
        current_app.logger.debug(f'User {session.get("user", {}).get("email")} is authenticated')
        return f(*args, **kwargs)
    return decorated_function

def check_domain(email, allowed_domains=None):
    """Check if the email domain is in the allowed list."""
    if allowed_domains is None:
        allowed_domains = ['sd25.org']
        
    if not email or '@' not in email:
        current_app.logger.warning(f'Invalid email format: {email}')
        return False
        
    domain = email.split('@')[1].lower()
    is_allowed = domain in allowed_domains
    
    if not is_allowed:
        current_app.logger.warning(f'Access denied for domain: {domain}')
    else:
        current_app.logger.info(f'Access granted for domain: {domain}')
        
    return is_allowed
