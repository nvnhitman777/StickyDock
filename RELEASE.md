# Release Workflow

This document describes the release process for StickyDock.

## Release Checklist

1. Update `wails.json` `productVersion` if needed.
2. Update `CHANGELOG.md` with release notes.
3. Verify local build and packaging.
4. Create a Git tag for the new release.
5. Publish the release on GitHub and attach build artifacts.

## Local Release Build

On Windows, run:

```bash
pnpm install
pnpm build
```

The `build` script compiles the app and attempts MSI packaging when WiX is
available. If no signing certificate is configured, the installer will remain
unsigned.

## Windows Code Signing

For signed release artifacts, set the following environment variables:

- `SIGN_PFX_PATH` — path to the `.pfx` certificate file
- `SIGN_PFX_PASSWORD` — password for the certificate (if required)
- `SIGN_TIMESTAMP_URL` — timestamp server URL
- `SIGN_TOOL_PATH` — optional explicit location of `signtool.exe`
- `WIX_BIN_PATH` — optional location of WiX binaries or `wix.exe`

Example:

```bash
SIGN_PFX_PATH="C:\path\to\certificate.pfx" \
SIGN_PFX_PASSWORD="your-password" \
pnpm build
```

## CI Validation

The repository includes a GitHub Actions workflow at
`.github/workflows/build.yml` that validates contributions on Windows and
ensures the app builds successfully. The workflow installs dependencies,
builds the renderer, and runs the Wails build pipeline.

## Release Artifacts

For public releases, upload installer artifacts to a GitHub Release or another
trusted distribution channel. Signed binaries help reduce SmartScreen and
Windows Defender warnings.
