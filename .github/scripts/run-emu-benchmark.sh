#!/usr/bin/env bash
# TEMPORARY: drives the automated perf benchmark on the CI emulator.
# Installs the debug APK, warm-launches the app (so the JS deep-link
# listener is registered before the VIEW intent arrives — a cold-start
# VIEW intent races JS init and the trigger can be lost), fires the
# autoperf deep link, waits for the trigger receipt + report file, pulls
# the report via `adb run-as`, and prints a short summary.
# Emulator numbers are preliminary smoke numbers — never J7 Prime measurements.
# Delete with .github/workflows/perf-baseline.yml when the baseline is done.
set -euo pipefail

APK="android/app/build/outputs/apk/debug/app-debug.apk"
OUT="perf-report.emulator.json"

fail_diagnostics() {
  echo "--- app process ---"
  adb shell pidof app.noma.notes || echo "(app not running)"
  echo "--- app logcat (filtered) ---"
  adb logcat -d | grep -iE "autoperf|noma|capacitor|chromium|AndroidRuntime" | tail -n 80 || true
}

adb install -r "$APK"

# Warm start so the JS app (and its appUrlOpen listener) is fully booted
# before the deep link is delivered.
echo "Warm-launching the app…"
adb shell am start -n app.noma.notes/.MainActivity >/dev/null

echo "Waiting for the native bridge to start (up to ~3 min)…"
BOOT=""
for i in $(seq 1 36); do
  if adb logcat -d 2>/dev/null | grep -q "Capacitor: App started"; then
    BOOT=1
    echo "Bridge started."
    break
  fi
  sleep 5
done
if [ -z "$BOOT" ]; then
  echo "WARNING: no App-started marker seen; continuing anyway."
fi
echo "Waiting 60s for the JS app to finish booting…"
sleep 60

echo "Firing autoperf deep link…"
adb shell am start -a android.intent.action.VIEW -d "app.noma.notes://autoperf?env=emulator"

echo "Waiting for trigger receipt (up to ~3 min)…"
TRIGGER=""
for i in $(seq 1 36); do
  if adb shell "run-as app.noma.notes ls files/perf-trigger.json" 2>/dev/null | grep -q "perf-trigger.json"; then
    TRIGGER=1
    echo "Trigger reached the app."
    break
  fi
  sleep 5
done
if [ -z "$TRIGGER" ]; then
  echo "ERROR: autoperf trigger never reached the app."
  fail_diagnostics
  exit 1
fi

echo "Waiting for perf-report.json (up to ~15 min)…"
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
  fail_diagnostics
  exit 1
fi

adb exec-out run-as app.noma.notes cat files/perf-report.json > "$OUT"

python3 - <<'EOF'
import json
r = json.load(open("perf-report.emulator.json"))
print("environment:", r["environment"]["label"])
print("WARNING:", r["environment"]["warning"])
for note in r.get("notes", []):
    print("note:", note)
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
