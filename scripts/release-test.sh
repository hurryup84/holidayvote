#!/usr/bin/env bash
# Test release for both stores in one go:  npm run release:test [-- ios | android] [-- --draft] [-- --skip-tests]
#   1. lint + tests (ESLint, Vitest, ~30 s) – a broken build never reaches testers
#   2. iOS:     production web build + cap sync ios + build number = latest TestFlight build + 1
#               + signed build → TestFlight                         (fastlane ios beta)
#   3. Android: production web build + cap sync android + versionCode = highest on Google Play + 1
#               + signed bundle → internal testing                   (fastlane android internal)
# Options:  ios / android   only that platform
#           --draft         Android release as draft (needed while the app isn't published on Google Play yet)
#           --skip-tests    skip step 1 (lint and tests)
# Afterwards: commit the raised build numbers (ios/App/App.xcodeproj/project.pbxproj, android/app/build.gradle).
set -euo pipefail
cd "$(dirname "$0")/.."

ios=1 android=1 draft="" tests=1
for arg in "$@"; do
  case "$arg" in
    ios) android=0 ;;
    android) ios=0 ;;
    --draft) draft="status:draft" ;;
    --skip-tests) tests=0 ;;
    *) echo "Unknown option: $arg (ios | android | --draft | --skip-tests)" >&2; exit 1 ;;
  esac
done

# Node 22 like everywhere in this project (nvm is a shell function, so load it first).
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
  nvm use 22 >/dev/null
fi

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
started=$(date +%s)

if [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes – they go into this build."
fi

if [ "$tests" = 1 ]; then
  step "Lint + tests"
  npm run lint --silent
  npm test --silent
fi

if [ "$ios" = 1 ]; then
  step "iOS → TestFlight"
  (cd ios && fastlane ios beta)
fi

if [ "$android" = 1 ]; then
  step "Android → Google Play internal testing"
  (cd android && fastlane android internal $draft)
fi

version=$(node -p "require('./package.json').version")
ios_build=$(sed -n 's/.*CURRENT_PROJECT_VERSION = \([0-9]*\);.*/\1/p' ios/App/App.xcodeproj/project.pbxproj | head -1)
android_code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]*\([0-9]*\).*/\1/p' android/app/build.gradle | head -1)
step "Done in $(( ($(date +%s) - started) / 60 )) min – version $version"
[ "$ios" = 1 ] && echo "  iOS build $ios_build: TestFlight (internal testers get it once Apple has processed it, ~10–30 min)"
[ "$android" = 1 ] && echo "  Android versionCode $android_code: internal testing on Google Play"
echo "  Commit the new build numbers: git commit -am \"Test release $version\""
