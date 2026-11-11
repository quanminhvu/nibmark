# Changelog

All notable changes to Nibmark are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A relative `NIBMARK_USER_DATA` path was ignored, so a development or test run could open your real notes; it is now resolved to an absolute path

### Added

- Kanban boards: a note with `view: kanban` in its front matter shows as a board in the preview. Each `##` heading is a column and each top-level list item is a card. Drag cards between columns, add, rename (double-click), check off and delete cards, and add or rename columns; every change is written back to the note's Markdown. Cards show their tags and sub-task progress. Boards from Obsidian's Kanban plugin open too
- Kanban Board template
- Preferences → Editor: show or hide line numbers, limit line width, turn spell checking on or off, strike through completed tasks (editor and preview), and choose how lines wrap: all lines, text only (code blocks and tables keep their lines), or none
- Alert button in the formatting toolbar; alert blocks are colored in the editor too
- Note actions menu (`⌘J`): pin, duplicate, move to a notebook, add or remove tags, set status, copy link, export, history, save as template, trash
- `⌘D` outside the editor duplicates the current note (inside the editor it still selects the next match)
- Pasting a URL makes a Markdown link titled with the page's title (Preferences → Editor: title, URL as text, or paste as is). URLs pasted inside code or link syntax stay as they are
- Image sizes: `![alt|small](…)`, `|half`, `|full` or `|320` for a width in pixels, plus a size bar when the cursor is on an image
- Mist and Night themes: a clean white and light-gray look with a blue accent, and its dark counterpart. They are now the default when the theme follows macOS (Paper, Stone, Ink and Indigo are still available)

### Changed

- The window's translucent areas follow the chosen theme's light or dark look instead of macOS's appearance
- New tags get brighter colors

- Softer, rounder interface: rounded note cards, toolbar buttons and fields; a segmented Editor / Side by side / Preview switch; a larger note title with notebook icon, status and tags underneath
- Sidebar: Preferences gear, a Note Templates row, collapsible Notebooks / Status / Tags sections with their own filter and + buttons, filled status icons and ring-style tag dots. On macOS the sidebar is translucent
- Note list: button to hide the sidebar, a Filter field, task progress bars (“3 of 4”) and pill-shaped tags on each card
- Editor: line numbers, folding arrows for headings and lists, full-width active line, colored headings with distinct `#` marks

## [0.3.1] - 2026-11-11

### Fixed

- The installed app crashed on launch with “Cannot find module 'fflate'” (introduced in 0.3.0)

### Added

- Installers for macOS (Apple Silicon and Intel), Windows and Linux are built and smoke-tested automatically for every release

## [0.3.0] - 2026-11-11

### Added

- Import notes from Markdown files and folders (Obsidian vaults, Notion exports including `.zip`, Bear TextBundles), HTML files and Evernote `.enex` exports, with their images and attachments. Folders become nested notebooks inside a new “Imported” notebook, or inside the notebook you right-click. Nibmark's own Markdown exports keep their tags, status, pin and dates
- Copy a note link or a note, notebook or tag ID from context menus and the command palette
- Color swatches next to `#hex`, `rgb()` and `hsl()` values in inline code
- Preferences → Open Data Folder
- Multiple cursors (`⌘`-click, `⌘⌥↑/↓`) and rectangular selection (`⌥`-drag)
- Numbered lists renumber themselves when items are added, deleted, pasted or moved; lazy `1. 1. 1.` lists and custom start numbers are kept
- Notebook icons: choose from 2,000+ Lucide icons (right-click a notebook → Change Icon…)
- Manual notebook order: drag a notebook to the top or bottom edge of another to place it before or after; drop in the middle to nest it
- Table toolbar when the cursor is in a table: format and align columns (accounting for wide CJK characters and emoji), insert, delete and move rows and columns, and set column alignment
- Editor commands in the palette: sort, reverse and dedupe lines, join lines, duplicate line, upper/lower/title case, select all occurrences

## [0.2.0] - 2026-11-11

### Added

- Slash commands: type `/` at the start of an empty line to insert headings, lists, tasks, code blocks, tables, Mermaid, math, alerts or a note link
- Language suggestions after typing ```` ``` ```` and a letter
- Emoji suggestions after typing `:` and two letters
- Floating formatting toolbar when text is selected: bold, italic, strikethrough, code, highlight, link, heading, list, task and quote
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) in the preview
- Select several notes with `⌘`-click, `⇧`-click or `⌘A` in the note list, then move them to a notebook, set their status, tag, pin, trash, restore or delete them together; drag a selection onto the sidebar
- Attachments: paste or drop images and files into a note (up to 100 MB each), or use `/file`. Images show in the preview and open full size on click; other files open in their default app. Attachments are included in backups, restores and Markdown exports (in an `attachments/` folder with relative links)
- Version history: a version is saved a few seconds after you stop typing; browse versions with a line diff and restore any of them (the text you replace is saved too, so a restore can be undone). History stays on this computer and is not part of backups
- Quick Note global shortcut (`⌘⌥N` by default, configurable in Preferences): brings Nibmark to the front with a new note, even from the background
- Back and forward between notes: buttons in the note header, `⌘⌥←` / `⌘⌥→`, `⌘[` / `⌘]` outside the editor, and the mouse back/forward buttons

### Changed

- Nibmark is now released under the MIT License

## [0.1.0] - 2026-11-11

First working version of the desktop app.

### Added

- Electron desktop app with a sandboxed renderer and a minimal preload bridge
- Local-first storage with PouchDB, ready for CouchDB sync
- Three-pane layout: sidebar, note list and note pane
- Nested notebooks, tags, statuses, pinning, duplicating, trash and restore
- Drag and drop of notes onto notebooks, statuses, tags and the Trash
- CodeMirror 6 Markdown editor with code-block highlighting, bold/italic shortcuts and paste-URL-as-link
- Markdown preview with GFM tables, task lists, footnotes and sub/superscript; clickable task checkboxes; copy buttons on code blocks
- Editor, side-by-side and preview views, plus a distraction-free mode
- Search with `book:`, `tag:`, `status:`, `title:`, `body:`, quoted phrases and exclusions
- Continuous JSON backup that never deletes files, merge-only restore, and Markdown export of notes, notebooks or everything
- Preferences window
- Theme system: Paper, Stone, Ink and Indigo, system appearance, user themes and a personal `styles.css`
- Command palette (`⌘K`) for notes, commands, notebooks, tags, headings and themes, with live theme preview
- Note templates (`⌘T`) with five built-in templates and date/time placeholders
- Note links with `[[` autocompletion and an option to create the linked note
- Mermaid diagrams with a full-screen viewer, and KaTeX math
- macOS app packaging with electron-builder

