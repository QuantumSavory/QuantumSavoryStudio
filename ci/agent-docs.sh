#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

python3 ci/lint_repository_docs.py . \
    --source-root src \
    --source-root gui \
    --source-root mcp \
    --source-root contracts \
    --fail-on-warn
