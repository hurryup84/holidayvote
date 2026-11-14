#!/usr/bin/env bash
# Build the app and install it on a connected Android phone (USB or Wi-Fi debugging) – keeps the
# app's data (update, not reinstall), then starts it.
#   npm run android:install            → development build (debug page, sharing from .env.local)
#   npm run android:install -- prod    → production web build (no debug tools)
# Finds the Android SDK and a Java that Gradle supports by itself: nothing needs to be in PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-dev}"
APP_ID="com.moidev.holidayvote"

# --- Android SDK (adb) ---
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
if [ ! -x "$ADB" ]; then
  echo "✗ Android SDK not found at $SDK (set ANDROID_HOME, or install it via Android Studio → SDK Manager)." >&2
  exit 1
fi
export ANDROID_HOME="$SDK"

# --- Java for Gradle: the JDK bundled with Android Studio (the system Java may be too new) ---
STUDIO_JDK="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$STUDIO_JDK" ]; then
  export JAVA_HOME="$STUDIO_JDK"
fi
if [ -z "${JAVA_HOME:-}" ]; then
  echo "✗ No Java for Gradle found. Install Android Studio or set JAVA_HOME to a JDK 21." >&2
  exit 1
fi

# --- Phone ---
DEVICES=$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if [ -z "$DEVICES" ]; then
  echo "✗ No phone connected. USB: plug in + allow debugging. Wi-Fi: Developer options → Wireless debugging" >&2
  echo "  (pair once in Android Studio → Device Manager → Pair devices using Wi-Fi). Then run this again." >&2
  "$ADB" devices >&2
  exit 1
fi
SERIAL="${ANDROID_SERIAL:-$(echo "$DEVICES" | head -1)}"
MODEL=$("$ADB" -s "$SERIAL" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
echo "▸ Phone: ${MODEL:-$SERIAL}"

echo "▸ 1/4 Web build ($MODE)"
if [ "$MODE" = "prod" ]; then npm run build --silent; else npm run build:dev --silent; fi

echo "▸ 2/4 Capacitor sync"
npx cap sync android >/dev/null

echo "▸ 3/4 Android build (Gradle, Java: $JAVA_HOME)"
(cd android && ./gradlew assembleDebug -q)
APK="android/app/build/outputs/apk/debug/app-debug.apk"

echo "▸ 4/4 Install (keeps the app's data) – keep the phone unlocked"
if ! OUT=$("$ADB" -s "$SERIAL" install -r "$APK" 2>&1); then
  echo "$OUT" >&2
  if echo "$OUT" | grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE"; then
    echo "" >&2
    echo "✗ The app on the phone was signed with a different key (built on another computer?)." >&2
    echo "  Don't uninstall it: that deletes the phone's data and its sharing account." >&2
  fi
  if echo "$OUT" | grep -qE "offline|closed|not found"; then
    echo "" >&2
    echo "✗ Lost the connection to the phone. Unlock it, check that Wireless debugging is still on" >&2
    echo "  (Developer options), then run this again." >&2
  fi
  exit 1
fi
"$ADB" -s "$SERIAL" shell am start -n "$APP_ID/.MainActivity" >/dev/null
echo "✔ Installed and started on ${MODEL:-$SERIAL}"
