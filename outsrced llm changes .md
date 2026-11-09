# Outsourced LLM changes

## 2026-11-09 — Default layouts and news navigation
- Network, World, Trends, Reports and Watchlist use the selected compact layout in either detail mode.
- Reports opens from publish metadata immediately, tolerates history-summary failure, retains original selection indices and displays load errors for filtered archives.
- Stocks keeps the directory layout; Advanced adds saved technical/Reddit data and a TradingView tab. The chart loads only on opening its tab and stays mounted through quote/filter refreshes.
- World search stays pinned. Trends removes the four-count summary row.
- Overview replaces counters with the daily exponential mean of cluster impacts and puts shifts directly in its grid to remove the empty column.
- Connection desk has scored cluster buttons, stock-link type filtering and a central impact-history tab.
- Verification: 151 automated checks and browser interactions across all nine views at phone width. Browser previews use sample data; no live-account authentication or publishing changed.

## 2026-11-09 — World menu, History modes and Reports selection
- Fixed inherited flex wrapping in the World country menu: a single vertically scrolling column at desktop, tablet and phone widths, with wrapping country names and a separate pinned search.
- History Simple renders daily cluster impacts and summaries without price data or row/granularity toggles. Advanced retains those controls and adds per-article ratings, sources, dates and saved impact windows. Switching modes reuses loaded data.
- Reports selects a day present in newly loaded results, disables empty dates, and shows the selected reports before the calendar on phones.
- Applied Trends score badges, compact headers and summary treatment to Briefing grid cards without removing story or stock actions.
- Verification: 151 code checks; long country-list browser regression at 1440/1024/390px; History mode differences; actual app.js Reports navigation with mocked authentication/data and a failed history-summary RPC. No signed-in production account was accessed.

## 2026-11-09 — World search surface
- Removed the opaque background behind the pinned location search on desktop and mobile. Browser checks confirm transparent search/rail surfaces at 1440, 1024 and 390px while country scrolling and search still work.
