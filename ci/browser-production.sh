#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
server_port=${WEBQUANTUMSAVORY_CI_SERVER_PORT:-8004}

"$app_root/ci/instantiate-julia.sh"
npm --prefix "$app_root/gui" ci --include=dev

cd "$app_root/gui"
if [ "${PLAYWRIGHT_INSTALL_SYSTEM_DEPS:-false}" = true ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

export CI=true
export WEBQUANTUMSAVORY_CI_SERVER_PORT="$server_port"
export WEBQUANTUMSAVORY_CI_SERVER_PROFILE=production
export WEBQUANTUMSAVORY_PLAYWRIGHT_BASE_URL="http://127.0.0.1:$server_port"
exec "$app_root/ci/run-with-server.sh" gui \
  npx playwright test \
    --project=chromium \
    tests/e2e/smoke.spec.js \
    tests/e2e/main.spec.js
