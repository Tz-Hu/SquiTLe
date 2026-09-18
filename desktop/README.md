# Squitle macOS

The desktop app packages the same TimeLine, TodoList, project, task, dependency,
settings, import, and export interface as the web app. Its schedule document is
stored outside the application bundle and written atomically with a `.bak`
copy, so an application update never replaces user data.

## Run on macOS

1. Install the current stable Rust toolchain and the Tauri 2 prerequisites.
2. Run `pnpm install` in the repository root.
3. From `desktop`, run `pnpm exec tauri dev --config src-tauri/tauri.conf.json`.
4. Build with `pnpm exec tauri build --config src-tauri/tauri.conf.json`.

Credentials and WebDAV are intentionally outside this milestone.

## Build without local setup

Version 0.2 packages the same TimeLine and TodoList interface as the web app.
Schedule data is written atomically to the app data directory and retains a
`.bak` copy, so replacing or updating the application does not replace user data.

The repository includes the `Build Squitle for macOS` GitHub Actions workflow.
Updater bundles are signed with a long-lived Tauri key stored only in GitHub
Actions secrets. The app checks the latest GitHub Release after startup, asks
before installing, and restarts into the new version in place.
Run it manually from the Actions tab, or push a tag matching `desktop-v*`. The
workflow publishes the unsigned `.app` and `.dmg` as a downloadable build
artifact. macOS may require **Open Anyway** for this unsigned alpha build.
