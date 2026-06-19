# Code Signing Policy

StickyDock is an open-source Windows desktop application. The repository
supports optional code signing for release artifacts while keeping local
builds unsigned by default.

## Signing for Releases

For official releases, code signing can be performed during the build if a
valid PFX certificate is available. The build script uses `signtool.exe` and
supports timestamping.

## Environment Variables

- `SIGN_PFX_PATH` — path to the `.pfx` certificate file
- `SIGN_PFX_PASSWORD` — password for the PFX file (optional)
- `SIGN_TIMESTAMP_URL` — timestamp server URL (default: `http://timestamp.digicert.com`)
- `SIGN_TOOL_PATH` — explicit location of `signtool.exe` (optional)
- `WIX_BIN_PATH` — optional path to WiX binaries or `wix.exe`

## Local Build Behavior

- `pnpm build` creates a Windows executable in `build/bin`.
- If WiX is installed or `WIX_BIN_PATH` is configured, the script also attempts
to create an MSI installer.
- If `SIGN_PFX_PATH` is not set, signing is skipped automatically.

## Recommended Release Practice

1. Verify the build locally with `pnpm build`.
2. Confirm the executable and installer artifacts are generated.
3. Use a trusted code signing certificate for publishable releases.
4. Keep signing material out of version control.

## Security Notes

- Never commit `.pfx`, `.p12`, or other certificate files to the repository.
- Use secure storage for signing credentials and passwords.
- If you need to share signing instructions, use documentation only, not secret
material.
