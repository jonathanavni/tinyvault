#!/bin/bash
set -euo pipefail

tool_dir="$(cd "$(dirname "$0")" && pwd)"
checkout_root="$(cd "$tool_dir/../.." && pwd)"
campaign_js="$tool_dir/campaign.mjs"
out=""
runs=""
resume=0
plan=0
new_campaign=0
cooldown_seconds=0

while (($# > 0)); do
  case "$1" in
    --out) out="${2:?missing --out value}"; shift 2 ;;
    --runs) runs="${2:?missing --runs value}"; shift 2 ;;
    --resume) resume=1; shift ;;
    --plan) plan=1; shift ;;
    --new-campaign) new_campaign=1; shift ;;
    --cooldown-seconds) cooldown_seconds="${2:?missing cooldown value}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$out" ]] || { echo "--out is required" >&2; exit 1; }
[[ "$runs" =~ ^[0-9]+$ ]] || { echo "--runs must be an integer" >&2; exit 1; }
[[ "$cooldown_seconds" =~ ^[0-9]+$ ]] || { echo "--cooldown-seconds must be an integer" >&2; exit 1; }
if ((plan == 0 && runs != 20)); then
  echo "real campaigns require --runs 20" >&2
  exit 1
fi

status="$(git -C "$checkout_root" status --short --untracked-files=all)"
[[ -z "$status" ]] || { echo "checkout is dirty:" >&2; echo "$status" >&2; exit 1; }
candidate="$(git -C "$checkout_root" rev-parse HEAD)"
freeze_args=(freeze --out "$out" --runs "$runs" --candidate "$candidate" --cooldown-seconds "$cooldown_seconds")
((resume == 0)) || freeze_args+=(--resume)
((plan == 0)) || freeze_args+=(--plan)
((new_campaign == 0)) || freeze_args+=(--new-campaign)
next="$(node "$campaign_js" "${freeze_args[@]}")"
[[ "$next" =~ ^[0-9]+$ ]] || { echo "freeze returned an invalid next run: $next" >&2; exit 1; }
((next >= 1 && next <= runs + 1)) || { echo "freeze returned an out-of-range run: $next" >&2; exit 1; }

if ((plan == 1)); then
  number="$next"
  while ((number <= runs)); do
    label="$(printf '%02d' "$number")"
    if [[ -f "$out/run-$label/started.json" && ! -f "$out/run-$label/ended.json" ]]; then
      echo "run-$label: preserve incomplete started run"
    elif [[ -f "$out/run-$label/ended.json" ]]; then
      echo "run-$label: already ended"
    else
      echo "run-$label: make test"
    fi
    number=$((number + 1))
  done
  exit 0
fi

capture_raw() {
  local name="$1"
  shift
  set +e
  "$@" > "$run_dir/raw/$name.txt" 2>&1
  local code=$?
  set -e
  printf '%s\n' "$code" > "$run_dir/raw/$name.exit"
}

number="$next"
while ((number <= runs)); do
  label="$(printf '%02d' "$number")"
  run_dir="$out/run-$label"
  if [[ -f "$run_dir/started.json" && ! -f "$run_dir/ended.json" ]]; then
    echo "run-$label is an incomplete started run; preserving it without retry"
    number=$((number + 1))
    continue
  fi
  if [[ -f "$run_dir/ended.json" ]]; then
    number=$((number + 1))
    continue
  fi
  current_head="$(git -C "$checkout_root" rev-parse HEAD)"
  current_status="$(git -C "$checkout_root" status --short --untracked-files=all)"
  node "$campaign_js" start --out "$out" --run "$number" \
    --candidate "$current_head" --git-status "$current_status"
  capture_raw processes ps -axo pid,ppid,pcpu,etime,command
  capture_raw cpus sysctl -n hw.ncpu
  capture_raw uptime uptime
  capture_raw power pmset -g batt
  capture_raw thermal pmset -g therm
  capture_raw node-version node --version
  capture_raw git-head git -C "$checkout_root" rev-parse HEAD
  capture_raw git-status git -C "$checkout_root" status --short --untracked-files=all
  capture_raw captured-at date -u +%FT%TZ
  capture_raw playwright cat "$checkout_root/node_modules/playwright/package.json"
  capture_raw chromium-package node -e \
    "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))" \
    "$checkout_root/node_modules/playwright-core/package.json"
  capture_raw chromium-cache node -e \
    "const fs=require('node:fs'),os=require('node:os'),p=require('node:path').join(os.homedir(),'Library/Caches/ms-playwright');process.stdout.write(fs.readdirSync(p).join('\\n'))"
  capture_raw memory-free node -e "console.log(require('node:os').freemem())"
  node "$campaign_js" host-state --out "$out" --run "$number" --own-pid "$$" --checkout-root "$checkout_root"
  start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  set +e
  (
    cd "$checkout_root"
    make test
  ) > "$run_dir/make-test.log" 2>&1
  exit_code=$?
  set -e
  end_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  duration_ms=$((end_ms - start_ms))
  node "$campaign_js" finish --out "$out" --run "$number" --exit "$exit_code" \
    --duration-ms "$duration_ms" --checkout-root "$checkout_root"
  if ((number < runs && cooldown_seconds > 0)); then sleep "$cooldown_seconds"; fi
  number=$((number + 1))
done
