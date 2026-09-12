#!/usr/bin/env bash
# Create the demo VPS if needed, then do the first image build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 deploy/provision.py create "$@"
python3 deploy/provision.py wait --timeout 300
exec "$ROOT/deploy/sync.sh" --build
