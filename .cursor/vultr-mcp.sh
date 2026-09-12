#!/usr/bin/env bash
# Launch mcp-vultr with VULTR_API_KEY from backend/.env without sourcing the rest of that file.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
UVX="${UVX:-/Users/paxtaeo/.local/bin/uvx}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "backend/.env not found at $ENV_FILE" >&2
  exit 1
fi

key="$(
  python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line.startswith("VULTR_API_KEY=") or line.startswith("#"):
        continue
    value = line.split("=", 1)[1].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    print(value)
    break
PY
)"

if [[ -z "$key" ]]; then
  echo "VULTR_API_KEY is missing from backend/.env" >&2
  exit 1
fi

export VULTR_API_KEY="$key"
exec "$UVX" --from mcp-vultr mcp-vultr
