# Contributing to Nibmark

Thanks for helping! This guide covers the development setup, the checks every change goes through, and how releases are made.

## Setup

Requirements: Node.js 22 (see `.nvmrc`) and npm.

```bash
npm ci
npm run dev
```

To work against a throwaway profile instead of your real notes:

```bash
NIBMARK_USER_DATA="$PWD/.tmp-profile" npm run dev
```

A test profile never registers the global Quick Note shortcut, so it cannot fight with an installed copy of Nibmark.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm run typecheck` | Type-check the whole project |
| `npm run build` | Build main, preload and renderer into `out/` |
| `npm run check:bundle` | Fail if main or preload `require()` anything other than `electron` and Node built-ins |
| `npm run verify` | `typecheck` + `build` + `check:bundle` |
| `npm run pack` | Build and package an unpacked app into `dist/` for this platform |
| `npm run test:smoke` | Launch the packaged app on a temporary profile and check the window, the preload bridge and IPC |
| `npm run dist` | Build installers for this platform (`.dmg`/`.zip`, `.exe`, `.AppImage`) |

### Why `check:bundle` and the smoke test exist

The packaged app does not ship `node_modules`, so everything the main process and preload use must be bundled by electron-vite. A dependency left as a runtime `require()` works fine from the repository and crashes the installed app on launch. `check:bundle` catches that statically, and `test:smoke` runs the real packaged app, which is the only way to be sure.

## Before you open a pull request

```bash
npm run verify
npm run pack && npm run test:smoke
```

Then try your change in the app. CI runs the same steps on macOS, Windows and Linux for every push and pull request.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) and keep one logical change per commit, each one building on its own:

```
feat(editor): add a table toolbar
fix(build): bundle main and preload dependencies
docs: describe the import formats
```

Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Add a line to `CHANGELOG.md` under **Unreleased** for anything a user would notice.

### Ground rules

- **Your notes are data, not a test fixture.** Run Electron with `NIBMARK_USER_DATA` pointing at a temporary folder.
- **The renderer never chooses file paths.** File access goes through the main process, either to a configured folder or to a path the user picked in a native dialog.
- **Backups are append-only.** Nothing deletes files from a backup folder; deleted items move to `deleted/`.
- **Colors are CSS variables** defined in `src/renderer/src/themes.css`; don't hard-code colors in components.

## Releasing

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new version heading, e.g. `## [0.4.0] - 2026-12-01`.
2. Bump `version` in `package.json` and run `npm install --package-lock-only`.
3. Commit as `chore(release): 0.4.0`.
4. Tag and push:

   ```bash
   git tag -a v0.4.0 -m "Nibmark 0.4.0"
   git push origin main --tags
   ```

5. The **Release** workflow checks that the tag matches `package.json`, builds and smoke-tests the app on macOS, Windows and Linux, and creates a **draft** GitHub release with the installers and the changelog section as notes. Review the draft and publish it.

Builds are not code-signed or notarized yet, so macOS and Windows will warn on first launch.
