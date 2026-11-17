#!/usr/bin/env bash
set -euo pipefail
package=pt.ignispyro.fogotecnico
adb install "$1"
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell am start -W -n "$package/.MainActivity"
for attempt in {1..12}; do
  adb shell uiautomator dump /sdcard/fogo-tecnico-ui.xml || continue
  adb pull /sdcard/fogo-tecnico-ui.xml "$RUNNER_TEMP/fogo-tecnico-ui.xml" || { sleep 2; continue; }
  if grep -qi 'Sem ações arquivadas' "$RUNNER_TEMP/fogo-tecnico-ui.xml"; then
    adb shell pidof "$package"
    echo 'Dashboard rendered on Android'
    exit 0
  fi
  sleep 2
done
adb logcat -d -t 300 -s Capacitor chromium AndroidRuntime
exit 1
