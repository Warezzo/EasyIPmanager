#!/usr/bin/env bash
# EasyIPmanager — first-time setup script
# Run from the repo root: bash ipam/setup.sh  (or: make setup)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

echo ""
echo "  EasyIPmanager — Setup"
echo "  ─────────────────────"
echo ""

# ── 1. Create .env from example if missing ────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "  ✔  $ENV_FILE already exists — skipping creation."
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "  ✔  Created $ENV_FILE from .env.example"
fi

# ── 2. Auto-generate JWT_SECRET if still default ─────────────────────────────
if grep -q "JWT_SECRET=change_me_to_a_long_random_secret" "$ENV_FILE"; then
  if command -v openssl &>/dev/null; then
    SECRET=$(openssl rand -hex 32)
    sed -i "s|JWT_SECRET=change_me_to_a_long_random_secret|JWT_SECRET=$SECRET|" "$ENV_FILE"
    echo "  ✔  JWT_SECRET generated automatically."
  else
    echo "  ⚠  openssl not found. Set JWT_SECRET manually in $ENV_FILE before deploying."
  fi
fi

# ── 3. Ask for ADMIN_PASSWORD if still default ────────────────────────────────
if grep -q "ADMIN_PASSWORD=change_me" "$ENV_FILE"; then
  echo ""
  while true; do
    read -rsp "  Enter ADMIN_PASSWORD (min 8 chars): " PASS1; echo
    if [ "${#PASS1}" -lt 8 ]; then
      echo "  ✗  Password too short, try again."
      continue
    fi
    read -rsp "  Confirm ADMIN_PASSWORD: " PASS2; echo
    if [ "$PASS1" = "$PASS2" ]; then
      sed -i "s|ADMIN_PASSWORD=change_me|ADMIN_PASSWORD=$PASS1|" "$ENV_FILE"
      echo "  ✔  ADMIN_PASSWORD set."
      break
    else
      echo "  ✗  Passwords do not match, try again."
    fi
  done
fi

# ── 4. Ask for ADMIN_USER if desired ─────────────────────────────────────────
echo ""
CURRENT_USER=$(grep "^ADMIN_USER=" "$ENV_FILE" | cut -d= -f2)
read -rp "  ADMIN_USER [$CURRENT_USER]: " NEW_USER
if [ -n "$NEW_USER" ] && [ "$NEW_USER" != "$CURRENT_USER" ]; then
  sed -i "s|ADMIN_USER=.*|ADMIN_USER=$NEW_USER|" "$ENV_FILE"
  echo "  ✔  ADMIN_USER set to '$NEW_USER'."
fi

# ── 5. Build and start ────────────────────────────────────────────────────────
echo ""
read -rp "  Build and start the container now? [Y/n]: " START
START="${START:-Y}"
if [[ "$START" =~ ^[Yy]$ ]]; then
  cd "$SCRIPT_DIR"
  docker compose up --build -d
  PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d= -f2 || echo "5050")
  echo ""
  echo "  ✔  EasyIPmanager is running at http://localhost:${PORT:-5050}"
else
  echo ""
  echo "  Run 'make deploy' when ready."
fi

echo ""
