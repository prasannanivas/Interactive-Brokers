---
name: Trading Signal Monitor
description: A private FX signal cockpit set in banknote ink on security paper.
colors:
  paper-ground: "#eef0ec"
  paper: "#fbfcfa"
  paper-inset: "#f4f6f2"
  paper-pressed: "#e7eae4"
  rule-soft: "#e6e9e3"
  rule: "#d6dbd3"
  rule-strong: "#b9c1b6"
  intaglio-ink: "#1c2a26"
  intaglio-ink-raised: "#2d403a"
  text-secondary: "#43524c"
  text-muted: "#63716b"
  on-ink-muted: "#a9bab2"
  selection-tint: "#e3ece6"
  bull: "#16794a"
  bull-tint: "#dcefe2"
  bear: "#b4232a"
  bear-tint: "#f6dcdc"
  warn: "#946000"
  warn-tint: "#f5e9cf"
  info-blue: "#2f5f9e"
  info-tint: "#dfe7f2"
  ink-usd: "#3f6b4a"
  ink-eur: "#2f5f9e"
  ink-gbp: "#6a4a8c"
  ink-jpy: "#b5543c"
  ink-aud: "#2e7f80"
  ink-cad: "#a8323e"
  ink-chf: "#b8661a"
  ink-nzd: "#56652c"
  ink-other: "#5d6b66"
typography:
  title:
    fontFamily: "Public Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  panel-title:
    fontFamily: "Public Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Public Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Public Sans, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  sm: "3px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.intaglio-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.intaglio-ink-raised}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.intaglio-ink}"
    rounded: "{rounded.md}"
    padding: "7px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-inset}"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px 20px 20px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.intaglio-ink}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  table-head:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
  header-band:
    backgroundColor: "{colors.intaglio-ink}"
    textColor: "{colors.paper}"
    padding: "12px 24px"
---

# Design System: Trading Signal Monitor

## Overview

**Creative North Star: "The Intaglio Desk"**

The app reads like banknote engraving laid on a working desk. The ground is pale security paper with faint guilloche hairlines. Everything printed on it is in a deep green-black intaglio ink, and the screen is built to be read for hours next to a broker terminal without tiring the eye. Chrome recedes into paper and hairline rules, so the numbers carry the contrast.

Colour has jobs. Each currency keeps its own banknote ink, so a pair reads as two notes laid side by side and the eye finds a currency anywhere on screen before reading it. Bull and bear are a deep green and a deep red, always paired with an arrow, a word or weight, never colour alone. Everything else is a tuned warm-neutral ramp.

**Key Characteristics:**
- Pale paper ground, bright paper panels, hairline sage rules
- One intaglio ink for chrome, primary actions and the header band
- A per-currency ink system, expressed through the two-ink pair chip and the matrix head bars
- Public Sans on a tight four-step scale with tabular numerals everywhere
- Flat surfaces with ambient shadows only; motion only for state

## Colors

Restrained paper neutrals, one ink for authority, and saturated colour reserved for currencies and market direction.

### Primary
- **Intaglio Ink** (#1c2a26): body text, the header band, primary buttons, active tabs, table hover outlines.
- **Raised Ink** (#2d403a): hover on ink surfaces.

### Semantic
- **Bull Green** (#16794a) and tint (#dcefe2): BUY, bullish, up moves, connected status.
- **Bear Red** (#b4232a) and tint (#f6dcdc): SELL, bearish, down moves, disconnected status.
- **Ledger Amber** (#946000) and tint (#f5e9cf): warnings and loading errors.
- **Note Blue** (#2f5f9e) and tint (#dfe7f2): links, focus rings, informational text.

### Currency inks
USD #3f6b4a · EUR #2f5f9e · GBP #6a4a8c · JPY #b5543c · AUD #2e7f80 · CAD #a8323e · CHF #b8661a · NZD #56652c, plus inks for SEK, NOK, DKK, ILS, CNH, CZK, HKD, HUF, MXN, RUB, SGD, ZAR, PLN, TRY and INR in `src/index.css`. Unknown currencies fall back to #5d6b66.

### Neutral
- **Security Paper** (#eef0ec): page ground, under the guilloche pattern.
- **Note Paper** (#fbfcfa): panels, tables, inputs, chart backgrounds.
- **Inset Paper** (#f4f6f2): table heads, row hover, inset areas.
- **Pressed Paper** (#e7eae4): pressed states, neutral cells, same-currency matrix cells.
- **Rules** (#e6e9e3 / #d6dbd3 / #b9c1b6): row dividers, panel borders, input strokes.
- **Text ramp** (#1c2a26 / #43524c / #63716b): primary, secondary, muted.

### Night desk (dark theme)
`:root[data-theme="dark"]` re-engraves the same system on dark paper: ground #0f1715, panels #161f1c, rules #2d3c36, text #e4ebe6. Bull and bear brighten to #43b77d and #e4696e, and info to #84aae0. The header band stays dark in both themes (`--band`), while `--ink` inverts to a light ink so primary buttons read light-on-dark. Currency inks are unchanged.

The theme is chosen with the Light / Dark / System switch at the top of every page (`ThemeToggle`, `src/theme.js`). The preference is stored in localStorage under `theme-preference`, and `index.html` applies it before first paint.

### Named Rules
**The Two Inks Rule.** A currency pair is always shown as two inks, base then quote, through `PairChip`. Currency inks are never used for anything else.

**The Direction Is Never Colour Alone Rule.** Bull and bear colour always comes with an arrow icon, a BUY/SELL word or a sign.

## Typography

**Body Font:** Public Sans (with -apple-system, Segoe UI, Roboto)

**Character:** A sober government-issue grotesk, legible at 11–13px, with tabular figures so prices and indicator values line up in columns.

### Hierarchy
- **Title** (700, 1.125rem): page titles (Backtest, Settings, Research Center).
- **Panel title** (600, 0.9375rem): panel and section headings.
- **Body** (400–600, 0.8125rem, 1.45): tables, controls and prose.
- **Label** (600, 0.6875rem, 0.06em tracking, uppercase): table heads, day dividers, pair chips.

### Named Rules
**The Weight Not Size Rule.** Rank comes from weight and case on a four-step scale (11 / 13 / 15 / 18px), never from oversized headings.

## Layout

Single column within a 1680px max container with 24px gutters (16px under 768px). The ink header band is sticky and bleeds to the viewport edges. Panels stack with 16px gaps. Wide tables and charts scroll inside their panel; grid and flex children carry `min-width: 0`.

## Elevation & Depth

Mostly flat. Depth comes from tonal paper layers and hairline borders. Shadows are ambient and ink-tinted:
- **sm** (`0 1px 2px rgba(28,42,38,0.06)`): resting panels.
- **md** (`0 2px 8px -2px rgba(28,42,38,0.10), 0 1px 2px rgba(28,42,38,0.06)`): raised controls.
- **lg** (`0 16px 40px -12px rgba(28,42,38,0.28), 0 2px 6px rgba(28,42,38,0.08)`): dropdowns, popovers, modals.

## Shapes

Small, firm corners: 3px for chips and cells, 6px for controls, 8px for panels. Borders are 1px hairlines. There are no thick accent side-borders.

## Components

### Buttons
- **Primary:** ink fill, white text, 6px radius; hover raises to #2d403a.
- **Secondary:** paper fill, 1px rule border, ink text; hover to inset paper.
- **On the ink band:** transparent with muted text; hover to raised ink.

### Pair chip (signature)
Two flush segments in the base and quote currency inks, 11px bold tracked caps, 3px radius, divided by a 1px light hairline. Used in the watchlist, the MA-cross alerts and anywhere a pair is named.

### Currency matrix
Paper cells with a 1px inner hairline and a heatmap ramp from paper toward mid-tone bull, bear or neutral ink, keeping dark text legible. Column heads carry a 4px currency-ink underline, and row heads a 4px ink bar on the left.

### Alert tiles
Paper tiles with a 1px border and a soft bull or bear tint washing in from the left. Direction is shown with an arrow icon and an uppercase BUY/SELL word. A fresh alert pulses a ring a few times, then settles.

### Theme switch
A segmented three-button control (sun, moon, monitor). Paper version on paper headers; `.on-band` version on the ink band. The active segment is raised.

### Inputs
1px strong-rule stroke, paper fill, 6px radius; focus shows a Note Blue border and a 3px translucent ring.

### Tables
Inset-paper sticky head with uppercase labels, hairline row dividers and inset-paper row hover.

## Do's and Don'ts

### Do:
- **Do** take colours from the tokens in `src/index.css`. Chart libraries that need literal hex use the same values.
- **Do** render every FX pair with `PairChip`.
- **Do** use CSS variables for every colour in CSS and inline styles, so both themes follow. Canvas charts call `applyChartTheme`, and recharts SVG colours use the palette hex values remapped in `index.css`.
- **Do** keep transitions to 120–200ms on colour, border and shadow, using `--ease`.

### Don't:
- **Don't** use gradients for fills, hover lifts (`translateY`), or `transition: all`.
- **Don't** use thick coloured `border-left` accents on cards or alerts.
- **Don't** introduce a second accent colour for decoration; saturation belongs to currencies and direction.
- **Don't** use Unicode triangles as icons in new UI; use lucide icons.
