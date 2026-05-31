from pymongo import MongoClient
import datetime

uri = 'mongodb+srv://Prasanna:3H41Al0q5Uvz976s@db-mongodb-sfo2-83953-82c5177a.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-sfo2-83953&tls=true&authSource=admin'
client = MongoClient(uri, serverSelectionTimeoutMS=10000)
db = client['trading_monitor']
col = db['daily_signal_snapshots']
docs = list(col.find({}, projection={'snapshot_date': 1}).sort('snapshot_date', 1))
dates = [d['snapshot_date'].date() for d in docs]
print('First 5 dates:', dates[:5])
print('Last 5 dates:', dates[-5:])
print('Total:', len(dates))

# Find gaps > 7 days
print('\nGaps > 7 days:')
for i in range(1, len(dates)):
    gap = (dates[i] - dates[i-1]).days
    if gap > 7:
        print(f'  GAP: {dates[i-1]} -> {dates[i]} ({gap} days missing)')

# Count snapshots by month
from collections import Counter
months = Counter((d.year, d.month) for d in dates)
print('\nSnapshots per month:')
for ym in sorted(months):
    print(f'  {ym[0]}-{ym[1]:02d}: {months[ym]} snapshots')
