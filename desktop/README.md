# Squitle macOS prototype

This directory is the first native-storage slice of the desktop app. It is
deliberately local-only: the macOS shell can open a schedule JSON document and
write it atomically while retaining a `.bak` copy. The production Squitle UI
will be connected after its data/core modules are extracted from the hosted
page; this prototype does not wrap the public website.

## Run on macOS

1. Install the current stable Rust toolchain and the Tauri 2 prerequisites.
2. Install the Tauri CLI: `cargo install tauri-cli --version "^2" --locked`.
3. From this directory run `cargo tauri dev --config src-tauri/tauri.conf.json`.
4. Build an app bundle with `cargo tauri build --config src-tauri/tauri.conf.json`.

The macOS app reads and writes only files explicitly selected by the user.
Credentials and WebDAV are intentionally outside this first milestone.

## Build without local setup

The repository includes the `Build Squitle for macOS` GitHub Actions workflow.
Run it manually from the Actions tab, or push a tag matching `desktop-v*`. The
workflow publishes the unsigned `.app` and `.dmg` as a downloadable build
artifact. macOS may require **Open Anyway** for this unsigned alpha build.
