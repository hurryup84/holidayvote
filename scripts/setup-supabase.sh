#!/usr/bin/env bash
# One-time Supabase setup from the command line (instead of clicking through the dashboard).
#   npm run supabase:setup            → creates project "holidayvote" (Frankfurt), migrations, auth config, .env.local
#   npm run supabase:setup -- <ref>   → use an existing project instead of creating one
# Needs: a Supabase account. The CLI opens the browser for `supabase login` the first time.
set -euo pipefail
cd "$(dirname "$0")/.."

SB="npx --no-install supabase"
REGION="eu-central-1"
NAME="holidayvote"
REF="${1:-}"
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s);console.log(($1)(v) ?? '')})"; }

echo "▸ 1/7 Login"
$SB projects list >/dev/null 2>&1 || $SB login

if [ -z "$REF" ]; then
  echo "▸ 2/7 Organization"
  ORG=$($SB orgs list -o json | json 'o => (o.length === 1 ? o[0].id : "")')
  if [ -z "$ORG" ]; then
    $SB orgs list
    read -r -p "Organization ID: " ORG
  fi

  echo "▸ 3/7 Create project \"$NAME\" in $REGION"
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)"
  $SB projects create "$NAME" --org-id "$ORG" --region "$REGION" --db-password "$DB_PASSWORD" --yes >/dev/null
  REF=$($SB projects list -o json | json "p => (p.find(x => x.name === '$NAME') || {}).ref || (p.find(x => x.name === '$NAME') || {}).id")
  echo "   project ref: $REF"
  echo "   Database password (save it in your password manager): $DB_PASSWORD"

  echo "   waiting until the database is ready …"
  for _ in $(seq 1 60); do
    STATUS=$($SB projects list -o json | json "p => (p.find(x => (x.ref || x.id) === '$REF') || {}).status")
    [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
    sleep 10
  done
else
  echo "▸ 2–3/7 Using existing project $REF"
  read -r -s -p "Database password of $REF: " DB_PASSWORD; echo
fi

echo "▸ 4/7 Link"
$SB link --project-ref "$REF" --password "$DB_PASSWORD" --yes

echo "▸ 5/7 Migrations (schema, access rules, storage, sync, cron jobs, …)"
$SB db push --remote --password "$DB_PASSWORD" --yes

echo "▸ 6/7 Auth config from supabase/config.toml (anonymous sign-ins on, e-mail off, CAPTCHA Turnstile)"
# Secret key of the Cloudflare Turnstile widget (hostname holidayvote.support-moidev.workers.dev);
# its site key goes into website/captcha.html. See supabase/README.md "Bot check".
if [ -z "${TURNSTILE_SECRET_KEY:-}" ]; then
  read -r -s -p "Cloudflare Turnstile secret key: " TURNSTILE_SECRET_KEY; echo
fi
export TURNSTILE_SECRET_KEY
$SB config push --yes

echo "▸ 7/7 API keys → .env.local"
ANON=$($SB projects api-keys --project-ref "$REF" -o json | json 'k => (k.find(x => x.name === "anon") || k.find(x => x.type === "publishable") || {}).api_key')
touch .env.local
grep -v '^VITE_SUPABASE_URL=\|^VITE_SUPABASE_ANON_KEY=' .env.local > .env.local.tmp || true
{
  cat .env.local.tmp
  echo "VITE_SUPABASE_URL=https://$REF.supabase.co"
  echo "VITE_SUPABASE_ANON_KEY=$ANON"
} > .env.local
rm -f .env.local.tmp

cat <<DONE

✔ Supabase is ready: https://supabase.com/dashboard/project/$REF
  .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

Next: deploy the Edge Functions (supabase/README.md):
  npx supabase functions deploy link-preview
  npx supabase functions deploy moderation --no-verify-jwt
  npx supabase functions deploy report-digest --no-verify-jwt
then build the app (npm run ios / cd ios && fastlane ios beta).
DONE
