"""Dump the FastAPI app's OpenAPI schema to stdout (no server needed)."""

import json
import sys

from main import app

json.dump(app.openapi(), sys.stdout, indent=2)
print()  # trailing newline
