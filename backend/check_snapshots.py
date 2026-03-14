import asyncio
from database import Database, get_daily_signal_snapshots_collection
from datetime import datetime, timedelta

async def check_snapshots():
    """Check daily signal snapshots"""
    # Connect to database
    await Database.connect_db()
    
    collection = get_daily_signal_snapshots_collection()
    
    # Get all snapshots from last 60 days
    snapshots = []
    async for doc in collection.find().sort('snapshot_date', -1).limit(60):
        snapshots.append({
            'date': doc['snapshot_date'].strftime('%Y-%m-%d'),
            'total': doc['total_symbols'],
            'bullish': doc['bullish_count'],
            'bearish': doc['bearish_count'],
            'neutral': doc['neutral_count']
        })
    
    print(f'Found {len(snapshots)} snapshots in database\n')
    
    if len(snapshots) == 0:
        print('⚠️  NO SNAPSHOTS FOUND!')
        print('Run: python capture_daily_signals.py')
        return
    
    print('Last 30 snapshots:')
    print('='*60)
    for i, s in enumerate(snapshots[:30], 1):
        print(f"{i:2}. {s['date']}: {s['total']:3} symbols (📈{s['bullish']:2} ➡️{s['neutral']:2} 📉{s['bearish']:2})")
    
    # Check for gaps
    print('\n\nChecking for date gaps...')
    print('='*60)
    
    if len(snapshots) > 1:
        dates = [datetime.strptime(s['date'], '%Y-%m-%d') for s in snapshots]
        dates.sort()
        
        gaps = []
        for i in range(len(dates) - 1):
            gap_days = (dates[i+1] - dates[i]).days - 1
            if gap_days > 0:
                gaps.append({
                    'after': dates[i].strftime('%Y-%m-%d'),
                    'before': dates[i+1].strftime('%Y-%m-%d'),
                    'missing_days': gap_days
                })
        
        if gaps:
            print(f'❌ Found {len(gaps)} gaps:')
            for gap in gaps:
                print(f"   Missing {gap['missing_days']} day(s) between {gap['after']} and {gap['before']}")
        else:
            print('✅ No gaps found - continuous data!')

if __name__ == '__main__':
    asyncio.run(check_snapshots())
