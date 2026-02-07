"""
BIS (Bank for International Settlements) SDMX API Data Fetcher
Fetches central bank policy rates for major currencies
"""

import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import requests
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

# Mapping of currency to BIS reference area codes
CURRENCY_TO_REF_AREA = {
    'USD': 'US',      # United States
    'EUR': 'XM',      # Euro area
    'JPY': 'JP',      # Japan
    'GBP': 'GB',      # United Kingdom
    'CAD': 'CA',      # Canada
    'AUD': 'AU',      # Australia
}

# Mapping to country names
REF_AREA_TO_COUNTRY = {
    'US': 'United States',
    'XM': 'Euro Area',
    'JP': 'Japan',
    'GB': 'United Kingdom',
    'CA': 'Canada',
    'AU': 'Australia',
}


class BISDataFetcher:
    """Fetches central bank policy rates from BIS SDMX API"""
    
    def __init__(self):
        self.base_url = "https://stats.bis.org/api/v1"
        self.cache: Dict[str, tuple] = {}  # {ref_area: (data, timestamp)}
        self.cache_ttl = timedelta(hours=12)  # Cache for 12 hours (BIS updates weekly)
    
    def fetch_cbpol(self, ref_area: str, freq: str = "D", start: str = "2020-01-01", end: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch central bank policy rate data using requests library
        
        Args:
            ref_area: 'US', 'XM', 'JP', 'GB', 'CA', 'AU'
            freq: 'D' (daily) or 'M' (monthly)
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD), defaults to today
        
        Returns:
            DataFrame with columns: time, value, ref_area, freq
        """
        try:
            # Build URL
            flow = f"BIS,WS_CBPOL_{freq},1.0"
            key = f"{freq}.{ref_area}"
            url = f"{self.base_url}/data/{flow}/{key}/all"
            
            params = {
                "startPeriod": start,
                "detail": "full"
            }
            if end:
                params["endPeriod"] = end
            
            logger.info(f"Fetching BIS data from {url}")
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            # Parse SDMX-ML XML
            root = ET.fromstring(response.content)
            
            # Define namespaces for SDMX 2.1
            namespaces = {
                'message': 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message',
                'generic': 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic',
                'common': 'http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common'
            }
            
            # Extract observations
            data = []
            
            # Try to find observations in the generic dataset
            for obs in root.findall('.//generic:Obs', namespaces):
                time_val = None
                obs_val = None
                
                # Get time period
                for dim in obs.findall('.//generic:ObsDimension', namespaces):
                    if dim.get('id') == 'TIME_PERIOD':
                        time_val = dim.get('value')
                
                # Also try ObsKey for older formats
                if not time_val:
                    for obskey in obs.findall('.//generic:ObsKey/generic:Value', namespaces):
                        if obskey.get('id') == 'TIME_PERIOD':
                            time_val = obskey.get('value')
                
                # Get observation value
                obsvalue = obs.find('.//generic:ObsValue', namespaces)
                if obsvalue is not None:
                    try:
                        obs_val = float(obsvalue.get('value'))
                    except (ValueError, TypeError):
                        pass
                
                if time_val and obs_val is not None:
                    data.append({'time': time_val, 'value': obs_val})
            
            if not data:
                logger.warning(f"No data found for {ref_area}")
                return pd.DataFrame(columns=['time', 'value', 'ref_area', 'freq'])
            
            df = pd.DataFrame(data)
            df['time'] = pd.to_datetime(df['time'])
            df['ref_area'] = ref_area
            df['freq'] = freq
            
            return df.sort_values('time')
        
        except Exception as e:
            logger.error(f"Error fetching data with requests: {e}")
            raise
    
    def get_latest_rates(self, use_cache: bool = True) -> List[Dict]:
        """
        Get latest central bank policy rates for all major currencies
        Falls back to static data if BIS API is unavailable
        
        Returns:
            List of dicts with format matching the existing JSON structure:
            {
                "Country": str,
                "Category": "Interest Rate",
                "DateTime": str (ISO format),
                "Value": float,
                "Frequency": "Daily",
                "HistoricalDataSymbol": str,
                "LastUpdate": str (ISO format)
            }
        """
        result = []
        current_time = datetime.now().isoformat()
        
        for currency, ref_area in CURRENCY_TO_REF_AREA.items():
            try:
                # Check cache
                if use_cache and ref_area in self.cache:
                    cached_data, cached_time = self.cache[ref_area]
                    if datetime.now() - cached_time < self.cache_ttl:
                        logger.info(f"Using cached data for {ref_area}")
                        result.extend(cached_data)
                        continue
                
                # Fetch last 365 days of data (not future dates)
                start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
                df = self.fetch_cbpol(ref_area, freq="D", start=start_date)
                
                if df.empty:
                    logger.warning(f"No data available for {ref_area}, loading from fallback")
                    # Try loading from static JSON if available
                    fallback_data = self._load_static_fallback(ref_area)
                    if fallback_data:
                        result.append(fallback_data)
                        self.cache[ref_area] = ([fallback_data], datetime.now())
                    continue
                
                # Get the latest value
                latest_row = df.iloc[-1]
                
                entry = {
                    "Country": REF_AREA_TO_COUNTRY.get(ref_area, ref_area),
                    "Category": "Interest Rate",
                    "DateTime": latest_row['time'].strftime('%Y-%m-%dT%H:%M:%S'),
                    "Value": float(latest_row['value']),
                    "Frequency": "Daily",
                    "HistoricalDataSymbol": currency,
                    "LastUpdate": current_time
                }
                
                result.append(entry)
                
                # Cache the result
                self.cache[ref_area] = ([entry], datetime.now())
                
            except Exception as e:
                logger.error(f"Failed to fetch data for {currency} ({ref_area}): {e}")
                # Try loading from static JSON if available
                try:
                    fallback_data = self._load_static_fallback(ref_area)
                    if fallback_data:
                        result.append(fallback_data)
                        self.cache[ref_area] = ([fallback_data], datetime.now())
                except Exception as fallback_error:
                    logger.error(f"Fallback also failed for {ref_area}: {fallback_error}")
                continue
        
        return result
    
    def _load_static_fallback(self, ref_area: str) -> Optional[Dict]:
        """Load interest rate from static JSON as fallback"""
        try:
            import json
            import os
            
            # Path to static JSON file
            json_path = os.path.join(
                os.path.dirname(__file__),
                '..',
                'frontend',
                'public',
                'bond',
                'curr_central_bank_int_rate.json'
            )
            
            if not os.path.exists(json_path):
                return None
            
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            country_name = REF_AREA_TO_COUNTRY.get(ref_area)
            if not country_name:
                return None
            
            # Find the latest entry for this country
            country_data = [d for d in data if d.get('Country') == country_name]
            if not country_data:
                return None
            
            # Sort by date and get latest
            country_data.sort(key=lambda x: x.get('DateTime', ''), reverse=True)
            return country_data[0]
            
        except Exception as e:
            logger.error(f"Failed to load static fallback for {ref_area}: {e}")
            return None
    
    def get_historical_rates(self, ref_area: str, days: int = 365) -> List[Dict]:
        """
        Get historical rates for a specific country
        
        Args:
            ref_area: BIS reference area code ('US', 'XM', 'JP', 'GB', 'CA', 'AU')
            days: Number of days of history to fetch
        
        Returns:
            List of dicts with time series data
        """
        try:
            start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
            df = self.fetch_cbpol(ref_area, freq="D", start=start_date)
            
            if df.empty:
                return []
            
            result = []
            country_name = REF_AREA_TO_COUNTRY.get(ref_area, ref_area)
            
            for _, row in df.iterrows():
                result.append({
                    "Country": country_name,
                    "Category": "Interest Rate",
                    "DateTime": row['time'].strftime('%Y-%m-%dT%H:%M:%S'),
                    "Value": float(row['value']),
                    "Frequency": "Daily",
                    "HistoricalDataSymbol": ref_area,
                    "LastUpdate": datetime.now().isoformat()
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Failed to fetch historical data for {ref_area}: {e}")
            return []


# Global instance
_bis_fetcher = None

def get_bis_fetcher() -> BISDataFetcher:
    """Get or create global BIS data fetcher instance"""
    global _bis_fetcher
    if _bis_fetcher is None:
        _bis_fetcher = BISDataFetcher()
    return _bis_fetcher
