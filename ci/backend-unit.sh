#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$app_root/ci/instantiate-julia.sh"
cd "$app_root/test"
exec env WQS_ENABLE_SOURCE_EVALUATION=true \
  julia --project=. runtests.jl test_unit
