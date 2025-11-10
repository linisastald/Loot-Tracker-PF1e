# Password Reset Setup

## Overview
The password reset functionality has been added to the Pathfinder Loot Tracker. This allows users to reset their passwords by providing their username and email address.

## Setup Instructions

### 1. Install Dependencies
In the backend directory, install the new dependencies:
```bash
npm install
```

### 2. Apply Database Migration
Run the migration to create the password reset tokens table:

**Windows:**
```cmd
cd backend
apply_migration.bat
```

**Linux/Mac:**
```bash
cd backend
chmod +x apply_migration.sh
./apply_migration.sh
```

**Or manually with psql:**
```bash
psql -h localhost -U loot_user -d loot_tracking -f database/migrations/001_add_password_reset_tokens.sql
```

### 3. Configure Email Service
Edit the `.env` file in the backend directory and configure email settings:

**For Gmail:**
```env
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

**For Custom SMTP:**
```env
SMTP_HOST=your-smtp-host.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
EMAIL_FROM=noreply@yoursite.com
```

**Note:** For Gmail, you'll need to:
1. Enable 2-factor authentication
2. Generate an App Password (not your regular password)
3. Use the App Password in the EMAIL_PASS field

### 4. Update Frontend URL
Set the correct frontend URL in `.env`:
```env
FRONTEND_URL=http://your-domain.com
```

## How It Works

1. User clicks "Forgot Password?" on the login page
2. User enters their username and email address
3. System verifies both username and email match a user account
4. A secure reset token is generated and stored in the database (expires in 1 hour)
5. An email is sent with a password reset link
6. User clicks the link and enters a new password
7. Password is updated and the reset token is marked as used

## Security Features

- Requires both username AND email for password reset (prevents email-only attacks)
- Tokens expire after 1 hour
- Tokens are single-use only
- Generic success message regardless of whether user exists (prevents user enumeration)
- All old tokens for a user are deleted when a new reset is requested
- Password validation enforced on reset

## Testing

If email is not configured, the system will log a warning but still generate the token. Check the backend logs for the reset token during testing.

## API Endpoints

- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

## Frontend Routes

- `/forgot-password` - Password reset request form
- `/reset-password?token=<token>` - Password reset form
