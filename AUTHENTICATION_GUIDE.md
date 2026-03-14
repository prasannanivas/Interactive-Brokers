# Authentication System Guide

## Overview

The application now has a complete user authentication system with:
- User registration and login
- JWT-based authentication
- Password reset functionality
- Login history tracking
- Secure password hashing with bcrypt

## Database Schema

### Users Collection
```javascript
{
  "_id": ObjectId,
  "username": String (unique),
  "email": String (unique),
  "hashed_password": String,
  "full_name": String (optional),
  "is_active": Boolean (default: true),
  "created_at": DateTime,
  "last_login": DateTime (optional)
}
```

### Login History Collection
```javascript
{
  "_id": ObjectId,
  "user_id": String,
  "email": String,
  "login_time": DateTime,
  "ip_address": String (optional),
  "user_agent": String (optional),
  "success": Boolean
}
```

### Password Reset Tokens Collection
```javascript
{
  "_id": ObjectId,
  "email": String,
  "token": String (unique),
  "created_at": DateTime,
  "expires_at": DateTime,
  "used": Boolean (default: false)
}
```

## API Endpoints

### 1. Register New User
**POST** `/api/auth/register`

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123",
  "full_name": "John Doe" // optional
}
```

**Response:**
```json
{
  "id": "user_id",
  "username": "johndoe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "created_at": "2026-03-15T10:00:00",
  "last_login": null
}
```

**Status Codes:**
- `200`: Success
- `400`: Email already registered or username taken

### 2. Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": "user_id",
    "username": "johndoe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "is_active": true,
    "created_at": "2026-03-15T10:00:00",
    "last_login": "2026-03-15T12:00:00"
  }
}
```

**Status Codes:**
- `200`: Success
- `401`: Incorrect email or password
- `403`: Account is inactive

### 3. Get Current User
**GET** `/api/auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": "user_id",
  "username": "johndoe",
  "email": "john@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "created_at": "2026-03-15T10:00:00",
  "last_login": "2026-03-15T12:00:00"
}
```

### 4. Request Password Reset
**POST** `/api/auth/request-password-reset`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "message": "If this email is registered, you will receive a password reset link",
  "email": "john@example.com"
}
```

**Note:** Always returns success to prevent email enumeration. In production, an email with the reset token should be sent.

### 5. Reset Password
**POST** `/api/auth/reset-password`

**Request Body:**
```json
{
  "token": "secure_reset_token_here",
  "new_password": "newsecurepassword123"
}
```

**Response:**
```json
{
  "message": "Password successfully reset"
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid or expired reset token
- `404`: User not found

### 6. Change Password (Authenticated)
**POST** `/api/auth/change-password`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "old_password": "currentpassword123",
  "new_password": "newsecurepassword123"
}
```

**Response:**
```json
{
  "message": "Password successfully changed"
}
```

**Status Codes:**
- `200`: Success
- `400`: Current password is incorrect
- `404`: User not found

### 7. Get Login History
**GET** `/api/auth/login-history?limit=50`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `limit`: Number of records to return (default: 50)

**Response:**
```json
[
  {
    "_id": "record_id",
    "user_id": "user_id",
    "email": "john@example.com",
    "login_time": "2026-03-15T12:00:00",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "success": true
  }
]
```

## Security Features

### Password Hashing
- Uses bcrypt for password hashing
- Passwords longer than 72 bytes are hashed with SHA256 first
- Each password gets a unique salt

### JWT Tokens
- Tokens expire after 7 days (configurable)
- Algorithm: HS256
- Secret key stored in environment variable `JWT_SECRET_KEY`

### Password Reset Tokens
- Tokens are 32-byte URL-safe random strings
- Expire after 1 hour
- Can only be used once
- Old tokens are invalidated when requesting a new one

### Login History
- All login attempts (successful and failed) are recorded
- Tracks IP address and user agent
- Useful for security auditing

## Environment Variables

Add these to your `.env` file:

```env
JWT_SECRET_KEY=your-super-secret-key-change-this-in-production
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=trading_monitor
```

## Frontend Integration

### Storing the Token
After successful login, store the access token:

```javascript
// Store in localStorage or secure cookie
localStorage.setItem('access_token', response.data.access_token);
localStorage.setItem('user', JSON.stringify(response.data.user));
```

### Making Authenticated Requests
Include the token in the Authorization header:

```javascript
const token = localStorage.getItem('access_token');

fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### Logout
Simply remove the token from storage:

```javascript
localStorage.removeItem('access_token');
localStorage.removeItem('user');
```

## Migration from Hardcoded Users

The old `/api/auth/simple-login` endpoint with hardcoded users is now **DEPRECATED**. 

### Migration Steps:

1. **Create accounts for existing users:**
```bash
# Use the registration endpoint to create accounts
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Anatoli",
    "email": "Anatoli@gmail.com",
    "password": "choose_a_secure_password",
    "full_name": "Anatoli"
  }'
```

2. **Update frontend to use new login endpoint:**
   - Change from `/api/auth/simple-login` to `/api/auth/login`
   - Store the JWT token and user data

3. **Remove hardcoded credentials:**
   - After migration, the simple-login endpoint should be removed

## Database Indexes

The following indexes are automatically created for performance:

```javascript
// Users
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })

// Login History
db.login_history.createIndex({ user_id: 1, login_time: -1 })
db.login_history.createIndex({ login_time: 1 })

// Password Reset Tokens
db.password_reset_tokens.createIndex({ email: 1 })
db.password_reset_tokens.createIndex({ token: 1 }, { unique: true })
db.password_reset_tokens.createIndex({ expires_at: 1 })
db.password_reset_tokens.createIndex({ email: 1, used: 1, expires_at: -1 })
```

## Testing the API

### Test Registration
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### Test Protected Endpoint
```bash
TOKEN="your_token_here"
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Test Password Reset
```bash
# Request reset
curl -X POST http://localhost:8000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'

# Reset with token (check console for token)
curl -X POST http://localhost:8000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "token_from_console",
    "new_password": "newpassword123"
  }'
```

## Production Considerations

1. **Email Integration**: Implement email sending for password reset tokens
   - Use services like SendGrid, AWS SES, or Mailgun
   - Update the `/api/auth/request-password-reset` endpoint

2. **Security Headers**: Add security headers in production
   - HTTPS only
   - Set secure cookie flags
   - CORS configuration

3. **Rate Limiting**: Implement rate limiting for:
   - Login attempts
   - Password reset requests
   - Registration

4. **Token Refresh**: Consider implementing refresh tokens for better security

5. **Account Verification**: Add email verification for new registrations

6. **Two-Factor Authentication**: Consider adding 2FA for enhanced security

7. **Remove Development Features**:
   - Remove console.log of reset tokens
   - Remove simple-login endpoint
   - Use strong JWT secret key

## Troubleshooting

### "Could not validate credentials" error
- Token may have expired (7 days)
- Token may be invalid
- User account may be inactive

### "Email already registered"
- User with this email already exists
- Try password reset if you forgot the password

### "Invalid or expired reset token"
- Token has expired (1 hour limit)
- Token was already used
- Request a new reset token
