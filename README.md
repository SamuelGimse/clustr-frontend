# Clustr frontend

Static Clustr application copied from the supplied frontend project. Configure its public Supabase URL and anon key in `js/config.js`, then serve this directory as a static site.

Clustr uses Supabase email/password authentication. Free accounts are limited by database policy to the previous trading day; Pro unlocks live and historical publishes with a 99 NOK/month Stripe subscription. The matching RLS migration and Edge Function setup are tracked in the private `clustr-backend` repository TODO and must be deployed before protected live data and billing are available.

Administrators can start a full publish from Account while the private `clustr-backend` service is running locally on port 3001. The backend checks the Supabase admin role before it runs the pipeline.


## Polymarket

The Polymarket navigation item reads stored questions, outcome prices and history from `PUBLISH_API_URL` (or `POLYMARKET_API_URL` when configured). The matching implementation is in `untitled3`: Fetch News collects up to 100 markets and adds them to the source feed, with stock-relevance filtering before publishing. `polymarket.css` and `js/polymarket.js` match the backend's standalone screen. No separate collection timer is installed. History distinguishes original Clustr snapshots from later-retrieved Polymarket prices. Outcome prices and history links also appear on published prediction-market article cards.
