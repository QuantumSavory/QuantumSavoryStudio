#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workdir=$1
shift
server_port=${WEBQUANTUMSAVORY_CI_SERVER_PORT:-8000}

case "$server_port" in
  ''|*[!0-9]*)
    echo "WEBQUANTUMSAVORY_CI_SERVER_PORT must be an integer between 1 and 65535." >&2
    exit 2
    ;;
esac
if [ "$server_port" -lt 1 ] || [ "$server_port" -gt 65535 ]; then
  echo "WEBQUANTUMSAVORY_CI_SERVER_PORT must be an integer between 1 and 65535." >&2
  exit 2
fi
WEBQUANTUMSAVORY_CI_SERVER_PORT=$server_port
export WEBQUANTUMSAVORY_CI_SERVER_PORT
WEBQUANTUMSAVORY_TEST_BASE_URL="http://127.0.0.1:$server_port"
export WEBQUANTUMSAVORY_TEST_BASE_URL

log_dir=$(mktemp -d "${TMPDIR:-/tmp}/webquantumsavory-ci.XXXXXX")
server_log="$log_dir/server.log"
artifact_dir="$app_root/ci-artifacts"
server_pid=

stop_server() {
  [ -n "$server_pid" ] || return 0
  if kill "$server_pid" 2>/dev/null; then
    attempts=0
    while kill -0 "$server_pid" 2>/dev/null && [ "$attempts" -lt 10 ]; do
      sleep 1
      attempts=$((attempts + 1))
    done

    if kill -0 "$server_pid" 2>/dev/null; then
      kill -KILL "$server_pid" 2>/dev/null || true
    fi
  fi
  wait "$server_pid" 2>/dev/null || true
}

collect_failure_artifacts() {
  mkdir -p "$artifact_dir"
  cp "$server_log" "$artifact_dir/server.log"

  if [ -d "$app_root/gui/test-results" ]; then
    cp -R "$app_root/gui/test-results" "$artifact_dir/"
  fi
  if [ -d "$app_root/gui/playwright-report" ]; then
    cp -R "$app_root/gui/playwright-report" "$artifact_dir/"
  fi
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  stop_server

  if [ "$status" -ne 0 ]; then
    collect_failure_artifacts
    echo "Backend log (last 200 lines):" >&2
    tail -n 200 "$server_log" >&2 || true
  fi

  rm -rf "$log_dir"
  exit "$status"
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

rm -rf "$artifact_dir"
: > "$server_log"
cd "$app_root"
GENIE_ENV=test WQS_ENABLE_SOURCE_EVALUATION=true \
  julia --color=yes --project="$app_root" \
  -e '
    using WebQuantumSavory
    server_port = parse(Int, ENV["WEBQUANTUMSAVORY_CI_SERVER_PORT"])
    push!(ARGS, "-p$server_port")
    WebQuantumSavory.main()
    WebQuantumSavory.Genie.config.server_port = server_port
    servers = WebQuantumSavory.up(async=true)
    server = servers.webserver
    server === nothing && error("Test server failed to start")
    println(stderr, "__WEBQUANTUMSAVORY_CI_READY__ pid=$(getpid())")
    flush(stderr)
    wait(server)
  ' >"$server_log" 2>&1 &
server_pid=$!
server_ready_marker="__WEBQUANTUMSAVORY_CI_READY__ pid=$server_pid"

server_owns_port() {
  kill -0 "$server_pid" 2>/dev/null || return 1

  if command -v ss >/dev/null 2>&1 \
    && ss -H -ltnp "( sport = :$server_port )" 2>/dev/null \
      | grep -Fq "pid=$server_pid,"; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1 \
    && lsof -nP -a -p "$server_pid" -iTCP:"$server_port" -sTCP:LISTEN -t 2>/dev/null \
      | grep -Fxq "$server_pid"; then
    return 0
  fi
  grep -Fq "$server_ready_marker" "$server_log"
}

ready=false
attempts=0
while [ "$attempts" -lt 120 ]; do
  # A different worktree can answer /status while this process is still
  # starting. Require our own process to own the configured port before accepting it.
  if curl --fail --silent --show-error \
    "http://127.0.0.1:$server_port/status" >/dev/null 2>&1 \
    && server_owns_port; then
    ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Backend exited before becoming ready." >&2
    exit 1
  fi
  attempts=$((attempts + 1))
  sleep 1
done

if [ "$ready" != true ]; then
  echo "Backend did not become ready within 120 seconds." >&2
  exit 1
fi

cd "$app_root/$workdir"
"$@"
