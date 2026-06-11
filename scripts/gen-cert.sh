#!/usr/bin/env bash
# Generate a self-signed TLS cert for local HTTPS dev so Web Crypto
# (crypto.subtle, needed by the ALTCHA login solver) works over the LAN —
# crypto.subtle is only exposed in secure contexts (https:// or localhost).
#
# Run once (re-run if your LAN IP changes):  bun run cert
# Then:  bun run dev:https   →  https://<lan-ip>:3000  (accept the cert warning)
set -euo pipefail

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
DIR="$(cd "$(dirname "$0")/.." && pwd)/certificates"
mkdir -p "$DIR"

CNF="$(mktemp)"
cat > "$CNF" <<EOF
[req]
distinguished_name = req
x509_extensions = v3
prompt = no
[req_dn]
CN = localhost
[v3]
subjectAltName = @alt
[alt]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ${LAN_IP}
EOF

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/localhost-key.pem" \
  -out "$DIR/localhost.pem" \
  -days 825 -subj "/CN=localhost" \
  -extensions v3 -config "$CNF"

rm -f "$CNF"
echo "✓ Cert generated for localhost + ${LAN_IP} → certificates/"
echo "  Start with: bun run dev:https   then open https://${LAN_IP}:3000"
