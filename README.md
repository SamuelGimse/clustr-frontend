# Clustr Market frontend

Static Clustr Market application. Configure its public Supabase URL and anon key in `js/config.js`, then serve this directory as a static site.

Clustr Market uses Supabase Google, Facebook, email/password, and passwordless email-link authentication. Free and Pro data access is enforced by Supabase policy; the private `clustr-backend` repository contains the matching RLS and billing setup.

Free can read reports before yesterday's midnight in US Eastern time: Friday is available on Sunday. Watchlist and interactive History require Pro, alongside existing Pro-only features. Verified Stripe webhooks grant the 99 NOK/month subscription. Billing requires Stripe secrets and a successful sandbox checkout test before live sales.

Admin's Account preview selector shows Free, subscribed Pro or Founding 20 without losing actual Admin access. Preview filters report dates and disables real billing, sign-out and Watchlist edits. Exit preview to return to the actual account.

Founding 20 is a limited complimentary lifetime Pro grant. The Account page shows remaining places while the offer is open. Signing up does not reserve a place: after confirming an email and signing in, a Free user must press Accept & claim Founding 20. The claim is enforced by the Supabase RPC in `clustr-backend`.

Administrators can start a full publish from Account while the private `clustr-backend` service is running locally on port 3001. The backend checks the Supabase admin role before it runs the pipeline.

## iPhone Home Screen app

Open https://clustrmarket.com/ in Safari, choose Share > Add to Home Screen, enable Open as Web App if offered, and tap Add. Launch Clustr Market from that icon to use it without Safari's address/search bar. If an older shortcut still opens Safari, remove that shortcut and add it again after the update is live. Normal Safari links still show browser controls; external article links may open the browser.

The manifest and icons use project-relative paths for GitHub Pages. Existing safe-area padding is enabled by viewport-fit=cover; pinch zoom remains available. There is no offline/service-worker cache: live data and authentication still require a network connection. Admin publishing still requires the configured local backend and is not moved onto the iPhone.


## Polymarket

The Polymarket navigation item reads stored questions, outcome prices and history from `PUBLISH_API_URL` (or `POLYMARKET_API_URL` when configured). The matching implementation is in `untitled3`: Fetch News collects up to 100 markets and adds them to the source feed, with stock-relevance filtering before publishing. `polymarket.css` and `js/polymarket.js` match the backend's standalone screen. No separate collection timer is installed. History distinguishes original Clustr snapshots from later-retrieved Polymarket prices. Outcome prices and history links also appear on published prediction-market article cards.
