# Squitle macOS alpha installation

Squitle is currently an unsigned alpha build. The app is ad-hoc signed so its
bundle can be verified, but it is not yet notarized by Apple.

1. Open `Squitle-macOS.dmg` and drag Squitle into Applications.
2. In Applications, Control-click Squitle and choose **Open**.
3. If macOS still reports that the app is damaged, run:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Squitle.app
   ```

   Then Control-click Squitle and choose **Open** again.

The quarantine command only removes the download marker from this Squitle
bundle. Future public releases should use Apple Developer ID signing and
notarization so this step is unnecessary.
