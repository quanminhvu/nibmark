<p align="center">
  <img src="assets/icon/nibmark-icon-1024.png" width="128" alt="Nibmark icon" />
</p>

<h1 align="center">Nibmark</h1>

<p align="center">A calm, local-first Markdown notebook for developers.</p>

---

Nibmark keeps your notes as plain Markdown, organized in nested notebooks, tags and statuses, and stored on your own machine. It is a desktop app built with Electron, React and CodeMirror 6.

> **Status:** early development (v0.1). macOS is the primary target today. Sync and mobile apps are on the [roadmap](#roadmap).

## Features

**Writing**

- CodeMirror 6 editor with Markdown and code-block syntax highlighting
- Three views: editor, side-by-side, preview; plus a distraction-free mode
- GitHub Flavored Markdown: tables, task lists, footnotes, strikethrough, sub/superscript
- Mermaid diagrams (with a zoomable full-screen viewer) and KaTeX math (`$…$`, `$$…$$`)
- Note links: type `[[` to link to another note, or create one on the fly
- Paste a URL over selected text to turn it into a link
- Slash commands (`/`) for headings, lists, tasks, code, tables, diagrams, math, alerts, links and files
- A floating toolbar on selected text, emoji (`:smile`) and code-language suggestions
- A table toolbar: format, align, insert, delete and move rows and columns
- Multiple cursors, rectangular selection and line tools (sort, join, case); numbered lists renumber themselves
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!WARNING]`…) in the preview
- Paste or drop images and files (PDFs, archives, anything up to 100 MB) straight into a note
- Click a checkbox in the preview to tick the task in the source

**Organizing**

- Nested notebooks with icons and a manual order, tags, and statuses (Active, On Hold, Completed, Dropped)
- Pin, duplicate, trash and restore notes; drag notes onto notebooks, statuses, tags or the Trash
- Select several notes (`⌘`-click, `⇧`-click, `⌘A`) to move, tag, set status, pin or trash them together
- Version history with a line diff and one-click restore
- Back and forward between notes, like a browser
- Search with qualifiers: `book:` `tag:` `status:` `title:` `body:` `"exact phrase"` `-exclude`
- Templates with `{{date}}`, `{{time}}` and `{{weekday}}` placeholders, plus five built-in templates

**Your data**

- Local-first storage in PouchDB (IndexedDB), ready for CouchDB sync
- Continuous JSON backup to a folder of your choice; backups never delete files
- Restore from a backup folder (merge: newer notes in the app are never overwritten)
- Attachments are backed up as their original files and exported to an `attachments/` folder
- Import from Markdown folders (Obsidian, Notion exports and `.zip`s, Bear TextBundles), HTML files and Evernote `.enex` files
- Export a note, a notebook or everything as Markdown files with YAML front matter

**Make it yours**

- Command palette (`⌘K`) for notes, commands, notebooks, tags, headings and themes
- Four built-in themes (Paper, Stone, Ink, Indigo) or follow the system appearance
- Write your own themes as CSS files, and tweak anything with a personal `styles.css`

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` | New note |
| `⌘T` | New note from template |
| `⌘K` | Command palette (`>` commands, `@` notebooks, `#` tags, `:` headings) |
| `⌘E` | Toggle preview |
| `⌘P` | Toggle side-by-side view |
| `⌘⇧D` | Distraction-free mode |
| `⌘⇧F` | Search notes |
| `⌘⌥N` | Quick Note from anywhere (global, configurable) |
| `⌘⌥←` / `⌘⌥→` | Back / forward between notes |
| `⌘,` | Preferences |
| `⌘B` / `⌘I` | Bold / italic |
| `⌘`-click | Follow a note link in the editor |

On Windows and Linux, use `Ctrl` instead of `⌘`.

## Getting started

Requirements: Node.js 22 (see `.nvmrc`) and npm.

```bash
npm install
npm run dev        # start the app with hot reload
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Build main, preload and renderer into `out/` |
| `npm run start` | Run the built app |
| `npm run typecheck` | Type-check the whole project |
| `npm run verify` | Typecheck, build and check that main/preload bundle all their dependencies |
| `npm run pack` | Package an unpacked app into `dist/` (on macOS: `dist/mac-arm64/Nibmark.app`) |
| `npm run test:smoke` | Launch the packaged app on a temporary profile and check that it starts |
| `npm run dist` | Build installers: `.dmg`/`.zip` (macOS), `.exe` (Windows), `.AppImage` (Linux) |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, CI and the release process.

To run against a throwaway profile (useful when testing, so your real notes are never touched):

```bash
NIBMARK_USER_DATA="$PWD/.tmp-profile" npm run dev
```

## Where your data lives

Everything is stored in the app's user data folder (`~/Library/Application Support/Nibmark` on macOS):

| Path | Contents |
| --- | --- |
| `IndexedDB/` | The note database, attachments and version history |
| `Backups/` | Default continuous backup folder (change it in Preferences) |
| `themes/*.css` | Your own themes |
| `styles.css` | Your personal CSS overrides |
| `settings.json` | Backup settings |

### Writing a theme

Create a `.css` file in the themes folder (Preferences → Open Themes Folder). A theme inherits every color from its base and only overrides what you write:

```css
/* name: Moss */
/* base: paper */
--paper: #e9ede2;
--surface: #f1f4eb;
--accent: #4f7a3a;
```

Bases are `paper`, `stone`, `ink` and `indigo`. See `src/renderer/src/themes.css` for every variable.

## Project structure

```
src/
├── main/                 Electron main process
│   ├── index.ts          Window, app lifecycle
│   ├── menu.ts           Application menu
│   ├── ipc.ts            IPC handlers (dialogs, backup, export, themes)
│   ├── backup.ts         Continuous JSON backup and restore reader
│   ├── exporter.ts       Markdown export to folders
│   ├── settings.ts       settings.json in the user data folder
│   └── themes.ts         User themes and styles.css
├── preload/index.ts      The only bridge between renderer and main
└── renderer/src/
    ├── App.tsx           Layout and global shortcuts
    ├── components/       Sidebar, note list, editor, preview, palette, preferences…
    ├── lib/              Store, database, search, Markdown, backup, themes, templates…
    ├── themes.css        Built-in themes (CSS variables)
    └── styles.css        Layout and components
assets/icon/              Icon and logo sources (SVG + PNG)
build/                    Packaging resources (icon.icns)
docs/                     Feature checklist and notes
```

### Design principles

- **Local-first.** The app works fully offline; sync will be an add-on, not a requirement.
- **The renderer never chooses file paths.** It runs sandboxed; every file write goes through main, either to a configured folder or to a path the user picked in a native dialog.
- **Backups are append-only.** Deleted notes are moved to `deleted/`, never removed, so an empty or broken database can't wipe a backup.
- **All colors are CSS variables**, so themes can restyle the editor, the preview and Mermaid diagrams alike.

## Roadmap

- [x] **Phase 1 — Desktop app:** editor, notebooks, tags, statuses, search, backup, export
- [x] Themes, command palette, templates, note links, Mermaid and math
- [x] Attachments, version history, slash commands, bulk actions, quick note
- [x] Import, table toolbar, multiple cursors, notebook icons and order
- [ ] **Phase 2 — Sync and security:** CouchDB sync, end-to-end encryption
- [ ] **Phase 3 — Mobile and extensibility:** iOS and Android apps, plugin system
- [ ] **Phase 4 — Distribution:** signed builds, accounts

The full feature checklist is in [`docs/list_danh_sach_feature_inkdrop.md`](docs/list_danh_sach_feature_inkdrop.md).

## Acknowledgements

Nibmark is inspired by the workflow of [Inkdrop](https://www.inkdrop.app/) by Takuya Matsuyama. It is an independent project, written from scratch, and is not affiliated with or endorsed by Inkdrop.

## License

Nibmark is released under the [MIT License](LICENSE).

The Nibmark name, icon and logo identify this project; please don't use them in a way that suggests your fork is the official app.
