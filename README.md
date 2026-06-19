# StickyDock

StickyDock is a privacy-first desktop note-taking app for Windows with local
storage, PIN-protected access, hierarchical note organization, and optional
OneDrive backup.

## Features

- Local SQLite storage with automatic save
- PIN-protected access and in-app lock
- Hierarchical parent/child note structure
- Rich-text editor with markdown support
- Theme support: Light, Dark, System
- Optional OneDrive backup integration
- Windows MSI packaging support via WiX
- Optional code signing for release artifacts

## Quick Start

### Development

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Start the renderer for live development:
   ```bash
   pnpm dev
   ```
3. Open the app in your browser at the address shown by Vite.

### Build for Windows

```bash
pnpm build
```

This runs the Wails build pipeline and creates a Windows executable in
`build/bin`. If WiX is installed, `pnpm build` also attempts to package an MSI.

## Environment Configuration

Application configuration is stored in environment variables. Use
`.env.example` as a template.

### Local configuration example

```env
VITE_AZURE_CLIENT_ID=
```

> Do not commit secret values or certificate files to version control.

## Windows Code Signing

To sign the EXE and MSI, set these environment variables before building:

- `SIGN_PFX_PATH` — path to a `.pfx` certificate
- `SIGN_PFX_PASSWORD` — certificate password (optional)
- `SIGN_TIMESTAMP_URL` — timestamp server URL (default: `http://timestamp.digicert.com`)
- `SIGN_TOOL_PATH` — optional explicit path to `signtool.exe`
- `WIX_BIN_PATH` — optional path to WiX binaries or `wix.exe`

If `SIGN_PFX_PATH` is not set, the build still succeeds and produces an unsigned
EXE/MSI.

## Requirements

- Windows 10 or newer for MSI packaging
- Node.js 20+
- pnpm
- Go 1.20+ for Wails
- WiX Toolset for MSI creation (optional)

## CI Validation

This repository includes a GitHub Actions workflow that:

- checks out the code
- installs Node and pnpm
- installs dependencies
- runs lint and type checks
- builds the renderer UI
- builds the Windows application

## Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` and
`CODE_OF_CONDUCT.md` before submitting a pull request.

## Support

Report bugs and feature requests using GitHub Issues. Use the provided issue
templates to ensure the report includes reproduction steps and environment
details.

## License

StickyDock is licensed under the MIT License. See `LICENSE` for details.
