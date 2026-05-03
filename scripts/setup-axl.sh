#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AXL_REPO_URL="${AXL_REPO_URL:-https://github.com/gensyn-ai/axl}"
AXL_REF="${AXL_REF:-main}"
AXL_SRC_DIR="${AXL_SRC_DIR:-$ROOT_DIR/.proofcourt/axl-src}"
AXL_BIN="$ROOT_DIR/bin/axl"
GOCACHE_DIR="${GOCACHE:-$ROOT_DIR/.proofcourt/go-cache}"
GOMODCACHE_DIR="${GOMODCACHE:-$ROOT_DIR/.proofcourt/go-mod}"

roles=(requester worker verifier-1 verifier-2 verifier-3)
api_ports=(9002 9012 9022 9032 9042)
tcp_ports=(7002 7002 7002 7002 7002)
ygg_ports=(9102 9112 9122 9132 9142)

mkdir -p "$ROOT_DIR/bin" "$ROOT_DIR/axl-data" "$ROOT_DIR/.proofcourt" "$GOCACHE_DIR" "$GOMODCACHE_DIR"

if [ ! -d "$AXL_SRC_DIR/.git" ]; then
  git clone "$AXL_REPO_URL" "$AXL_SRC_DIR"
fi

git -C "$AXL_SRC_DIR" fetch --depth 1 origin "$AXL_REF"
git -C "$AXL_SRC_DIR" checkout --quiet FETCH_HEAD

GOTOOLCHAIN="${GOTOOLCHAIN:-go1.25.5}" \
GOCACHE="$GOCACHE_DIR" \
GOMODCACHE="$GOMODCACHE_DIR" \
go -C "$AXL_SRC_DIR" build -o "$AXL_BIN" ./cmd/node

for i in "${!roles[@]}"; do
  role="${roles[$i]}"
  role_dir="$ROOT_DIR/axl-data/$role"
  key_path="$role_dir/private.pem"
  config_path="$role_dir/node-config.json"
  mkdir -p "$role_dir"

  if [ ! -f "$key_path" ]; then
    openssl genpkey -algorithm ed25519 -out "$key_path" >/dev/null 2>&1
  fi

  peers_json="[]"
  listen_json="[\"tls://127.0.0.1:${ygg_ports[$i]}\"]"
  if [ "$role" != "requester" ]; then
    peers_json="[\"tls://127.0.0.1:${ygg_ports[0]}\"]"
  fi

  cat > "$config_path" <<JSON
{
  "PrivateKeyPath": "$key_path",
  "Peers": $peers_json,
  "Listen": $listen_json,
  "api_port": ${api_ports[$i]},
  "bridge_addr": "127.0.0.1",
  "tcp_port": ${tcp_ports[$i]},
  "max_message_size": 16777216,
  "max_concurrent_conns": 128,
  "conn_read_timeout_secs": 60,
  "conn_idle_timeout_secs": 300
}
JSON
done

echo "Built Gensyn AXL node at $AXL_BIN"
echo "Generated local private mesh configs under $ROOT_DIR/axl-data"
