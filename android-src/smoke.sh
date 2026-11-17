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
    coords="$(python3 - "$RUNNER_TEMP/fogo-tecnico-ui.xml" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

for node in ET.parse(sys.argv[1]).iter('node'):
    if node.get('text') != 'Ação' or node.get('clickable') != 'true':
        continue
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
    if x1 < x2 and y1 < y2:
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)"
    if [[ -n "$coords" ]]; then
      read -r x y <<< "$coords"
      adb shell input tap "$x" "$y"
      adb shell uiautomator dump /sdcard/fogo-tecnico-ui.xml
      adb pull /sdcard/fogo-tecnico-ui.xml "$RUNNER_TEMP/fogo-tecnico-ui.xml"
      if grep -q 'Ficha de ação' "$RUNNER_TEMP/fogo-tecnico-ui.xml"; then
        echo 'Dashboard and action navigation rendered on Android'
        exit 0
      fi
    fi
  fi
  sleep 2
done
adb logcat -d -t 300 -s Capacitor chromium AndroidRuntime
exit 1
