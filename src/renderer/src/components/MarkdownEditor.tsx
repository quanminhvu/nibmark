import { useEffect, useRef } from 'react'
import { EditorState, EditorSelection, Compartment } from '@codemirror/state'
import type { StateCommand } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine, placeholder, dropCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { followNoteLink, NOTE_LINK_PREFIX, noteLinkCompletions } from '@/lib/noteLinks'
import { emojiCompletions, fenceLanguageCompletions, slashCompletions } from '@/lib/completions'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'

// Màu lấy từ CSS variables nên tự đổi theo chế độ sáng/tối.
const highlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--ink)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--ink-3)' },
  { tag: [t.link, t.url], color: 'var(--syn-link)' },
  { tag: t.monospace, color: 'var(--syn-string)' },
  { tag: t.quote, color: 'var(--ink-2)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--ink-3)' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--syn-type)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--syn-attr)' }
])

/** Bọc/bỏ bọc vùng chọn bằng một cặp ký hiệu, ví dụ ** cho chữ đậm. */
function toggleWrap(mark: string): StateCommand {
  return ({ state, dispatch }) => {
    const len = mark.length
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - len, range.from)
      const after = state.sliceDoc(range.to, range.to + len)
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len }
          ],
          range: EditorSelection.range(range.from - len, range.to - len)
        }
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark }
        ],
        range: EditorSelection.range(range.from + len, range.to + len)
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

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
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
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
          highlightSelectionMatches(),
          search({ top: true }),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
          syntaxHighlighting(highlight),
          placeholder('Start writing…'),
          keymap.of([
            { key: 'Mod-b', run: toggleWrap('**') },
            { key: 'Mod-i', run: toggleWrap('*') },
            ...completionKeymap,
            ...markdownKeymap,
            ...closeBracketsKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
            indentWithTab
          ]),
          readOnlyConf.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'off' }),
          // Dán một URL lên chữ đang chọn thì biến chữ đó thành link Markdown
          EditorView.domEventHandlers({
            // Cmd/Ctrl+click vào link tới ghi chú khác thì mở ghi chú đó
            mousedown(event, view) {
              if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos === null) return false
              const line = view.state.doc.lineAt(pos)
              const re = /\]\((nibmark:\/\/note\/[A-Za-z0-9_-]+)\)/g
              for (const m of line.text.matchAll(re)) {
                const start = line.from + line.text.lastIndexOf('[', m.index)
                const end = line.from + m.index + m[0].length
                if (pos >= start && pos <= end && m[1].startsWith(NOTE_LINK_PREFIX)) {
                  event.preventDefault()
                  followNoteLink(m[1])
                  return true
                }
              }
              return false
            },
            paste(event, view) {
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
    return () => {
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

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyConf.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])
    })
  }, [readOnly])

  return <div className="editor-host" ref={hostRef} />
}
