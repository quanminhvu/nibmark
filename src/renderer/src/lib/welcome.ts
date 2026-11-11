export const WELCOME_TITLE = 'Welcome to Nibmark'

export const WELCOME_BODY = `# Welcome to Nibmark

Nibmark is a Markdown notebook for developers. Everything is stored **locally** on this machine.

## The basics

- Press \`Cmd/Ctrl+N\` to create a note
- Organize notes in **notebooks** (they can be nested), **tags** and **statuses**
- Right-click a notebook, a tag or a note for more actions
- Drag a note onto a notebook, a status, a tag or the Trash

## Views

| Shortcut | View |
| --- | --- |
| \`Cmd/Ctrl+E\` | Toggle editor / preview |
| \`Cmd/Ctrl+P\` | Side-by-side |
| \`Cmd/Ctrl+Shift+D\` | Distraction-free mode |

## Tasks

- [x] Install Nibmark
- [ ] Write the first note
- [ ] Click a checkbox in the preview to toggle it

## Code

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Search

Type in the search box above the note list. Qualifiers narrow things down:

\`book:inbox\` \`tag:idea\` \`status:active\` \`title:welcome\` \`body:markdown\` \`"exact phrase"\` \`-exclude\`

> Tip: set a note's status to *Active*, *On Hold*, *Completed* or *Dropped* to use Nibmark as a light task board.
`
