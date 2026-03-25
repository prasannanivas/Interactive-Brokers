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
    username: str = Field(..., max_length=50)
    email: EmailStr
    password: str
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


class LoginHistoryResponse(BaseModel):
    """Login history response for API"""
    user_id: str
    email: str
    login_time: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool


# Password Reset Models
class PasswordResetRequest(BaseModel):
    """Request password reset"""
    email: EmailStr


class PasswordResetToken(BaseModel):
    """Password reset token stored in database"""
    email: EmailStr
    token: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    used: bool = False


class PasswordReset(BaseModel):
    """Reset password with token"""
    token: str
    new_password: str


class PasswordChange(BaseModel):
    """Change password for authenticated user"""
    old_password: str
    new_password: str


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
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


class RSIIndicator(BaseModel):
    """RSI indicator values"""
    rsi_value: float
    period: int = 9
    signal: Optional[str] = None  # "BUY" or "SELL"
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


class SMAIndicator(BaseModel):
    """SMA indicator values"""
    sma_value: float
    period: int
    current_price: Optional[float] = None
    signal: Optional[str] = None  # "BUY" or "SELL" for 50 period only
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


class MACrossoverIndicator(BaseModel):
    """MA Crossover indicator values"""
    fast_ema: float  # 9 day EMA
    slow_ema: float  # 21 day EMA
    signal: Optional[str] = None  # "BUY" or "SELL"
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


class MACDIndicator(BaseModel):
    """MACD indicator values"""
    macd_line: float  # 12 EMA
    signal_line: float  # 26 EMA
    histogram: float  # 9 EMA of difference
    signal: Optional[str] = None  # "BUY" or "SELL"
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


class EMAIndicator(BaseModel):
    """EMA indicator values"""
    ema_value: float
    period: int
    current_price: float
    signal: Optional[str] = None  # "BUY" or "SELL"
    signal_timestamp: Optional[datetime] = None  # When the signal was generated


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


class WeeklyIndicators(BaseModel):
    """All weekly timeframe indicators"""
    ema_20: Optional[EMAIndicator] = None


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
    weekly_indicators: Optional[WeeklyIndicators] = None
    
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


# Daily Signal Snapshot Model
class DailySignalSnapshot(BaseModel):
    """Daily snapshot of all trading signals captured at 5pm EST"""
    snapshot_date: datetime = Field(default_factory=datetime.utcnow)
    capture_timestamp: datetime = Field(default_factory=datetime.utcnow)
    total_symbols: int
    bullish_count: int  # Number of symbols with net bullish signals
    bearish_count: int  # Number of symbols with net bearish signals
    neutral_count: int  # Number of symbols with neutral signals
    signals: List[Dict[str, Any]] = []  # List of all symbol signal data
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class DailySymbolSignal(BaseModel):
    """Individual symbol signal data for daily snapshot"""
    symbol: str
    last_price: Optional[float] = None
    signal_type: str  # "BULLISH", "BEARISH", or "NEUTRAL"
    signal_strength: int  # Net count of buy signals - sell signals
    buy_signals: List[str] = []  # List of indicator names that generated BUY
    sell_signals: List[str] = []  # List of indicator names that generated SELL
    daily_indicators: Optional[Dict[str, Any]] = None
    hourly_indicators: Optional[Dict[str, Any]] = None
    weekly_indicators: Optional[Dict[str, Any]] = None


# Bond Yield Models
class BondYield(BaseModel):
    """Bond yield data stored in MongoDB - One document per country+maturity with historical data array"""
    country: str  # e.g., "United States", "Canada", "Japan"
    symbol: str  # e.g., "USGG10YR:IND", "USGG2YR:IND"
    maturity: str  # "10y" or "2y"
    last_available_date: datetime  # Most recent date in the data array
    last_updated: datetime  # When this document was last updated
    record_count: int  # Number of records in the data array
    data: list  # Array of {date, date_obj, open, high, low, close}
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class BondYieldCreate(BaseModel):
    """Model for creating/updating bond yield records"""
    country: str
    symbol: str
    maturity: str
    date: str  # Format: "DD/MM/YYYY"
    open: float
    high: float
    low: float
    close: float


# Interest Rate Models
class InterestRate(BaseModel):
    """Interest rate data stored in MongoDB - One document per country with historical data array"""
    country: str  # e.g., "United States", "Canada", "Japan"
    category: str = "Interest Rate"
    historical_data_symbol: str = ""  # e.g., "FDTR"
    frequency: str = "Daily"
    last_available_date: datetime  # Most recent date in the data array
    last_updated: datetime  # When this document was last updated
    record_count: int  # Number of records in the data array
    data: list  # Array of {date_time, date_obj, value, last_update}
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class InterestRateCreate(BaseModel):
    """Model for creating/updating interest rate records"""
    country: str
    date_time: str  # Format: "2026-03-18T00:00:00"
    value: float  # Interest rate percentage
    frequency: str = "Daily"
    historical_data_symbol: str = ""
    last_update: str = ""


# Data Fetch Tracker Model
    """Track the last fetch date for each country/data_type"""
    country: str
    data_type: str  # "interest_rate", "bond_10y", "bond_2y"
    last_fetch_date: datetime
    last_available_date: datetime  # Last date in the data
    total_records: int
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
