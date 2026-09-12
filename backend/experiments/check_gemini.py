"""Send one small request to the configured Google Cloud project."""
import os
from backend.common.config import google_project
import sys

from backend.common.gemini import client as gemini_client, credentials
from google.genai import types
from google.auth.exceptions import DefaultCredentialsError


def main():
    project = google_project()
    model = os.environ.get("GEMINI_TEST_MODEL", "gemini-2.5-flash")
    print(f"Project: {project}\nModel: {model}", flush=True)
    try:
        identity = credentials() if os.getenv("GEMINI_AUTH_MODE", "adc") == "adc" else None
        print(f"Identity type: {type(identity).__name__}")
        if identity and getattr(identity, "service_account_email", None):
            print(f"Service account: {identity.service_account_email}")
        with gemini_client(timeout_ms=30000) as client:
            response = client.models.generate_content(
                model=model,
                contents="Reply with only OK.",
                config=types.GenerateContentConfig(
                    max_output_tokens=16,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
        print(f"Response: {response.text}")
        if not response.text:
            print("FAIL: no text returned", file=sys.stderr)
            return 1
        print("PASS: authenticated generation request succeeded")
        return 0
    except DefaultCredentialsError:
        print("BLOCKED: local Application Default Credentials are missing.", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"FAIL: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
