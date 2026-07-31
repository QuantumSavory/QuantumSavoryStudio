#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

python3 -B -m unittest discover -s ci -p 'test_lint_repository_docs.py'

python3 -B ci/lint_repository_docs.py . \
    --source-root src \
    --source-root gui \
    --source-root mcp \
    --source-root contracts \
    --fail-on-warn
