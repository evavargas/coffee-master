"""Write backend/openapi.json from the FastAPI app, deterministically.

Needs no network and no real secrets: placeholders are set before the app is imported
(real environment values, if any, are left alone since they never reach the schema).
Run from backend/:  .venv/bin/python -m scripts.export_openapi
"""

import json
import os
from pathlib import Path

OPENAPI_PATH = Path(__file__).resolve().parents[1] / "openapi.json"


def render_openapi() -> str:
    os.environ.setdefault("JWT_SECRET", "openapi-export-placeholder")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    from app.main import app

    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    OPENAPI_PATH.write_text(render_openapi(), encoding="utf-8")
    print(f"Wrote {OPENAPI_PATH}")


if __name__ == "__main__":
    main()
