fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios build

```sh
[bundle exec] fastlane ios build
```

Compile the app for the simulator (quick sanity check, no signing, no upload)

### ios bump

```sh
[bundle exec] fastlane ios bump
```

Set the build number to (latest TestFlight build of this version) + 1

### ios archive

```sh
[bundle exec] fastlane ios archive
```

Build and sign the App Store IPA locally (checks signing) – no upload

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build, sign and push a new beta build to TestFlight (bumps the build number automatically)

### ios update_metadata

```sh
[bundle exec] fastlane ios update_metadata
```

Upload only the App Store metadata (texts, URLs, categories, age rating, review info) – no binary, no screenshots

### ios upload_screenshots

```sh
[bundle exec] fastlane ios upload_screenshots
```

Upload only the screenshots (ios/fastlane/screenshots/<locale>/) – replaces the ones in App Store Connect

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
