#!/usr/bin/env python3
"""Provision a Vultr instance for this repo without printing secrets."""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"
CLOUD_INIT = ROOT / "deploy" / "cloud-init.yaml"
API = "https://api.vultr.com/v2"
DEFAULT_LABEL = "hackcmu-optune"
DEFAULT_REGION = "ewr"
DEFAULT_PLAN = "vc2-6c-16gb"
DEFAULT_OS = "Ubuntu 24.04 LTS x64"
SSH_NAME = "hackcmu-local"


def load_api_key() -> str:
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line.startswith("VULTR_API_KEY=") or line.startswith("#"):
            continue
        value = line.split("=", 1)[1].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if value:
            return value
    raise SystemExit("VULTR_API_KEY is missing from backend/.env")


def request(key: str, method: str, path: str, payload: dict | None = None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Vultr API {method} {path} failed: {exc.code} {detail}") from None


def find_os(key: str, name: str) -> int:
    data = request(key, "GET", "/os")
    for item in data.get("os", []):
        if item.get("name") == name:
            return int(item["id"])
    available = ", ".join(sorted({item.get("name", "") for item in data.get("os", []) if "Ubuntu" in item.get("name", "")}))
    raise SystemExit(f"OS {name!r} not found. Ubuntu images: {available}")


def ensure_ssh_key(key: str, pub_path: Path) -> str:
    pub = pub_path.read_text().strip()
    data = request(key, "GET", "/ssh-keys")
    for item in data.get("ssh_keys", []):
        if item.get("ssh_key", "").strip() == pub or item.get("name") == SSH_NAME:
            return item["id"]
    created = request(key, "POST", "/ssh-keys", {"name": SSH_NAME, "ssh_key": pub})
    return created["ssh_key"]["id"]


def find_instance(key: str, label: str) -> dict | None:
    data = request(key, "GET", "/instances?per_page=100")
    for item in data.get("instances", []):
        if item.get("label") == label:
            return item
    return None


def print_status(key: str, label: str) -> None:
    account = request(key, "GET", "/account").get("account", {})
    print(f"account_status={account.get('status', 'unknown')}")
    print(f"account_balance={account.get('balance', 'n/a')}")
    data = request(key, "GET", "/instances?per_page=100")
    instances = data.get("instances", [])
    print(f"instance_count={len(instances)}")
    for item in instances:
        print(
            "instance",
            item.get("label") or "(unlabeled)",
            item.get("status"),
            item.get("power_status"),
            item.get("main_ip") or "pending",
            item.get("region"),
            item.get("plan"),
        )
    current = find_instance(key, label)
    if current is None:
        print(f"target_label={label} missing")
    else:
        print(f"target_ip={current.get('main_ip') or 'pending'}")
        print(f"target_status={current.get('status')}")


def create_instance(key: str, args: argparse.Namespace) -> dict:
    existing = find_instance(key, args.label)
    if existing:
        print(f"instance already exists label={args.label} ip={existing.get('main_ip') or 'pending'}")
        return existing
    ssh_id = ensure_ssh_key(key, Path(args.ssh_pub).expanduser())
    os_id = find_os(key, args.os_name)
    user_data = base64.b64encode(CLOUD_INIT.read_text().encode()).decode()
    payload = {
        "region": args.region,
        "plan": args.plan,
        "os_id": os_id,
        "label": args.label,
        "hostname": args.hostname,
        "sshkey_id": [ssh_id],
        "user_data": user_data,
        "backups": "disabled",
        "ddos_protection": False,
        "activation_email": False,
        "tags": ["hackcmu", "optune"],
    }
    created = request(key, "POST", "/instances", payload)["instance"]
    print(f"created label={created.get('label')} id={created.get('id')}")
    return created


def wait_for_ip(key: str, label: str, timeout: int) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        item = find_instance(key, label)
        if item and item.get("main_ip") and item["main_ip"] != "0.0.0.0" and item.get("status") == "active":
            print(item["main_ip"])
            return item["main_ip"]
        time.sleep(8)
    raise SystemExit(f"timed out waiting for {label} to become active")


def destroy_instance(key: str, label: str) -> None:
    item = find_instance(key, label)
    if item is None:
        print(f"nothing to destroy label={label}")
        return
    request(key, "DELETE", f"/instances/{item['id']}")
    print(f"destroyed label={label}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("status", "create", "wait", "destroy"))
    parser.add_argument("--label", default=DEFAULT_LABEL)
    parser.add_argument("--hostname", default="optune")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--plan", default=DEFAULT_PLAN)
    parser.add_argument("--os-name", default=DEFAULT_OS)
    parser.add_argument("--ssh-pub", default=str(Path.home() / ".ssh/id_ed25519.pub"))
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    key = load_api_key()
    if args.command == "status":
        print_status(key, args.label)
    elif args.command == "create":
        create_instance(key, args)
        print_status(key, args.label)
    elif args.command == "wait":
        wait_for_ip(key, args.label, args.timeout)
    elif args.command == "destroy":
        destroy_instance(key, args.label)


if __name__ == "__main__":
    sys.exit(main())
