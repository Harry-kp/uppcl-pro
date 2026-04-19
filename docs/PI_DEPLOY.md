# Deploying on a Raspberry Pi

The Pi Zero 2 W has **512 MB of RAM and 4× Cortex-A53 @ 1 GHz**. That's plenty for the Python proxy (~60 MB idle) but too tight for a Next.js build. Solution: build the dashboard once on your laptop → export as static HTML → serve from Caddy on the Pi.

End result: dashboard at `http://<your-pi-ip>:1912`, auto-starts on boot, survives power cuts, and uses <10% CPU at idle. The `:1912` port is UPPCL's own 24/7 helpline number — picked because it's outside the usual web-dev collision zone (80, 443, 3000, 8000, 8080, 8888) so it coexists with anything else you run on the Pi (Pi-hole, Portainer, Homebridge, Jellyfin, …).

---

## What you need

- A Raspberry Pi Zero 2 W (or any Pi — this works identically on a Pi 4/5).
- Raspberry Pi OS Bookworm **64-bit** (32-bit won't build `cryptography` wheels cleanly).
- Your Pi on the same network as your laptop, reachable via SSH.
- A working UPPCL SMART account.

Examples below use `<user>@<pi-ip>` — substitute your actual SSH target (e.g. `gandalf@192.168.1.100` or `pi@raspberrypi.local`).

## Step 1 — Prepare the Pi (one-time)

SSH in and install the deps:

```bash
ssh <user>@<pi-ip>                    # e.g. gandalf@192.168.1.100

sudo apt update
sudo apt install -y python3 python3-venv python3-pip caddy rsync

# uppcl-pro will live here
mkdir -p ~/uppcl-pro
```

If you run Pi-hole on the same Pi, **don't panic about Caddy's postinst complaining that port 80 is in use** — that's expected. Our Caddyfile binds `:1912` instead, so it never fights Pi-hole for `:80/:443`.

**Setting up SSH keys (strongly recommended)** before the next step, so you're not typing your password every deploy:

```bash
ssh-copy-id <user>@<pi-ip>
```

## Step 2 — Build and push from your laptop

Clone the repo on your laptop (not the Pi) and run:

```bash
git clone https://github.com/Harry-kp/uppcl-pro.git
cd uppcl-pro
make pi-build                              # static-exports the dashboard into web/out/
make pi-push PI=<user>@<pi-ip>            # rsyncs everything that belongs on the Pi
```

`make pi-push` rsyncs:

- `uppcl_api.py`, `appsavy.py`, `requirements.txt` — the proxy
- `web/out/` — the static dashboard
- `deploy/systemd/`, `deploy/caddy/` — the service + reverse-proxy configs

It does **not** copy `.env`, `uppcl_session.json`, or `*.har` — those stay on your laptop.

## Step 3 — First-time setup on the Pi

SSH in and run:

```bash
ssh <user>@<pi-ip>
cd ~/uppcl-pro
bash deploy/pi-setup.sh
```

This will:

1. Create a Python virtualenv in `~/uppcl-pro/venv/` and install `requirements.txt`.
2. Install the `uppcl-proxy.service` systemd unit (uvicorn on `:8000`).
3. Drop a Caddyfile that serves the dashboard at `:1912` and reverse-proxies `/api/*` to the proxy on `:8000`.
4. Relax home-dir perms just enough for Caddy to read `~/uppcl-pro/web/out/` (`chmod o+x ~` + `chmod -R o+rX uppcl-pro`). Without this, Caddy serves 403 because `/home/<user>/` defaults to mode 700.
5. Enable + start both services.

When it's done, open `http://<pi-ip>:1912` from any device on your LAN.

## Step 3.5 (optional) — give it a friendly name

If your Pi runs Pi-hole (or your router has a local-DNS feature), add one entry pointing a pretty name at the Pi's IP:

```bash
# On the Pi, for Pi-hole v6+
sudo pihole-FTL --config dns.hosts '[ "<pi-ip> uppcl.lan" ]'
sudo systemctl restart pihole-FTL

# …or for Pi-hole v5 (deprecated but still works)
echo "<pi-ip> uppcl.lan" | sudo tee -a /etc/pihole/custom.list
sudo pihole restartdns
```

Then open **http://uppcl.lan:1912/**. Any LAN device whose DHCP points DNS at the Pi-hole (i.e. everyone on your network if you set Pi-hole as the network-wide resolver) will resolve `uppcl.lan` automatically.

**Avoid `.local`** — it's reserved for mDNS (RFC 6762) and macOS/iOS/Linux will send multicast broadcasts instead of asking Pi-hole. Safe alternatives: `.lan`, `.home.arpa` (RFC 8375 standard), `.box`, `.home`.

**If you just added it and the browser still 404s** — macOS caches NXDOMAIN. Flush:

```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

## Step 4 — First login

First login still happens once to generate the JWT. Easiest: just open `http://<pi-ip>:1912/` in a browser — the login form is theme-matched and hooks straight into `/api/auth/login`.

Or via curl:

```bash
curl -X POST http://<pi-ip>:1912/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"<UPPCL username>","password":"<password>"}'
```

After that, the proxy persists the 60-day JWT to `~/uppcl-pro/uppcl_session.json` and everything works until the token expires.

## Step 5 — Updates

When you pull in upstream changes:

```bash
# on laptop
git pull
make pi-build
make pi-push PI=<user>@<pi-ip>

# on pi
sudo systemctl restart uppcl-proxy caddy
```

Or wrap that in one command:

```bash
make pi-deploy PI=<user>@<pi-ip>
```

---

## Expected resource usage

On an idle Pi Zero 2 W:

- Proxy (Python / uvicorn): **~55 MB RSS**
- Caddy (static file server): **~12 MB RSS**
- CPU: <3% across all four cores
- Boot-to-serving: ~8 seconds after power-on

The dashboard does SWR-revalidate-on-focus at 15 s intervals, so expect a small CPU blip every time you focus a tab. The proxy caches upstream responses for 15 s on the same principle.

## Reaching it from outside your LAN

Three safe options (pick one):

- **Tailscale**: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`. Your dashboard is now at `http://pi-hostname.<your-tailnet>.ts.net`. Zero port-forwarding.
- **Cloudflare Tunnel**: `cloudflared tunnel` — free, no public IP needed, gets you a real HTTPS hostname.
- **WireGuard** on your router — more DIY, same effect.

Do **not** expose port 80/443 directly to the internet without at least basic auth in Caddy. The proxy has no auth of its own.

## Troubleshooting

### `uppcl-proxy.service` fails to start

```bash
journalctl -u uppcl-proxy --no-pager -n 50
```

Usual suspects:
- `ModuleNotFoundError`: the venv didn't install cleanly. Re-run `bash deploy/pi-setup.sh`.
- `[Errno 98] Address already in use`: something else grabbed port 8000. `sudo lsof -ti:8000 | xargs sudo kill -9`.
- `cryptography` build error: you're on 32-bit Raspberry Pi OS. Switch to 64-bit (`rpi-imager` → "Raspberry Pi OS (64-bit)").

### Dashboard shows "Proxy unreachable"

Open `http://<pi-ip>:1912/api/health` — if that 404s, Caddy isn't forwarding correctly. Check `sudo caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl status caddy`.

### `/api/...` calls return HTML instead of JSON

Symptom: `GET /api/health` returns `HTTP 200` with `Content-Type: text/html` and the dashboard's `index.html` body. Login looks like it succeeds but the UI stays on the login screen, and `uppcl_session.json` never appears on the Pi.

Cause: on Caddy v2.6.x (Debian 12's default) a bare `try_files` directive runs in the rewrite phase *before* `handle_path` matches, so every `/api/...` path gets rewritten to `/index.html` and never reaches uvicorn. The shipped Caddyfile wraps the static handlers in an explicit `handle { }` fallback block to fix this — if you've customised your Caddyfile and lost the wrapper, put it back:

```caddy
:1912 {
    handle_path /api/* { reverse_proxy 127.0.0.1:8000 }
    handle {
        root * /home/<you>/uppcl-pro/web/out
        try_files {path} {path}/ {path}.html /index.html
        file_server
    }
}
```

### Every page returns HTTP 403

Cause: home directories on Raspberry Pi OS default to mode `700`, and Caddy runs as the `caddy` user, which can't traverse into `/home/<you>/uppcl-pro/web/out/`. `pi-setup.sh` runs `chmod o+x ~` + `chmod -R o+rX uppcl-pro` to fix this — if you installed by hand, replicate those two commands.

### `crypto.randomUUID is not a function` in the browser

Web Crypto — including `crypto.randomUUID` — is only exposed in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): HTTPS origins or `localhost`. Plain `http://uppcl.lan:1912/` isn't secure, so anything that calls `crypto.randomUUID()` throws. Known call-sites in this codebase have been swapped to counters (see `web/src/components/ui/Toast.tsx`) but if you hit this in a dependency, either:

- Front the stack with HTTPS — cleanest fix. Use Tailscale Serve or a domain + Caddy's auto-HTTPS.
- Polyfill in your app entry: `if (!crypto.randomUUID) crypto.randomUUID = () => '... your fallback ...'`.

### `uppcl.lan` resolves on the Pi but not from my Mac

Two layers of DNS caching to flush.

```bash
# macOS — both commands needed
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

Or just toggle Wi-Fi off/on. The Mac was likely caching an `NXDOMAIN` from before you added the record to Pi-hole. Verify at the source: `dig @<pi-ip> uppcl.lan +short` should return the IP — if that works but `curl` doesn't, it's local caching.

### Caddy fails to start with "bind: address already in use"

Something else on the Pi is using Caddy's configured port. Check with `sudo ss -tlnp | grep :1912`. Common culprits on Pi-hole Pis: nothing on :1912 usually, but if you changed the Caddyfile to bind `:80`, that WILL collide with Pi-hole's built-in webserver (`pihole-FTL` on newer versions, `lighttpd` on older). Either move Pi-hole admin to another port or leave UPPCL on `:1912`.

### Everything works locally but not over Tailscale

Caddy currently binds `:1912`. If you want HTTPS via Tailscale Serve, update the Caddyfile to bind on `:443 {}` with your tailnet hostname — Caddy will provision a cert automatically.

### Pi is slow to respond after a long idle

The first request after idle triggers a cold cache. Pre-warm by hitting `/api/health` periodically (cron or a one-liner in your router).

---

## Alternative: docker-compose

If you prefer containers, there's a `deploy/docker-compose.yml` that runs the proxy + Caddy. Works on any Pi with Docker, but takes ~400 MB extra disk for the images. The native systemd path is lighter — use it unless you have a reason not to.

```bash
cd deploy && docker compose up -d
```
