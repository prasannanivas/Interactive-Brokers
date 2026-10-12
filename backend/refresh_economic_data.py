"""
Manual Economic Data Refresh Script
Fetches bond yields and interest rates

This script can be run manually or is automatically scheduled in app.py to run daily at 5 AM EST

Usage: python refresh_economic_data.py
"""

import subprocess
import sys
import os
from datetime import datetime

def main():
    print("=" * 70)
    print("📊 ECONOMIC DATA REFRESH")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}")
    print()
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    
    # Step 1: Fetch bond data (10Y yields)
    print("\n" + "=" * 70)
    print("📈 STEP 1/2: Fetching Bond Yields (10Y)")
    print("=" * 70)
    
    script1 = os.path.join(base_path, 'fetch_bond_data_tradingeconomics.py')
    result1 = subprocess.run([sys.executable, script1])
    
    if result1.returncode != 0:
        print("\n✗ Bond data fetch FAILED!")
        return False
    
    print("\n✓ Bond yields fetched successfully")
    
    # 2Y yields are no longer synthesized from 10Y (that produced fake data).
    # Real 2Y yields are fetched by ticker in fetch_incremental_bond_data.py.

    # Step 2: Fetch interest rates
    print("\n" + "=" * 70)
    print("🏦 STEP 2/2: Fetching Interest Rates")
    print("=" * 70)
    
    script3 = os.path.join(base_path, 'fetch_interest_rates_tradingeconomics.py')
    result3 = subprocess.run([sys.executable, script3])
    
    if result3.returncode != 0:
        print("\n✗ Interest rate fetch FAILED!")
        return False
    
    print("\n✓ Interest rates fetched successfully")
    
    # Summary
    print("\n" + "=" * 70)
    print("✓ ECONOMIC DATA REFRESH COMPLETE!")
    print("=" * 70)
    print(f"Completed: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}")
    print()
    print("Data updated:")
    print("  ✓ Bond yields (10Y) - US, UK, Germany, Japan, Canada, Australia")
    print("  ✓ Bond yields (2Y) - not generated here (real 2Y comes from fetch_incremental_bond_data.py)")
    print("  ✓ Interest rates - Central bank policy rates")
    print()
    print("Files location:")
    print(f"  Bonds: e:\\Interactive Brokers\\frontend\\public\\bond\\")
    print(f"  Rates: e:\\Interactive Brokers\\frontend\\public\\Interest rate\\")
    print("=" * 70)
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n✗ Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
