import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine, highlightActiveLineGutter, lineNumbers, placeholder, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { followNoteLink, NOTE_LINK_PREFIX, noteLinkCompletions } from '@/lib/noteLinks'
import { emojiCompletions, fenceLanguageCompletions, slashCompletions } from '@/lib/completions'
import { formatToolbar, toggleWrap } from '@/lib/formatToolbar'
import { attachFiles, fileIdFromUrl, openAttachment } from '@/lib/attachments'
import { extraSlashItems } from '@/lib/completions'
import { setActiveEditor } from '@/lib/editorCommands'
import { listRenumber } from '@/lib/listRenumber'
import { tableToolbar } from '@/lib/tableTools'
import { alertBlocks, noWrapBlocks, strikeDoneTasks } from '@/lib/editorDecorations'
import { useEditorPrefs } from '@/lib/editorPrefs'
import type { EditorPrefs } from '@/lib/editorPrefs'

/** Các phần của editor đổi được khi người dùng đổi tùy chọn */
function gutterExt(p: EditorPrefs): Extension {
  return p.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []
}
function wrapExt(p: EditorPrefs): Extension {
  if (p.wrap === 'none') return []
  return p.wrap === 'prose' ? [EditorView.lineWrapping, noWrapBlocks] : EditorView.lineWrapping
}
function spellExt(p: EditorPrefs): Extension {
  return EditorView.contentAttributes.of({ spellcheck: p.spellcheck ? 'true' : 'false', autocorrect: 'off', autocapitalize: 'off' })
}
function strikeExt(p: EditorPrefs): Extension {
  return p.strikeDone ? strikeDoneTasks : []
}

/** Chèn đoạn Markdown của file vào vị trí `pos` (sau khi lưu xong). */
async function insertFiles(view: EditorView, files: File[], pos: number, replaceTo = pos): Promise<void> {
  const text = await attachFiles(files)
  if (!text || !view.dom.isConnected) return
  const len = view.state.doc.length
  const from = Math.min(pos, len)
  const to = Math.min(Math.max(replaceTo, from), len)
  // Ảnh đứng riêng một dòng cho dễ nhìn
  const before = from > 0 && view.state.sliceDoc(from - 1, from) !== '\n' ? '\n' : ''
  const insert = before + text
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, userEvent: 'input' })
  view.focus()
}

// Slash command "/file": mở hộp chọn file
if (!extraSlashItems.some((i) => i.label === 'Insert File…')) {
  extraSlashItems.push({
    label: 'Insert File…',
    detail: 'image, PDF…',
    keywords: 'image picture photo attachment upload pdf file',
    run: (view, _c, from, to) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.onchange = () => {
        const files = [...(input.files ?? [])]
        if (files.length) void insertFiles(view, files, from, to)
      }
      input.click()
    }
  })
}
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'

// Màu lấy từ CSS variables nên tự đổi theo chế độ sáng/tối.
const highlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--syn-heading)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--ink-3)' },
  { tag: [t.link, t.url], color: 'var(--syn-link)' },
  { tag: t.monospace, color: 'var(--syn-string)' },
  { tag: t.quote, color: 'var(--ink-2)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--syn-mark)' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--syn-type)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--syn-attr)' }
])

interface Props {
  value: string
  readOnly?: boolean
  onChange: (value: string) => void
}

export function MarkdownEditor({ value, readOnly = false, onChange }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const readOnlyConf = useRef(new Compartment())
  const prefConf = useRef({ gutter: new Compartment(), wrap: new Compartment(), spell: new Compartment(), strike: new Compartment() })
  const prefs = useEditorPrefs()
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          prefConf.current.gutter.of(gutterExt(useEditorPrefs.getState())),
          // Nút gập ở lề trái: gập một mục (heading) hoặc một khối code
          foldGutter({
            markerDOM: (open) => {
              const el = document.createElement('span')
              el.className = open ? 'cm-fold-marker open' : 'cm-fold-marker'
              el.textContent = '›'
              return el
            }
          }),
          drawSelection(),
          // Đa con trỏ: Cmd+click thêm con trỏ, Alt+kéo chọn vùng chữ nhật
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          listRenumber,
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({
            override: [noteLinkCompletions, slashCompletions, fenceLanguageCompletions, emojiCompletions],
            icons: false,
            defaultKeymap: false
          }),
          highlightActiveLine(),
          formatToolbar(),
          tableToolbar(),
          highlightSelectionMatches(),
          search({ top: true }),
          prefConf.current.wrap.of(wrapExt(useEditorPrefs.getState())),
          prefConf.current.strike.of(strikeExt(useEditorPrefs.getState())),
          alertBlocks,
          EditorState.tabSize.of(2),
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
          syntaxHighlighting(highlight),
          placeholder('Start writing…'),
          keymap.of([
            { key: 'Mod-b', run: toggleWrap('**') },
            { key: 'Mod-i', run: toggleWrap('*') },
            ...completionKeymap,
            ...foldKeymap,
            ...markdownKeymap,
            ...closeBracketsKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab
          ]),
          readOnlyConf.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          prefConf.current.spell.of(spellExt(useEditorPrefs.getState())),
          // Dán một URL lên chữ đang chọn thì biến chữ đó thành link Markdown
          EditorView.domEventHandlers({
            // Cmd/Ctrl+click vào link tới ghi chú khác thì mở ghi chú đó
            mousedown(event, view) {
              if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos === null) return false
              const line = view.state.doc.lineAt(pos)
              const re = /\]\((nibmark:\/\/(?:note|file)\/[A-Za-z0-9_-]+)\)/g
              for (const m of line.text.matchAll(re)) {
                const start = line.from + line.text.lastIndexOf('[', m.index)
                const end = line.from + m.index + m[0].length
                if (pos >= start && pos <= end) {
                  event.preventDefault()
                  const fileId = fileIdFromUrl(m[1])
                  if (fileId) void openAttachment(fileId)
                  else if (m[1].startsWith(NOTE_LINK_PREFIX)) followNoteLink(m[1])
                  return true
                }
              }
              return false
            },
            drop(event, view) {
              const files = [...(event.dataTransfer?.files ?? [])]
              if (!files.length) return false
              event.preventDefault()
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
              void insertFiles(view, files, pos)
              return true
            },
            paste(event, view) {
              const files = [...(event.clipboardData?.files ?? [])]
              if (files.length) {
                event.preventDefault()
                const { from, to } = view.state.selection.main
                void insertFiles(view, files, from, to)
                return true
              }
              const text = event.clipboardData?.getData('text/plain').trim() ?? ''
              const { main } = view.state.selection
              if (main.empty || view.state.selection.ranges.length > 1 || !/^https?:\/\/\S+$/.test(text)) return false
              const selected = view.state.sliceDoc(main.from, main.to)
              if (selected.includes('\n') || /^https?:\/\//.test(selected.trim())) return false
              const insert = `[${selected}](${text})`
              view.dispatch({
                changes: { from: main.from, to: main.to, insert },
                selection: { anchor: main.from + insert.length },
                userEvent: 'input.paste'
              })
              event.preventDefault()
              return true
            }
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view
    setActiveEditor(view)
    return () => {
      setActiveEditor(null, view)
      view.destroy()
      viewRef.current = null
    }
    // Chỉ tạo editor một lần; component được remount theo từng ghi chú (key = id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nội dung đổi từ bên ngoài (ví dụ tick checkbox trong preview)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Nhảy tới heading được chọn trong command palette
  useEffect(() => {
    const onGoto = (e: Event): void => {
      const view = viewRef.current
      const { line } = (e as CustomEvent<{ line: number }>).detail
      if (!view || line + 1 > view.state.doc.lines) return
      const pos = view.state.doc.line(line + 1).from
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) })
      view.focus()
    }
    window.addEventListener('nibmark-goto', onGoto)
    return () => window.removeEventListener('nibmark-goto', onGoto)
  }, [])

  // Đổi tùy chọn editor: cấu hình lại ngay, không cần mở lại ghi chú
  useEffect(() => {
    const c = prefConf.current
    viewRef.current?.dispatch({
      effects: [
        c.gutter.reconfigure(gutterExt(prefs)),
        c.wrap.reconfigure(wrapExt(prefs)),
        c.spell.reconfigure(spellExt(prefs)),
        c.strike.reconfigure(strikeExt(prefs))
      ]
    })
  }, [prefs])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyConf.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])
    })
  }, [readOnly])

  return <div className={`editor-host${prefs.readableWidth ? ' readable' : ''}${prefs.wrap === 'none' ? ' nowrap' : ''}`} ref={hostRef} />
}
