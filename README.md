# Alexandria Library

A single-tenant educational app library management system for managing and cataloging educational technology applications with privacy compliance tracking.

## Features

- **Admin Panel**: Manage apps, review staff requests, track activity logs, and manage users
- **Public App Library**: Browse apps with tags, SOPPA compliance statuses, and search functionality
- **File Management**: Upload and manage NDPA documents, Exhibit E forms, and invoices
- **Vendor Contacts**: Track vendor contact information for each application
- **Authentication**: Local password-based auth with optional SSO (Google, Apple, Microsoft)
- **Branding**: Customizable district logo, colors, and settings
- **Activity Logging**: Track all changes to applications with detailed audit trail

## Technology Stack

- **Backend**: Flask (Python)
- **Frontend**: React + TypeScript + Vite
- **Database**: SQLite (single file, no external database required)
- **Container**: Docker & Docker Compose for easy deployment
- **Styling**: Tailwind CSS + shadcn/ui components

## Quick Start

### Docker Deployment (Recommended)

1. Clone the repository
2. Edit `.env` and set required values:

   - `SECRET_KEY` - Flask session secret (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)
   - `DISTRICT_NAME` - Your organization name
   - `DISTRICT_CONTACT_EMAIL` - Admin contact email
   - `INIT_ADMIN_EMAIL` - Initial admin username (default: "admin")
   - `INIT_ADMIN_PASSWORD` - Initial admin password

3. Build and start:

   ```bash
   docker compose up --build -d
   ```

4. Access the application at `http://localhost:80`

## Configuration

### Environment Variables

- `SECRET_KEY` - **Required**. Flask session encryption key
- `DISTRICT_NAME` - Organization name (default: "Default District")
- `DISTRICT_CONTACT_EMAIL` - Contact email (default: "admin@example.com")
- `INIT_ADMIN_EMAIL` - Initial admin username (default: "admin")
- `INIT_ADMIN_PASSWORD` - Initial admin password
- `SQLITE_DB_PATH` - SQLite database location (default: `data/alexandria.db`)
- `PRODUCTION` - Set to "1" for production mode (enables HTTPS cookies)

### Optional SSO Configuration

Add these environment variables to enable SSO providers:

**Google OAuth:**

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

**Apple Sign-In:**

- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

**Microsoft OAuth:**

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_SECRET`

Alternatively, configure SSO settings through the admin panel after initial setup.

## Usage

### First-Time Setup

1. Access the application
2. Login with your admin credentials located in the .env file
3. Configure district settings in the admin panel

### Admin Functions

- **Apps Management**: Add, edit, and review applications
- **Staff Requests**: Review app requests submitted by staff
- **User Management**: Add admins and staff members
- **Activity Log**: View detailed history of all changes
- **Settings**: Configure branding, SSO, and domain restrictions

### File Uploads

The system supports uploading:

- **NDPA/Privacy Policies**: PDF or document files
- **Exhibit E Forms**: Additional compliance documents
- **Invoices**: Multiple invoice files per application (admin-only)
- **App Logos**: Image files for app branding

Upload limits: 16MB per file

**API Endpoints:**

- Upload invoices: `POST /admin/apps/<app_id>/upload-invoice`
- Delete invoices: `POST /admin/apps/<app_id>/delete-invoice`
- Upload district logo: `POST /api/districts/<slug>/logo`

### Public Catalog

Staff and visitors can:

- Browse approved applications
- Filter by status, tags, and SOPPA compliance
- Search by name or company
- Request new applications
- View app details and compliance documents

## Data Storage

- **Database**: `data/alexandria.db` (SQLite)
- **Uploaded Files**: `static/documents/` (NDPA, invoices, etc.)
- **District Logos**: `static/global_apps/`
- **Session Data**: `flask_session/`

All paths are persistent through Docker volumes.

## Security

- Session-based authentication with secure cookies
- CSRF protection on all state-changing operations
- Path traversal protection on file downloads
- Admin-only access to sensitive documents and operations
- Password hashing with Werkzeug
- Optional domain restriction for SSO

## Troubleshooting

**Cookies/Sessions not working:**

- Ensure `VITE_API_BASE_URL` in frontend matches Flask host
- Check that frontend and backend are on the same domain/port
- Set `PRODUCTION=1` if using HTTPS

**File uploads failing:**

- Check file size (max 16MB)
- Verify file extension is allowed
- Ensure `static/documents/` directory is writable

**Database locked errors:**

- SQLite doesn't support concurrent writes well
- Consider reducing simultaneous admin users
- Or migrate to PostgreSQL for high-concurrency deployments

## License

[Add your license here]

## Support

For issues or questions, contact your system administrator or file an issue in the project repository.
