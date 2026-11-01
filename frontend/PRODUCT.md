# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
A single trader or small team trading FX and macro. They keep the app open on a large desktop screen for hours, next to their broker terminal (Interactive Brokers). They use it to watch technical signals across a watchlist and act on them, with macro context (rates, bonds, calendar, reports) alongside.

## Product Purpose
A private trading signal monitor. It computes EMA/RSI/MACD and MA-cross signals across a watchlist (forex, stocks, crypto via Polygon/MASSIVE data) and layers in macro context: central-bank rates, 2y/10y bond yields and spreads, an economic calendar, FX research reports and backtests. Success means the trader sees state changes at a glance, without hunting, and trusts the numbers.

## Positioning
A personal cockpit that fuses technical signals with macro drivers (rate differentials, yield spreads, calendar events) for the same pairs in one place. Retail charting tools keep these in separate screens.

## Operating Context
- Desktop, often all day, on a large monitor. Low eye strain and glanceability matter more than first-run onboarding.
- Used alongside the broker terminal; alerts also go to Telegram.
- Routes: Dashboard (watchlist, signals, charts, matrices), Economic Calendar, Research Center (FX reports), Backtest, Settings; Login/Register.

## Capabilities and Constraints
- React 18 + Vite, plain CSS per component, lucide-react icons, recharts and lightweight-charts for charts.
- A full visual restyle is in scope. Features, data, routes and layouts stay as they are.
- Bullish/bearish semantics (green/red) must stay unambiguous.

## Evidence on Hand
Live market data, signals and reports come from the backend. No marketing content, customers or testimonials exist, and none should be invented.

## Product Principles
1. Glanceable state: the important change on screen is findable in under a second.
2. The numbers are the product. Figures get tabular, precise, high-contrast treatment, and chrome recedes.
3. Calm over hours: nothing flashes or decorates without carrying signal.
4. Density with order: show a lot, organised firmly.
