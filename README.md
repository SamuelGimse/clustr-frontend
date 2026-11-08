# Clustr Market frontend

Static Clustr Market application. Configure its public Supabase URL and anon key in `js/config.js`, then serve this directory as a static site.

Clustr Market uses Supabase Google, email/password, and passwordless email-link authentication. The Apple button appears when the Apple provider is enabled in Supabase. Free and Pro data access is enforced by Supabase policy; the private `clustr-backend` repository contains the matching RLS and billing setup.

Apple web sign-in needs an Apple Developer Program App ID with Sign in with Apple, a Services ID for `clustrmarket.com`, and an Apple signing key. Configure the Services ID return URL as `https://yrykmwjcarytyroofiar.supabase.co/auth/v1/callback`, then put the Services ID and generated client secret in Supabase Authentication → Sign In / Providers → Apple. Keep the signing key and client secret out of this public repository. Apple's OAuth client secret must be renewed every six months. Until the provider is enabled, the app hides its Apple button.

Administrators can start a full publish from Account while the private `clustr-backend` service is running locally on port 3001. The backend checks the Supabase admin role before it runs the pipeline.

## iPhone Home Screen app

Open https://clustrmarket.com/ in Safari, choose Share > Add to Home Screen, enable Open as Web App if offered, and tap Add. Launch Clustr Market from that icon to use it without Safari's address/search bar. If an older shortcut still opens Safari, remove that shortcut and add it again after the update is live. Normal Safari links still show browser controls; external article links may open the browser.

The manifest and icons use project-relative paths for GitHub Pages. Existing safe-area padding is enabled by viewport-fit=cover; pinch zoom remains available. There is no offline/service-worker cache: live data and authentication still require a network connection. Admin publishing still requires the configured local backend and is not moved onto the iPhone.


## Polymarket

The Polymarket navigation item reads stored questions, outcome prices and history from `PUBLISH_API_URL` (or `POLYMARKET_API_URL` when configured). The matching implementation is in `untitled3`: Fetch News collects up to 100 markets and adds them to the source feed, with stock-relevance filtering before publishing. `polymarket.css` and `js/polymarket.js` match the backend's standalone screen. No separate collection timer is installed. History distinguishes original Clustr snapshots from later-retrieved Polymarket prices. Outcome prices and history links also appear on published prediction-market article cards.
