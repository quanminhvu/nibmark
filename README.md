<p align="center">
  <img src="assets/icon/nibmark-icon-1024.png" width="128" alt="Nibmark icon" />
</p>

<h1 align="center">Nibmark</h1>

<p align="center">A calm, local-first Markdown notebook for developers.</p>

---

Nibmark keeps your notes as plain Markdown, organized in nested notebooks, tags and statuses, and stored on your own machine. It is a desktop app built with Electron, React and CodeMirror 6.

> **Status:** v0.6.0, in active development. macOS is the primary target; Windows and Linux installers are built for every release but get less testing. Sync and mobile apps are on the [roadmap](#roadmap). Download the latest build from [Releases](https://github.com/quanminhvu/nibmark/releases).

<p align="center">
  <img src="docs/screenshot.png" alt="Nibmark with the Mist theme: notebooks and tags in the sidebar, the note list with task progress, and a note in side-by-side editor and preview" />
</p>

## Features

**Writing**

- CodeMirror 6 editor with Markdown and code-block syntax highlighting, line numbers and folding
- Three views: editor, side-by-side, preview; plus a full-width distraction-free mode
- Resize the sidebar, note list and editor/preview split; widths are remembered
- Bidirectional scrolling follows Markdown source blocks, keeping corresponding sections aligned around images, tables and diagrams
- Editor preferences: line numbers, readable line width, spell check, strike-through for done tasks, and wrap modes (all lines, text only, none)
- GitHub Flavored Markdown: tables, task lists, footnotes, strikethrough, sub/superscript
- Mermaid diagrams (with a zoomable full-screen viewer) and KaTeX math (`$…$`, `$$…$$`)
- Note links: type `[[` to link to another note, or create one on the fly
- Backlinks show which notes link to the current note; click one to open its source
- Paste a URL to get `[Page title](url)`, or paste it over selected text to link that text
- Slash commands (`/`) for headings, lists, tasks, code, tables, diagrams, math, alerts, links and files
- A floating toolbar on selected text, emoji (`:smile`) and code-language suggestions
- A table toolbar: format, align, insert, delete and move rows and columns
- Multiple cursors, rectangular selection and line tools (sort, join, case); numbered lists renumber themselves
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!WARNING]`…), colored in the editor and the preview
- Paste or drop images and files (PDFs, archives, anything up to 100 MB) straight into a note; size images with `![alt|small](…)`, `|half`, `|full` or `|320`
- Code blocks with line numbers, a file name bar (```` ```ts title="app.ts" ````) and highlighting for about 75 languages
- A GitHub link to a line range (`…/blob/main/app.ts#L10-L25`) on its own line shows those lines in the preview
- Find in the preview with `⌘F`
- Click a checkbox in the preview to tick the task in the source

**Kanban boards**

- Add `view: kanban` to a note's front matter and the preview becomes a board: each `##` heading is a column, each list item a card
- Drag cards between columns, add, rename, check off and delete them; every change is written back to the Markdown
- Start from the built-in Kanban Board template (`⌘T`)

**Organizing**

- Nested notebooks with icons and a manual order
- Create, rename and recolor tags; create, rename, recolor and choose icons for statuses, including the built-in statuses
- Drag statuses and tags into your preferred order; the order persists and is included in backups
- Delete a status without losing content: affected notes and templates move to No status
- Pin, duplicate, trash and restore notes; drag notes onto notebooks, statuses, tags or the Trash
- Select several notes (`⌘`-click, `⇧`-click, `⌘A`) to move, tag, set status, pin or trash them together
- Version history with a line diff and one-click restore
- Back and forward between notes, like a browser, with buttons, shortcuts or a two-finger swipe
- Open a note in its own window (`⌘⇧N`)
- Search with qualifiers: `book:` `tag:` `status:` `title:` `body:` `"exact phrase"` `-exclude`
- Every open task across your notes in the command palette (type `[`)
- Templates with `{{date}}`, `{{time}}` and `{{weekday}}` placeholders, a preview before you pick one, and an optional notebook for new notes; six built-in templates
- An activity view: writing streaks and a year grid of notes created, notes edited and tasks completed

**Your data**

- Local-first storage in PouchDB (IndexedDB), ready for CouchDB sync
- Continuous JSON backup to a folder of your choice; backups never delete files
- Restore from a backup folder (merge: newer notes in the app are never overwritten)
- Attachments are backed up as their original files and exported to an `attachments/` folder
- Import from Markdown folders (Obsidian, Notion exports and `.zip`s, Bear TextBundles), HTML files, Evernote `.enex` files and Apple Notes
- Import Kindle highlights from `My Clippings.txt`; importing again only adds new highlights
- Export a note, a notebook or everything as Markdown files with YAML front matter, or a note as a single HTML file
- Drag a note into another app or a terminal to paste a link to it

**Make it yours**

- Command palette (`⌘K`) for notes, commands, notebooks, tags, headings, tasks and themes, and a note actions menu (`⌘J`)
- Six built-in themes: Mist and Night (the defaults for light and dark), Paper, Stone, Ink and Indigo
- Global shortcuts for a quick note and for showing or hiding Nibmark; on Windows and Linux, an optional system tray icon
- Write your own themes as CSS files, and tweak anything with a personal `styles.css`

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘N` | New note |
| `⌘T` | New note from template |
| `⌘K` | Command palette (`>` commands, `@` notebooks, `#` tags, `:` headings, `[` tasks) |
| `⌘J` | Actions for the current note (move, tag, status, export…) |
| `⌘D` | Duplicate the note (outside the editor) |
| `⌘⇧N` | Open the note in a new window |
| `⌘F` | Find in the editor, or in the preview when the editor isn't focused |
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
| `settings.json` | Backup folder, global shortcuts and tray settings |

### Writing a theme

Create a `.css` file in the themes folder (Preferences → Open Themes Folder). A theme inherits every color from its base and only overrides what you write:

```css
/* name: Moss */
/* base: paper */
--paper: #e9ede2;
--surface: #f1f4eb;
--accent: #4f7a3a;
```

Bases are `mist`, `night`, `paper`, `stone`, `ink` and `indigo`. See `src/renderer/src/themes.css` for every variable.

## Project structure

```
src/
├── main/                 Electron main process
│   ├── index.ts          Windows, app lifecycle
│   ├── windows.ts        Tracks the main window (note windows are separate)
│   ├── menu.ts           Application menu
│   ├── ipc.ts            IPC handlers (dialogs, backup, import, export, themes, web)
│   ├── backup.ts         Continuous JSON backup and restore reader
│   ├── exporter.ts       Markdown export to folders
│   ├── importer.ts       Reads files, folders and archives picked for import
│   ├── appleNotes.ts     Apple Notes import (JXA)
│   ├── web.ts            Page titles and GitHub snippets (http/https only, size and time limits)
│   ├── shortcuts.ts      Global shortcuts
│   ├── tray.ts           System tray (Windows, Linux)
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
docs/                     Roadmap and screenshot
```

### Design principles

- **Local-first.** The app works fully offline; sync will be an add-on, not a requirement.
- **The renderer never chooses file paths.** It runs sandboxed; every file write goes through main, either to a configured folder or to a path the user picked in a native dialog.
- **Backups are append-only.** Deleted notes are moved to `deleted/`, never removed, so an empty or broken database can't wipe a backup.
- **All colors are CSS variables**, so themes can restyle the editor, the preview and Mermaid diagrams alike.

## Roadmap

- [x] **Phase 1 — Desktop app (0.1–0.3):** editor, notebooks, tags, statuses, search, backup, import and export, themes, command palette, templates, note links, Mermaid and math, attachments, version history
- [x] **Phase 2 — A better everyday experience (0.4):** new look, Kanban boards, editor and preview improvements, tasks palette, note windows, activity view, Apple Notes and Kindle import, HTML export
- [ ] **Phase 3 — Sync and security:** CouchDB sync, end-to-end encryption
- [ ] **Phase 4 — Mobile, plugins and AI:** iOS and Android apps, plugin system, optional AI assistant
- [ ] **Phase 5 — Distribution:** signed builds, accounts

The detailed roadmap is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

Nibmark is released under the [MIT License](LICENSE).

The Nibmark name, icon and logo identify this project; please don't use them in a way that suggests your fork is the official app.
