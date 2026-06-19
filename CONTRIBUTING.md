# Contributing to StickyDock

Thank you for helping improve StickyDock! This project is an open-source
Windows desktop application built with Wails, Go, React, and Vite.

## Getting Started

1. Fork the repository and create a feature branch.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the renderer app for local development:
   ```bash
   pnpm dev
   ```

## Development Workflow

- Use descriptive branch names like `feature/notes-search` or `fix/installer-path`.
- Keep PRs focused and small where possible.
- Run linting and type checks before creating a pull request:
  ```bash
  pnpm lint
  pnpm typecheck
  ```
- Format changed files with Prettier:
  ```bash
  pnpm format:write
  ```

## Build Verification

For local validation, run:

```bash
pnpm build
```

This builds the Wails desktop application and attempts MSI packaging on
Windows when WiX is installed. Without a code signing certificate, the output
remains unsigned.

## Pull Requests

Please include the following in your PR description:

- What changed and why
- How to reproduce the change
- Any manual testing performed
- Notes on Windows build / MSI packaging if applicable

### Branch policy

This repository requires changes to be merged through pull requests. Do not push directly to `main` unless you have explicit approval from the repository owner.

- Create feature branches from `main`.
- Open a PR and request review before merging.
- Wait for owner approval before any changes land on `main`.

## Reporting Issues

Use GitHub Issues for bug reports and feature requests. There are templates to
help structure your submission.

## Release Notes

Release guidance is documented in `RELEASE.md`.

## Code of Conduct

This project follows a Code of Conduct. Please read `CODE_OF_CONDUCT.md`
before contributing.
