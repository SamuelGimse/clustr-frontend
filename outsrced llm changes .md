# Outsourced LLM changes

## 2026-11-09 — Default layouts and news navigation
- Network, World, Trends, Reports and Watchlist use the selected compact layout in either detail mode.
- Reports opens from publish metadata immediately, tolerates history-summary failure, retains original selection indices and displays load errors for filtered archives.
- Stocks keeps the directory layout; Advanced adds saved technical/Reddit data and a TradingView tab. The chart loads only on opening its tab and stays mounted through quote/filter refreshes.
- World search stays pinned. Trends removes the four-count summary row.
- Overview replaces counters with the daily exponential mean of cluster impacts and puts shifts directly in its grid to remove the empty column.
- Connection desk has scored cluster buttons, stock-link type filtering and a central impact-history tab.
- Verification: 151 automated checks and browser interactions across all nine views at phone width. Browser previews use sample data; no live-account authentication or publishing changed.
