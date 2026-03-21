#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Dumping OpenAPI schema from backend..."
(cd ../backend && uv run dump_openapi.py) > openapi.json

echo "==> Running Orval..."
npx orval

echo "==> Running sse-codegen..."
npx sse-codegen --input openapi.json --output src/generated/sse --base-url ""

echo "Done!"
