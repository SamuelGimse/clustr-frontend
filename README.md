# Clustr frontend

Static Clustr application copied from the supplied frontend project. Configure its public Supabase URL and anon key in `js/config.js`, then serve this directory as a static site.

Clustr uses Supabase email/password authentication. Free accounts are limited by database policy to the previous trading day; Pro unlocks live and historical publishes with a 99 NOK/month Stripe subscription. The matching RLS migration and Edge Function setup are tracked in the private `clustr-backend` repository TODO and must be deployed before protected live data and billing are available.
