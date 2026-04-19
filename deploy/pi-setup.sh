#!/usr/bin/env bash
# One-time setup on a fresh Raspberry Pi.
# Run after `rsync`-ing the repo tree to ~/uppcl-pro.
# Re-running is safe — it's idempotent.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
USER="$(whoami)"

cd "$REPO"

echo "▸ Python venv + dependencies"
if [ ! -d venv ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip wheel
./venv/bin/pip install -r requirements.txt

echo "▸ Writing systemd unit (uppcl-proxy)"
sudo tee /etc/systemd/system/uppcl-proxy.service >/dev/null \
    < <(sed "s/%i/$USER/g" deploy/systemd/uppcl-proxy.service)

echo "▸ (skipped) mDNS alias — if you want a friendly hostname, see PI_DEPLOY.md"
# If you run Pi-hole on the same Pi, adding a local DNS record is one
# line:
#     sudo pihole-FTL --config dns.hosts '[ "192.168.1.100 uppcl.lan" ]'
#     sudo systemctl restart pihole-FTL
# If you don't run Pi-hole, your router's DHCP probably advertises your
# chosen TLD — check its admin UI for "local DNS" or "hosts file".

echo "▸ Writing Caddyfile"
sudo mkdir -p /etc/caddy
sudo tee /etc/caddy/Caddyfile >/dev/null \
    < <(sed "s|/home/pi/|/home/$USER/|g" deploy/caddy/Caddyfile)

echo "▸ Granting caddy user read access to ${REPO}"
# Caddy runs as the `caddy` user. Most distros ship user home dirs with
# mode 700, so without this step Caddy can't traverse /home/<you>/ to
# reach the static export and will serve 403 for every request.
# We grant traversal on the home dir itself (no read — it can't list
# other dirs) and read+traverse on just the uppcl-pro subtree.
sudo chmod o+x "/home/$USER"
sudo chmod -R o+rX "$REPO"

echo "▸ Enabling services"
sudo systemctl daemon-reload
sudo systemctl enable --now uppcl-proxy
sudo systemctl enable --now caddy
sudo systemctl reload caddy || sudo systemctl restart caddy

PORT=1912   # keep in sync with deploy/caddy/Caddyfile (UPPCL's own helpline number)
IP="$(hostname -I | awk '{print $1}')"

echo
echo "✓ Setup complete."
echo "  Proxy:     http://127.0.0.1:8000/health"
echo "  Dashboard: http://uppcl.local:${PORT}/  (mDNS alias)"
echo "              http://${IP}:${PORT}/    (direct IP)"
echo
echo "First login (only needed once every 60 d):"
echo "  curl -X POST http://uppcl.local:${PORT}/api/auth/login \\"
echo "    -H 'content-type: application/json' \\"
echo "    -d '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}'"
