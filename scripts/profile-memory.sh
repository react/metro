#!/bin/bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# Metro Memory Profiling Harness
#
# Measures RSS before, during, and after building a bundle.
#
# Usage:
#   1. Start Metro in another terminal:
#        NODE_ARGS="--expose-gc" DEV=1 js1 run --prefetch=false
#
#   2. Run this script (default: WildeBundle on port 8081):
#        ./profile-memory.sh
#
#   Options:
#     --port=PORT        Metro port (default: 8081)
#     --bundle=PATH      Bundle path (default: WildeBundle)
#     --platform=PLAT    Platform (default: ios)
#     --app=APP          App identifier (default: com.facebook.Wilde)
#     --no-delete        Skip the DELETE request (keep graph in memory)
#     --repeat=N         Build N times to measure steady-state (default: 1)

set -euo pipefail

PORT=8081
BUNDLE_PATH="xplat/js/RKJSModules/EntryPoints/WildeBundle.bundle"
PLATFORM="ios"
APP="com.facebook.Wilde"
DO_DELETE=true
REPEAT=1

for arg in "$@"; do
  case $arg in
    --port=*) PORT="${arg#*=}" ;;
    --bundle=*) BUNDLE_PATH="${arg#*=}" ;;
    --platform=*) PLATFORM="${arg#*=}" ;;
    --app=*) APP="${arg#*=}" ;;
    --no-delete) DO_DELETE=false ;;
    --repeat=*) REPEAT="${arg#*=}" ;;
    --help)
      sed -n '2,/^$/p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

BUNDLE_URL="http://localhost:$PORT/$BUNDLE_PATH?platform=$PLATFORM&dev=true&app=$APP"
STATUS_URL="http://localhost:$PORT/status"

BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

find_metro_pid() {
  pgrep -f "[f]b-metro-cli/index.js" 2>/dev/null | head -1 || true
}

read_rss_mb() {
  awk '/^VmRSS:/ {printf "%d", $2/1024}' /proc/"$1"/status 2>/dev/null
}

read_hwm_mb() {
  awk '/^VmHWM:/ {printf "%d", $2/1024}' /proc/"$1"/status 2>/dev/null
}

print_proc_memory() {
  local pid=$1
  echo "  VmRSS  (current resident): $(awk '/^VmRSS:/  {printf "%d MB", $2/1024}' /proc/"$pid"/status)"
  echo "  VmHWM  (peak resident):    $(awk '/^VmHWM:/  {printf "%d MB", $2/1024}' /proc/"$pid"/status)"
  echo "  VmSize (virtual):          $(awk '/^VmSize:/ {printf "%d MB", $2/1024}' /proc/"$pid"/status)"
  echo "  VmData (heap+data):        $(awk '/^VmData:/ {printf "%d MB", $2/1024}' /proc/"$pid"/status)"
}

echo -e "${BOLD}Metro Memory Profiler${NC}"
echo ""

# Find Metro
METRO_PID=$(find_metro_pid)
if [ -z "$METRO_PID" ]; then
  echo "Metro is not running. Start it first:"
  echo ""
  echo '  NODE_ARGS="--expose-gc" DEV=1 js1 run --prefetch=false'
  echo ""
  echo "For V8 heap inspection via Chrome DevTools, add --inspect:"
  echo ""
  echo '  NODE_ARGS="--expose-gc --inspect=9230" DEV=1 js1 run --prefetch=false'
  echo "  Then open chrome://inspect and connect to the Metro process."
  exit 1
fi
echo "Metro PID: $METRO_PID"

# Wait for ready
echo -n "Waiting for Metro... "
READY=false
for _ in $(seq 1 120); do
  if curl -s --connect-timeout 2 "$STATUS_URL" 2>/dev/null | grep -q "packager-status:running"; then
    READY=true
    echo "ready"
    break
  fi
  sleep 1
done
if [ "$READY" = false ]; then
  echo "timed out after 120s"
  exit 1
fi

# Baseline
echo ""
echo -e "${BOLD}Baseline (startup complete, no bundles loaded)${NC}"
BASELINE_RSS=$(read_rss_mb "$METRO_PID")
print_proc_memory "$METRO_PID"

# Start background sampler
SAMPLE_FILE=$(mktemp /tmp/metro-mem-XXXXXX.csv)
echo "epoch_s,rss_mb" > "$SAMPLE_FILE"
(
  while kill -0 "$METRO_PID" 2>/dev/null; do
    rss=$(read_rss_mb "$METRO_PID")
    [ -n "$rss" ] && echo "$(date +%s),$rss" >> "$SAMPLE_FILE"
    sleep 1
  done
) &
SAMPLER_PID=$!
trap 'kill "$SAMPLER_PID" 2>/dev/null; wait "$SAMPLER_PID" 2>/dev/null || true' EXIT

for iteration in $(seq 1 "$REPEAT"); do
  if [ "$REPEAT" -gt 1 ]; then
    echo ""
    echo -e "${BOLD}=== Iteration $iteration / $REPEAT ===${NC}"
  fi

  # Build
  echo ""
  echo -e "${BOLD}Building bundle${NC}"
  echo -e "${DIM}  $BUNDLE_URL${NC}"
  BUILD_START=$(date +%s)
  HTTP_OUT=$(curl -sS -o /dev/null -w "%{http_code}\t%{time_total}\t%{size_download}" "$BUNDLE_URL" 2>&1)
  BUILD_END=$(date +%s)

  HTTP_CODE=$(echo "$HTTP_OUT" | cut -f1)
  HTTP_TIME=$(echo "$HTTP_OUT" | cut -f2)
  HTTP_SIZE=$(echo "$HTTP_OUT" | cut -f3)

  echo "  HTTP $HTTP_CODE in ${HTTP_TIME}s, $(echo "$HTTP_SIZE" | awk '{printf "%.1f MB", $1/1048576}') (wall: $((BUILD_END - BUILD_START))s)"

  if [ "$HTTP_CODE" != "200" ]; then
    echo "  Bundle build failed (HTTP $HTTP_CODE). Check Metro logs."
    echo "  Try the URL in a browser to see the error:"
    echo "    $BUNDLE_URL"
    kill "$SAMPLER_PID" 2>/dev/null
    exit 1
  fi

  sleep 2
  echo ""
  echo -e "${BOLD}Post-build${NC}"
  POSTBUILD_RSS=$(read_rss_mb "$METRO_PID")
  print_proc_memory "$METRO_PID"

  # Delete graph
  if [ "$DO_DELETE" = true ]; then
    echo ""
    echo -e "${BOLD}After DELETE (graph freed)${NC}"
    curl -sS -X DELETE "$BUNDLE_URL" > /dev/null 2>&1
    sleep 2
    POSTDELETE_RSS=$(read_rss_mb "$METRO_PID")
    print_proc_memory "$METRO_PID"
  else
    POSTDELETE_RSS=$POSTBUILD_RSS
  fi
done

# Stop sampler
kill "$SAMPLER_PID" 2>/dev/null || true
wait "$SAMPLER_PID" 2>/dev/null || true
trap - EXIT

# Peak from samples (HWM from /proc is more reliable than 1s polling)
PEAK_RSS=$(read_hwm_mb "$METRO_PID")
[ -z "$PEAK_RSS" ] && PEAK_RSS=$POSTBUILD_RSS

# Summary
echo ""
echo -e "${BOLD}Summary${NC}"
echo "-------"
printf "  %-30s %6s MB\n" "Baseline RSS:" "$BASELINE_RSS"
printf "  %-30s %6s MB\n" "Peak RSS (sampled @1s):" "$PEAK_RSS"
printf "  %-30s %6s MB\n" "Post-build RSS:" "$POSTBUILD_RSS"
if [ "$DO_DELETE" = true ]; then
  printf "  %-30s %6s MB\n" "Post-delete RSS:" "$POSTDELETE_RSS"
fi
echo ""
printf "  %-30s %+6d MB\n" "Growth (build):" "$((POSTBUILD_RSS - BASELINE_RSS))"
if [ "$DO_DELETE" = true ]; then
  printf "  %-30s %+6d MB\n" "Retained after delete:" "$((POSTDELETE_RSS - BASELINE_RSS))"
fi
echo ""

# Save report
REPORT="/tmp/metro-memory-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "Metro Memory Profile — $(date)"
  echo "Bundle: $BUNDLE_PATH ($PLATFORM, app=$APP)"
  echo "PID: $METRO_PID"
  echo ""
  echo "Baseline RSS:      ${BASELINE_RSS} MB"
  echo "Peak RSS:          ${PEAK_RSS} MB"
  echo "Post-build RSS:    ${POSTBUILD_RSS} MB"
  echo "Post-delete RSS:   ${POSTDELETE_RSS} MB"
  echo "Build growth:      $((POSTBUILD_RSS - BASELINE_RSS)) MB"
  echo "Retained:          $((POSTDELETE_RSS - BASELINE_RSS)) MB"
  echo ""
  echo "Samples (${SAMPLE_FILE}):"
  cat "$SAMPLE_FILE" 2>/dev/null || echo "(no samples)"
} > "$REPORT"

echo "Report: $REPORT"
echo "Samples: $SAMPLE_FILE"
