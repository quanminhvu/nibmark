# Changelog

All notable changes to Nibmark are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Slash commands: type `/` at the start of an empty line to insert headings, lists, tasks, code blocks, tables, Mermaid, math, alerts or a note link
- Language suggestions after typing ```` ``` ```` and a letter
- Emoji suggestions after typing `:` and two letters
- Floating formatting toolbar when text is selected: bold, italic, strikethrough, code, highlight, link, heading, list, task and quote
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) in the preview

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

