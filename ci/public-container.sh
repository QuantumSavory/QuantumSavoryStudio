#!/bin/sh
set -eu

app_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
host_port=${WEBQUANTUMSAVORY_CI_SERVER_PORT:-8005}
container_name="webquantumsavory-public-ci-$$"
image_name="localhost/webquantumsavory-public-ci:$$"
temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/webquantumsavory-container.XXXXXX")
container_log="$temporary_dir/container.log"

case "$host_port" in
  ''|*[!0-9]*)
    echo "WEBQUANTUMSAVORY_CI_SERVER_PORT must be an integer between 1 and 65535." >&2
    exit 2
    ;;
esac
if [ "$host_port" -lt 1 ] || [ "$host_port" -gt 65535 ]; then
  echo "WEBQUANTUMSAVORY_CI_SERVER_PORT must be an integer between 1 and 65535." >&2
  exit 2
fi

command -v podman >/dev/null 2>&1 || {
  echo "public-container checks require Podman" >&2
  exit 2
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && podman container exists "$container_name"; then
    podman logs "$container_name" >"$container_log" 2>&1 || true
    tail -n 200 "$container_log" >&2 || true
  fi
  podman rm --force "$container_name" >/dev/null 2>&1 || true
  podman image rm --force "$image_name" >/dev/null 2>&1 || true
  rm -rf "$temporary_dir"
  exit "$status"
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

podman build \
  --file "$app_root/Containerfile" \
  --pull=newer \
  --tag "$image_name" \
  "$app_root"

start_container() {
  podman run \
    --detach \
    --name "$container_name" \
    --publish "127.0.0.1:$host_port:8000" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m \
    --tmpfs /home/webquantumsavory/.cache:rw,noexec,nosuid,nodev,size=256m \
    --cap-drop all \
    --security-opt no-new-privileges \
    --pids-limit 512 \
    --memory 4g \
    --env WQS_ENABLE_SOURCE_EVALUATION=true \
    "$image_name" >/dev/null
}

wait_until_ready() {
  attempts=0
  while [ "$attempts" -lt 240 ]; do
    if curl --fail --silent --show-error \
      "http://127.0.0.1:$host_port/status" >/dev/null 2>&1; then
      return 0
    fi
    podman container exists "$container_name" || return 1
    running=$(podman inspect --format '{{.State.Running}}' "$container_name")
    [ "$running" = true ] || return 1
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

start_container
wait_until_ready

platform_info=$(curl --fail --silent --show-error \
  "http://127.0.0.1:$host_port/platform_info")
printf '%s' "$platform_info" \
  | grep -Eq '"unsafe_code_evaluation"[[:space:]]*:[[:space:]]*false'
printf '%s' "$platform_info" \
  | grep -Eq '"mcp"[[:space:]]*:[[:space:]]*\{[^}]*"available"[[:space:]]*:[[:space:]]*false'

evaluation_body="$temporary_dir/evaluation.json"
evaluation_status=$(curl --silent --show-error \
  --output "$evaluation_body" \
  --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data '{"code":"open(\"/tmp/wqs-eval-canary\", \"w\")"}' \
  "http://127.0.0.1:$host_port/test_code")
[ "$evaluation_status" = 403 ]
grep -Eq '"code"[[:space:]]*:[[:space:]]*"UNSAFE_EVALUATION_DISABLED"' \
  "$evaluation_body"
podman exec "$container_name" test ! -e /tmp/wqs-eval-canary
podman exec "$container_name" test ! -e /app/db

parse_status=$(curl --silent --show-error \
  --output "$temporary_dir/parse.json" \
  --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data-binary "@$app_root/assets/startup-warmup.json" \
  "http://127.0.0.1:$host_port/parse_network_graph")
[ "$parse_status" = 200 ]
curl --fail --silent --show-error \
  "http://127.0.0.1:$host_port/simulations" \
  | grep -Fq '"2. Entangler Example with consumer"'

podman restart "$container_name" >/dev/null
wait_until_ready
if curl --fail --silent --show-error \
  "http://127.0.0.1:$host_port/simulations" \
  | grep -Fq '"2. Entangler Example with consumer"'; then
  echo "simulation state survived a public-container restart" >&2
  exit 1
fi
