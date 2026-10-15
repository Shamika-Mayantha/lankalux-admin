#!/usr/bin/env bash
# One-time setup of the LankaLux agent VM (Oracle Always Free, Ampere A1, Ubuntu 24.04 arm64).
# Run from inside a copy of agent-service/:   sudo ./deploy/setup-vm.sh
#
# Installs Ollama (localhost only), a Python venv with the agent service, and systemd
# units that restart on failure and on reboot. It opens NO inbound ports: the service
# only makes outbound HTTPS/Postgres connections. It does not start the agent service;
# that waits for /etc/lankalux-agents/env and Shamika's go-ahead.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "run with sudo"; exit 1; fi
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/lankalux-agents

echo "== packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv python3-pip curl jq unattended-upgrades
systemctl enable --now unattended-upgrades

echo "== 4 GB swap (12 GB RAM is tight with a model loaded)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Ollama"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/lankalux.conf <<'CONF'
[Service]
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_KEEP_ALIVE=-1
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_MAX_LOADED_MODELS=2
Restart=always
CONF
systemctl daemon-reload
systemctl enable --now ollama

echo "== service user and venv"
id lankalux >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin lankalux
mkdir -p "$APP"
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install --upgrade pip >/dev/null
"$APP/venv/bin/pip" install "$SRC"
chown -R lankalux:lankalux "$APP"

echo "== config (secrets stay on this machine, root-only)"
mkdir -p /etc/lankalux-agents
if [[ ! -f /etc/lankalux-agents/env ]]; then
  install -m 600 -o root -g root "$SRC/.env.example" /etc/lankalux-agents/env
fi

install -m 644 "$SRC/deploy/lankalux-agents.service" /etc/systemd/system/lankalux-agents.service
systemctl daemon-reload
systemctl enable lankalux-agents   # enabled for reboots, but not started yet

echo
echo "Done. Next:"
echo "  1. ollama pull qwen3:4b && ollama pull nomic-embed-text   (plus any models to compare)"
echo "  2. $APP/venv/bin/lankalux-bench --models qwen3:4b,qwen3:8b,gemma3:4b --out ~/bench.json"
echo "  3. Fill /etc/lankalux-agents/env (sudo nano), then: sudo systemctl start lankalux-agents"
