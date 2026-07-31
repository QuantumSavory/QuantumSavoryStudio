#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

node "$app_root/gui/scripts/generate-http-operations.mjs" --check
"$app_root/ci/instantiate-julia.sh"

cd "$app_root/test"
exec julia --project=. runtests.jl test_http_contract
