#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
engine=${1-}

case "$engine" in
  firefox|webkit)
    ;;
  *)
    echo "usage: $0 firefox|webkit" >&2
    exit 2
    ;;
esac

"$app_root/ci/instantiate-julia.sh"
"$app_root/ci/frontend-build.sh"

cd "$app_root/gui"
npx playwright install --with-deps "$engine"

export CI=true
export WEBQUANTUMSAVORY_ENABLE_MCP=false
exec "$app_root/ci/run-with-server.sh" gui \
  npx playwright test \
    "--project=$engine" \
    tests/e2e/smoke.spec.js \
    tests/e2e/main.spec.js
