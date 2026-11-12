# Changelog

All notable changes to Nibmark are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Export a note as PDF (File menu, note menu or command palette): A4 pages with page numbers, light colors, and code blocks, tables and images kept whole across page breaks
- Outline panel beside the note (⌘⇧O or the button in the note header): lists the note's headings, jumps to one on click, and highlights the section you are reading in the editor or the preview
- Hover a link to another note, in the editor or the preview, to see a preview card with its title, notebook and the start of its content; click the card to open the note
- Today's note (⌘⇧T, the Today row in the sidebar or the command palette): opens the note for today, or creates it from your daily template; it never creates a second one for the same day
- Word count and reading time next to the note's last-edited time; select text to count just the selection
- Unlinked mentions beside Backlinks: notes that mention this note's title without linking to it, with the sentence around each mention and a Link button that turns it into a link
- Note tabs above the note: double-click a note (or middle-click it, or choose Open in New Tab) to add it to the tab bar; a single click just shows the note. ⌘W closes a tab, Ctrl+Tab / Ctrl+Shift+Tab switch tabs, ⌘1…⌘9 jump to a tab, drag to reorder, and tabs come back when you reopen the app. Each note remembers its cursor and scroll position. Turn tabs off in Preferences → Editor
- Present a note as slides (note menu or command palette): each part separated by a `---` line is a slide, shown full screen; use the arrow keys or click to move, Esc to stop. Presenting starts from the slide you are editing, and long slides shrink to fit
- Graph view (⌘⇧G or the Graph row in the sidebar): see how notes link to each other, drag nodes, scroll to zoom and click a note to open it; switch to “This note” to see only the notes around the current one, or show notes without links too

### Changed

- Mist theme: the selected sidebar row is now light blue, and the editor, preview and note list use a soft gray background
- The Backlinks bar under a note only appears when another note links to it or mentions it
- ⌘W / Ctrl+W closes the current tab first, and closes the window when no tab is open

## [0.7.1] - 2026-11-12

### Fixed

- Linux and Windows: the Activity and Preferences buttons at the top of the sidebar no longer overlap the All Notes row

## [0.7.0] - 2026-11-12

### Changed

- New status picker in the note header and the multi-select panel: colored icons, a check mark on the current status, type to filter, and type a new name to create a status on the spot
- Tag field: suggestions show each tag's color, note count and the matched letters, plus a “Create tag” row; tags follow your sidebar order; the × on a tag appears on hover, and clicking a tag shows all notes with it
- Sidebar: a ⋯ button on notebooks, statuses and tags opens their menu; double-click a status or tag to rename it in place; menus show icons, and delete actions are red
- The note list title shows the tag's color or the status icon when you filter by one
- Redesigned Edit Tag / Edit Status dialog: a live preview of how it looks in the sidebar and on notes, a 14-color palette, a custom color picker and hex field, 40 suggested status icons with search across all icons, and a Delete button

### Fixed

- Esc in a picker or the tag field no longer leaves distraction-free mode

## [0.6.0] - 2026-11-12

### Added

- Backlinks panel lists notes linking to the current note, with one-click navigation; code snippets, comments, trashed notes and self-links are excluded
- Drag and drop statuses and tags into a custom order, persisted across restarts and included in backups

### Improved

- Split-view scrolling now follows source-line anchors for Markdown blocks instead of overall page percentage, with automatic remeasurement after media and layout changes
- Updated README and roadmap for the latest desktop features

## [0.5.0] - 2026-11-11

### Added

- Bidirectional synchronized scrolling between the Markdown editor and preview in split view
- Draggable sidebar, note-list and editor/preview dividers with remembered widths, keyboard adjustment and double-click reset
- Create custom statuses and tags directly from the sidebar
- Edit names, colors and icons for built-in and custom statuses; edit tag names and colors in a redesigned dialog with live preview and searchable icons
- Delete built-in and custom statuses; affected notes and templates move to No status without losing content
- Custom status support across filters, bulk actions, command palette, imports, exports and backup/restore

### Fixed

- Distraction-free editor and preview now fill the available width
- Long collection headings no longer cover sidebar and note-list toolbar buttons; full titles are available on hover
- Refined note filter styling and corrected its alignment when the sidebar is hidden on macOS

## [0.4.1] - 2026-11-11

### Fixed

- Notes imported from Apple Notes that were written in Markdown lost their formatting: `#`, `*` and `|` were escaped, every line became its own paragraph and the title was repeated. Markdown written in Notes is now kept line by line; other notes convert to clean Markdown without extra blank lines
- Distraction-free mode showed an empty gray window when the sidebar was hidden

## [0.4.0] - 2026-11-11

### Added

- Kanban boards: a note with `view: kanban` in its front matter shows as a board in the preview. Each `##` heading is a column and each top-level list item is a card. Drag cards between columns, add, rename (double-click), check off and delete cards, and add or rename columns; every change is written back to the note's Markdown. Cards show their tags and sub-task progress. Boards from Obsidian's Kanban plugin open too
- Kanban Board template
- Preferences → Editor: show or hide line numbers, limit line width, turn spell checking on or off, strike through completed tasks (editor and preview), and choose how lines wrap: all lines, text only (code blocks and tables keep their lines), or none
- Alert button in the formatting toolbar; alert blocks are colored in the editor too
- Note actions menu (`⌘J`): pin, duplicate, move to a notebook, add or remove tags, set status, copy link, export, history, save as template, trash
- `⌘D` outside the editor duplicates the current note (inside the editor it still selects the next match)
- Pasting a URL makes a Markdown link titled with the page's title (Preferences → Editor: title, URL as text, or paste as is). URLs pasted inside code or link syntax stay as they are
- Image sizes: `![alt|small](…)`, `|half`, `|full` or `|320` for a width in pixels, plus a size bar when the cursor is on an image
- Code blocks in the preview: line numbers (can be turned off in Preferences → Editor), a file name bar with ```` ```ts title="app.ts" ```` or ```` ```ts:app.ts ````, a language color badge, and highlighting for about 40 more languages (Dart, Dockerfile, Elixir, Haskell, Scala, Nginx, PowerShell, LaTeX…)
- Find in the preview with `⌘F` (when the cursor is not in the editor), including text inside code blocks; `↵` / `⇧↵` move between matches
- A GitHub link to a line range on its own line (`https://github.com/owner/repo/blob/main/file.ts#L10-L25`) shows those lines as a code block in the preview
- Open tasks in the command palette: type `[` (or run “Show Open Tasks…”) to list every unchecked task across your notes; `↵` opens the note at that line, `⌘↵` checks it off
- Open a note in its own window with `⌘⇧N`, from the note list menu or from `⌘J`. Edits show up in both windows right away
- Two-finger swipe left or right on the trackpad to go back or forward between notes (three-finger swipes work too when macOS is set up for them)
- Fuzzy search in the notebook picker (note header and multi-select panel, matches nested paths too) and in tag suggestions
- Activity (chart button in the sidebar or “Show Activity” in the palette): notes, words and task totals, current and longest writing streak, and a year grid of notes created, notes edited and tasks completed. Edits and completed tasks are read from the version history kept on this computer
- Template preview: `⌘T` shows each template's content (or board) next to the list before you pick it
- Your templates can put new notes into a chosen notebook (Preferences → Templates)
- Export a note as a single HTML file (File menu, `⌘J`, note list menu): images are embedded, Mermaid diagrams become SVG, code keeps its colors, and it follows light/dark mode when opened
- Import from Apple Notes (macOS, File → Import from Apple Notes…): folders become notebooks and pictures become attachments. macOS asks for permission the first time; locked notes and Recently Deleted are skipped, and Apple Notes is not changed
- Import Kindle highlights from `My Clippings.txt`: one note per book in “Kindle Highlights”, with page, location and date. Importing the file again only adds new highlights
- A second global shortcut to show or hide Nibmark (Preferences → Shortcuts, off by default)
- Drag a note from the list into another app, a terminal or another note to paste a Markdown link to it
- Windows and Linux: optionally keep Nibmark running in the system tray when the window is closed
- Mist and Night themes: a clean white and light-gray look with a blue accent, and its dark counterpart. They are now the default when the theme follows macOS (Paper, Stone, Ink and Indigo are still available)

### Changed

- The window's translucent areas follow the chosen theme's light or dark look instead of macOS's appearance
- New tags get brighter colors

- Softer, rounder interface: rounded note cards, toolbar buttons and fields; a segmented Editor / Side by side / Preview switch; a larger note title with notebook icon, status and tags underneath
- Sidebar: Preferences gear, a Note Templates row, collapsible Notebooks / Status / Tags sections with their own filter and + buttons, filled status icons and ring-style tag dots. On macOS the sidebar is translucent
- Note list: button to hide the sidebar, a Filter field, task progress bars (“3 of 4”) and pill-shaped tags on each card
- Editor: line numbers, folding arrows for headings and lists, full-width active line, colored headings with distinct `#` marks

### Fixed

- A relative `NIBMARK_USER_DATA` path was ignored, so a development or test run could open your real notes; it is now resolved to an absolute path

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

