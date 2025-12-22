"""
Pydantic Models for API and Database Operations
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, List, Any
from datetime import datetime
from bson import ObjectId


class PyObjectId(str):
    """Custom ObjectId type for Pydantic v2"""
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        from pydantic_core import core_schema
        return core_schema.union_schema([
            core_schema.is_instance_schema(ObjectId),
            core_schema.chain_schema([
                core_schema.str_schema(),
                core_schema.no_info_plain_validator_function(cls.validate),
            ])
        ])

    @classmethod
    def validate(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, str):
            if ObjectId.is_valid(v):
                return v
            raise ValueError("Invalid ObjectId")
        raise ValueError("Invalid ObjectId type")


# User Models
class UserCreate(BaseModel):
    """User registration model"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    """User login model"""
    email: EmailStr
    password: str


class UserInDB(BaseModel):
    """User stored in database"""
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    username: str
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    
    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True


class UserResponse(BaseModel):
    """User response model (without password)"""
    id: str
    username: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None


class Token(BaseModel):
    """JWT Token response"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Login History Model
class LoginHistory(BaseModel):
    """Login history record"""
    user_id: str
    email: str
    login_time: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool = True


# API Call History Model
class APICallLog(BaseModel):
    """API call logging model"""
    user_id: Optional[str] = None
    endpoint: str
    method: str
    status_code: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    duration_ms: Optional[float] = None
    ip_address: Optional[str] = None
    request_data: Optional[Dict[str, Any]] = None
    response_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# Signal Model
class SignalLog(BaseModel):
    """Trading signal record"""
    symbol: str
    signal_type: str  # "EMA_CROSS_ABOVE", "EMA_CROSS_BELOW", "RSI_OVERBOUGHT", etc.
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    price: float
    ema_200: Optional[float] = None
    rsi: Optional[float] = None
    macd: Optional[Dict[str, float]] = None
    details: Optional[Dict[str, Any]] = None


# Watchlist Change Model
class WatchlistChange(BaseModel):
    """Watchlist modification record"""
    symbol: str
    action: str  # "ADD" or "REMOVE"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    previous_data: Optional[Dict[str, Any]] = None


# Request/Response Models for API endpoints
class Symbol(BaseModel):
    """Symbol model"""
    symbol: str
    exchange: str = "SMART"
    currency: str = "USD"


class WatchlistItem(BaseModel):
    """Watchlist item model"""
    symbol: str
    exchange: str = "SMART"
    currency: str = "USD"


class AlgorithmConfig(BaseModel):
    """Algorithm configuration model"""
    enabled: bool
    rsi_overbought: float = 70
    rsi_oversold: float = 30
    macd_enabled: bool = True
    rsi_enabled: bool = True


class TelegramConfig(BaseModel):
    """Telegram bot configuration"""
    bot_token: str
    chat_id: str


# Indicator Models
class BollingerBandIndicator(BaseModel):
    """Bollinger Band indicator values"""
    upper_band: float
    middle_band: float  # EMA
    lower_band: float
    current_price: float
    signal: Optional[str] = None  # "BUY" or "SELL"


class RSIIndicator(BaseModel):
    """RSI indicator values"""
    rsi_value: float
    period: int = 9
    signal: Optional[str] = None  # "BUY" or "SELL"


class SMAIndicator(BaseModel):
    """SMA indicator values"""
    sma_value: float
    period: int
    current_price: Optional[float] = None
    signal: Optional[str] = None  # "BUY" or "SELL" for 50 period only


class MACrossoverIndicator(BaseModel):
    """MA Crossover indicator values"""
    fast_ema: float  # 9 day EMA
    slow_ema: float  # 21 day EMA
    signal: Optional[str] = None  # "BUY" or "SELL"


class MACDIndicator(BaseModel):
    """MACD indicator values"""
    macd_line: float  # 12 EMA
    signal_line: float  # 26 EMA
    histogram: float  # 9 EMA of difference
    signal: Optional[str] = None  # "BUY" or "SELL"


class EMAIndicator(BaseModel):
    """EMA indicator values"""
    ema_value: float
    period: int
    current_price: float
    signal: Optional[str] = None  # "BUY" or "SELL"


class DailyIndicators(BaseModel):
    """All daily timeframe indicators"""
    bollinger_band: Optional[BollingerBandIndicator] = None
    rsi_9: Optional[RSIIndicator] = None
    sma_9: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[SMAIndicator] = None
    sma_200: Optional[float] = None
    ma_crossover: Optional[MACrossoverIndicator] = None
    macd: Optional[MACDIndicator] = None


class HourlyIndicators(BaseModel):
    """All hourly timeframe indicators"""
    ema_100: Optional[EMAIndicator] = None


# Watchlist Storage Model (for MongoDB)
class WatchlistSymbol(BaseModel):
    """Watchlist symbol stored in DB with all indicators"""
    symbol: str
    exchange: str = "US"
    currency: str = "USD"
    sec_type: str = "FX"
    market_type: str = "forex"
    added_at: datetime = Field(default_factory=datetime.utcnow)
    last_price: Optional[float] = None
    last_updated: Optional[datetime] = None
    
    # Indicators
    daily_indicators: Optional[DailyIndicators] = None
    hourly_indicators: Optional[HourlyIndicators] = None
    
    # Overall signals
    buy_signals: List[str] = []  # List of indicator names that generated BUY
    sell_signals: List[str] = []  # List of indicator names that generated SELL


# Signal Batch Model (for backtesting)
class SignalBatch(BaseModel):
    """Batch of signals processed together"""
    batch_id: str  # e.g., "batch_46-60_20231211_143022"
    batch_range: str  # e.g., "46-60"
    total_symbols: int
    crossovers_detected: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    processing_time_ms: Optional[float] = None
    signals: List[Dict[str, Any]] = []  # List of signal details
    summary: Optional[Dict[str, Any]] = None
