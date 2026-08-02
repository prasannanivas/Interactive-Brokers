"""
Daily FX Report Downloader
Downloads Scotiabank's G10 FX Daily PDF report each morning, saves a dated
copy to disk, and records metadata in MongoDB so the frontend can list the
history and serve individual reports.
"""

import hashlib
import os
import requests
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import pytz

load_dotenv()

REPORT_URL = "https://scotiaequityresearch.com/FX/G10_FX_Daily.pdf"
REPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fx_reports")


class DailyFxReportDownloader:
    """Downloads and archives the Scotiabank G10 FX Daily report"""

    def __init__(self):
        self.mongodb_url = os.getenv('MONGODB_URL', 'mongodb://localhost:27017')
        self.db_name = os.getenv('MONGODB_DB_NAME', 'trading_monitor')
        self.client = None
        self.db = None
        self.est_tz = pytz.timezone('US/Eastern')

    async def connect(self):
        try:
            self.client = AsyncIOMotorClient(self.mongodb_url)
            await self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            print(f"✓ Connected to MongoDB at {self.mongodb_url}")
            return True
        except Exception as e:
            print(f"✗ MongoDB connection failed: {e}")
            return False

    async def disconnect(self):
        if self.client:
            self.client.close()
            print("✓ MongoDB connection closed")

    async def run(self):
        """
        Download today's report and store it.

        Returns:
            'downloaded' - a new report for today was saved
            'stale'      - the source URL hasn't been updated yet (still serving
                           a previous day's PDF) — caller should retry later
            'failed'     - request/content error — caller should retry later
        """
        report_date = datetime.now(self.est_tz).strftime('%Y-%m-%d')
        filename = f"G10_FX_Daily_{report_date.replace('-', '_')}.pdf"

        try:
            print(f"  📡 Fetching {REPORT_URL}...")
            response = requests.get(
                REPORT_URL,
                timeout=30,
                headers={'User-Agent': 'Mozilla/5.0'}
            )

            if response.status_code != 200 or not response.content:
                print(f"  ⚠ Download failed: HTTP {response.status_code}")
                return 'failed'

            content_type = response.headers.get('content-type', '')
            if 'pdf' not in content_type.lower():
                print(f"  ⚠ Unexpected content-type: {content_type}")
                return 'failed'

            content_hash = hashlib.sha256(response.content).hexdigest()

            # The source URL is static (no date in it) — if Scotiabank hasn't
            # published today's edition yet, it keeps serving the last one.
            # Compare against the most recently archived report's hash so we
            # don't mistake yesterday's PDF for today's.
            last_report = await self.db.fx_reports.find_one({}, sort=[('report_date', -1)])
            if last_report and last_report.get('content_hash') == content_hash and last_report.get('report_date') != report_date:
                print(f"  ⏳ Source still serving the {last_report['report_date']} report — not updated yet")
                return 'stale'

            os.makedirs(REPORTS_DIR, exist_ok=True)
            file_path = os.path.join(REPORTS_DIR, filename)
            with open(file_path, 'wb') as f:
                f.write(response.content)

            file_size = len(response.content)
            print(f"  💾 Saved {filename} ({file_size:,} bytes)")

            doc = {
                'report_date': report_date,
                'source': 'scotiabank_g10_fx_daily',
                'source_url': REPORT_URL,
                'filename': filename,
                'file_size': file_size,
                'content_hash': content_hash,
                'downloaded_at': datetime.now(pytz.utc),
            }

            await self.db.fx_reports.update_one(
                {'report_date': report_date},
                {'$set': doc},
                upsert=True
            )
            print(f"  ✓ Metadata saved for {report_date}")
            return 'downloaded'

        except Exception as e:
            print(f"  ❌ Error downloading FX report: {e}")
            return 'failed'


async def main():
    downloader = DailyFxReportDownloader()
    if await downloader.connect():
        await downloader.run()
        await downloader.disconnect()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
