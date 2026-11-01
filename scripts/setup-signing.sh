#!/usr/bin/env bash
# Puts the macOS signing + notarization secrets into the GitHub repo, so CI signs and notarizes releases.
#   bash scripts/setup-signing.sh [path/to/developerID_application.cer]
# Needs: the private key the certificate request was made from (~/.pilothouse-signing/devid.key),
# the Developer ID Application certificate downloaded from developer.apple.com, and `gh` logged in.
# It asks for your Apple ID and an app-specific password; nothing is printed or written to the repo.
set -euo pipefail

REPO="${REPO:-aemresrbyk/pilothouse}"
DIR="$HOME/.pilothouse-signing"
KEY="$DIR/devid.key"
CER="${1:-$(ls -t "$HOME"/Downloads/developerID_application*.cer 2>/dev/null | head -1)}"
OSSL=/usr/bin/openssl # LibreSSL writes 3DES .p12 files, which macOS's `security import` (used in CI) accepts

[ -f "$KEY" ] || { echo "Private key not found: $KEY"; exit 1; }
[ -f "${CER:-}" ] || { echo "Certificate not found. Pass the .cer path as the first argument."; exit 1; }
[ -t 0 ] || { echo "Run this in a Terminal window: it asks for your Apple ID and an app-specific password."; exit 1; }
command -v gh >/dev/null || { echo "Install the GitHub CLI (brew install gh) and run: gh auth login"; exit 1; }

# The certificate must belong to this key, or signing fails later in CI.
if [ "$($OSSL x509 -inform der -in "$CER" -noout -pubkey | $OSSL md5)" != "$($OSSL rsa -in "$KEY" -pubout 2>/dev/null | $OSSL md5)" ]; then
  echo "This certificate was not made from $KEY. Download the one you just created."; exit 1
fi
SUBJECT=$($OSSL x509 -inform der -in "$CER" -noout -subject)
TEAM_ID=$(sed -n 's/.*OU=\([A-Z0-9]\{10\}\).*/\1/p' <<<"$SUBJECT")
echo "Certificate: ${SUBJECT#subject=}"

P12="$DIR/devid.p12"
P12_PASS=$($OSSL rand -base64 24)
$OSSL x509 -inform der -in "$CER" -out "$DIR/devid.pem"
$OSSL pkcs12 -export -inkey "$KEY" -in "$DIR/devid.pem" -out "$P12" -passout fd:3 3<<<"$P12_PASS"
chmod 600 "$P12" "$DIR/devid.pem"

read -r -p "Apple ID (email you sign in to developer.apple.com with): " APPLE_ID
read -r -s -p "App-specific password (from account.apple.com, input hidden): " APP_PW; echo

# Values go in on stdin so they never show up in the process list.
set_secret() { printf '%s' "$2" | gh secret set "$1" -R "$REPO" >/dev/null && echo "  set $1"; }
echo "Uploading secrets to $REPO:"
set_secret MAC_CERT_P12_BASE64 "$(base64 -i "$P12")"
set_secret MAC_CERT_PASSWORD "$P12_PASS"
set_secret APPLE_ID "$APPLE_ID"
set_secret APPLE_APP_SPECIFIC_PASSWORD "$APP_PW"
set_secret APPLE_TEAM_ID "$TEAM_ID"
unset P12_PASS APP_PW
echo "Done. Next release built by CI will be signed and notarized. Keep $DIR private (it holds your signing key)."
