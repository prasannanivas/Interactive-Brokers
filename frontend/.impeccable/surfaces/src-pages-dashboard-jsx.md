---
version: 1
slug: "src-pages-dashboard-jsx"
primary_target: "src/pages/Dashboard.jsx"
related_targets: ["src/App.jsx"]
---

# Surface brief: Trading Signal Monitor (whole app)

Scope: full restyle of every route (Dashboard, Economic Calendar, Research Center, Backtest, Settings, Login/Register). Operate mode. Layouts, features and copy stay as they are; the visual world is replaced.

## Direction contract

THESIS: Each currency keeps its banknote ink, so a pair reads as two notes laid side by side. This refuses the category default of a navy terminal with one blue accent, where every pair looks the same.

OWN-WORLD: Pale security-paper ground (#eef0ec) under fine guilloche hairlines. Header and primary ink are deep intaglio green-black (#1c2a26). Panels are bright paper (#fbfcfa) with hairline sage borders. Each currency has its own ink: USD green, EUR blue, GBP violet, JPY vermilion, AUD teal, CAD crimson, CHF orange, NZD olive. Direction uses bull #16794a and bear #b4232a, always with an arrow icon and weight, never colour alone. Public Sans throughout on a four-step scale with tabular numerals.

STORY: The trader glances over from the broker terminal and sees which pairs changed and in which direction. The two-ink pair chip lets the eye find a currency anywhere on the screen by colour before reading.

FIRST VIEWPORT: Ink header bar holding the brand, the route nav and the connection status. MA-cross alerts in a row of paper tiles, each with a pair chip, direction and time; a reversed alert stays visible, struck through and dimmed. Below, the currency matrix on the left (column heads carry each currency's ink bar) and the watchlist table on the right, then the comprehensive analysis chart full width.

FORM: Banknote security print, candidate 1 of 7 (Impeccable's pick, chosen by the user). seed: be338f516d8cf6f8

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature move: the two-ink pair chip (base ink | quote ink), used wherever a pair is named.
Motion: 150–200ms state transitions only; a newly arrived alert tile fades its paper from ink-tint to paper once.
