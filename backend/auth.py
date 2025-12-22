"""
Authentication and Authorization Utilities
JWT token generation, password hashing, and user verification
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_users_collection, get_login_history_collection
from models import UserInDB, UserResponse
import os
import hashlib


# Security configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

security = HTTPBearer()


def _prepare_password(password: str) -> str:
    """Prepare password for bcrypt by ensuring it's under 72 bytes"""
    # Bcrypt has a 72-byte limit. For long passwords, hash them first
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        # Use SHA256 to hash long passwords first, then use the hex digest
        return hashlib.sha256(password_bytes).hexdigest()
    return password


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hashed password"""
    try:
        prepared_password = _prepare_password(plain_password)
        return bcrypt.checkpw(prepared_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        print(f"Password verification error: {e}")
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    try:
        prepared_password = _prepare_password(password)
        # Generate salt and hash the password
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(prepared_password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    except Exception as e:
        print(f"Password hashing error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password hashing failed"
        )


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserResponse:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    users_collection = get_users_collection()
    user = await users_collection.find_one({"email": email})
    
    if user is None:
        raise credentials_exception
    
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return UserResponse(
        id=str(user["_id"]),
        username=user["username"],
        email=user["email"],
        full_name=user.get("full_name"),
        is_active=user.get("is_active", True),
        created_at=user.get("created_at", datetime.utcnow()),
        last_login=user.get("last_login")
    )


async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[UserResponse]:
    """Get current user if authenticated, otherwise None"""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def record_login_history(user_id: str, email: str, ip_address: Optional[str] = None, 
                               user_agent: Optional[str] = None, success: bool = True):
    """Record user login attempt in history"""
    login_history_collection = get_login_history_collection()
    
    login_record = {
        "user_id": user_id,
        "email": email,
        "login_time": datetime.utcnow(),
        "ip_address": ip_address,
        "user_agent": user_agent,
        "success": success
    }
    
    await login_history_collection.insert_one(login_record)
