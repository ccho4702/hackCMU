#!/usr/bin/env bash
# Delete the demo VPS after the presentation.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/deploy/provision.py" destroy "$@"
