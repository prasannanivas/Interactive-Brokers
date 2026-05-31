from pymongo import MongoClient
import datetime

uri = 'mongodb+srv://Prasanna:3H41Al0q5Uvz976s@db-mongodb-sfo2-83953-82c5177a.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-sfo2-83953&tls=true&authSource=admin'
client = MongoClient(uri, serverSelectionTimeoutMS=10000)
db = client['trading_monitor']
col = db['daily_signal_snapshots']

# Get all snapshot dates
all_snaps = list(col.find({}, projection={'snapshot_date': 1, 'signals.symbol': 1}).sort('snapshot_date', 1))
print(f'Total snapshots: {len(all_snaps)}')

# Check each snapshot for CADUSD vs USDCAD
cadusd_dates = []
usdcad_dates = []
for snap in all_snaps:
    symbols = [s['symbol'] for s in snap.get('signals', [])]
    if 'C:CADUSD' in symbols:
        cadusd_dates.append(snap['snapshot_date'])
    if 'C:USDCAD' in symbols:
        usdcad_dates.append(snap['snapshot_date'])

print(f'\nC:CADUSD snapshots: {len(cadusd_dates)}')
if cadusd_dates:
    print(f'  First: {cadusd_dates[0]}')
    print(f'  Last:  {cadusd_dates[-1]}')

print(f'\nC:USDCAD snapshots: {len(usdcad_dates)}')
if usdcad_dates:
    print(f'  First: {usdcad_dates[0]}')
    print(f'  Last:  {usdcad_dates[-1]}')

# Check snapshots around the transition
print('\n--- Snapshot dates around Sep 2025 ---')
for snap in all_snaps:
    d = snap['snapshot_date']
    if datetime.datetime(2025, 9, 1) <= d <= datetime.datetime(2025, 9, 30):
        symbols = [s['symbol'] for s in snap.get('signals', [])]
        cad = [s for s in symbols if 'CAD' in s]
        print(f'  {d.date()}: CAD symbols = {cad}')
