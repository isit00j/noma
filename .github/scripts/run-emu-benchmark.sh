#!/usr/bin/env bash
# TEMPORARY: drives the automated perf benchmark on the CI emulator.
# Installs the debug APK, fires the autoperf deep link, waits for the
# report file, pulls it via `adb run-as`, and prints a short summary.
# Emulator numbers are preliminary smoke numbers — never J7 Prime measurements.
# Delete with .github/workflows/perf-baseline.yml when the baseline is done.
set -euo pipefail

APK="android/app/build/outputs/apk/debug/app-debug.apk"
OUT="perf-report.emulator.json"

adb install -r "$APK"
adb shell am start -a android.intent.action.VIEW -d "app.noma.notes://autoperf?env=emulator"

echo "Waiting for perf-report.json (up to ~15 min)..."
READY=""
for i in $(seq 1 150); do
  if adb shell "run-as app.noma.notes ls files/perf-report.json" 2>/dev/null | grep -q "perf-report.json"; then
    READY=1
    echo "Report ready after ~$((i * 6))s"
    break
  fi
  sleep 6
done

if [ -z "$READY" ]; then
  echo "ERROR: benchmark report never appeared."
  adb logcat -d | tail -n 200 || true
  exit 1
fi

adb exec-out run-as app.noma.notes cat files/perf-report.json > "$OUT"

python3 - <<'EOF'
import json
r = json.load(open("perf-report.emulator.json"))
print("environment:", r["environment"]["label"])
print("WARNING:", r["environment"]["warning"])
for size in sorted(r["automated"]["sizes"], key=int):
    s = r["automated"]["sizes"][size]
    print(f"--- {size} notes ---")
    print("  fixture gen:", s["fixture"]["generationMs"], "ms")
    print("  dexie toArray:", s["dexie"]["toArray"], "ms")
    ed = s["editor"]
    print("  editor:", ed if "failed" in ed else "tap->painted %s ms" % ed["tapToEditorPaintedMs"])
    lr = s["listRender"]
    print("  list:", lr if "failed" in lr else "fixture->painted %s ms" % lr["fixtureToListPaintedMs"])
EOF
