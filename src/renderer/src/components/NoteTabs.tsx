import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useEditorPrefs } from '@/lib/editorPrefs'
import { useStore } from '@/lib/store'
import { closeOtherTabs, closeTab, closeTabsToRight, moveTab, useTabs } from '@/lib/tabs'
import { cx, isMac } from '@/lib/util'
import { openInNewWindow } from '@/lib/windowMode'
import { openMenu } from './ContextMenu'

const TAB_MIME = 'application/x-nibmark-tab'

/** Hàng tab phía trên khung ghi chú */
export function NoteTabs(): React.JSX.Element | null {
  const enabled = useEditorPrefs((s) => s.tabs)
  const tabs = useTabs((s) => s.tabs)
  const notes = useStore((s) => s.notes)
  const active = useStore((s) => s.selectedNoteId)
  const strip = useRef<HTMLDivElement>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // Tab đang mở luôn nằm trong vùng nhìn thấy
  useEffect(() => {
    strip.current?.querySelector('.note-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, tabs])

  if (!enabled || tabs.length === 0) return null

  const select = (id: string): void => {
    useStore.getState().setMulti([])
    useStore.getState().selectNote(id)
  }

  const indexAt = (e: React.DragEvent): number => {
    const items = [...(strip.current?.querySelectorAll<HTMLElement>('.note-tab') ?? [])]
    const i = items.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return e.clientX < r.left + r.width / 2
    })
    return i < 0 ? items.length : i
  }

  return (
    <div
      className="note-tabs titlebar-drag"
      ref={strip}
      role="tablist"
      aria-label="Open notes"
      onWheel={(e) => {
        // Cuộn dọc bằng chuột thường cũng kéo hàng tab sang ngang
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_MIME)) return
        e.preventDefault()
        setDropAt(indexAt(e))
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null)
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(TAB_MIME)
        setDropAt(null)
        if (!id) return
        e.preventDefault()
        moveTab(id, indexAt(e))
      }}
    >
      {tabs.map((tab, i) => {
        const note = notes[tab.id]
        if (!note) return null
        const title = note.title.trim() || 'Untitled'
        const isActive = tab.id === active
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            title={title}
            className={cx('note-tab', isActive && 'active', dropAt === i && 'drop-before', dropAt === tabs.length && i === tabs.length - 1 && 'drop-after')}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_MIME, tab.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDropAt(null)}
            onMouseDown={(e) => {
              // Chuột giữa: đóng tab
              if (e.button === 1) e.preventDefault()
            }}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(tab.id)
            }}
            onClick={() => select(tab.id)}
            onContextMenu={(e) =>
              openMenu(e, [
                { label: 'Close', hint: isMac() ? '⌘W' : 'Ctrl+W', onClick: () => closeTab(tab.id) },
                { label: 'Close Others', onClick: () => closeOtherTabs(tab.id) },
                { label: 'Close Tabs to the Right', onClick: () => closeTabsToRight(tab.id) },
                { separator: true },
                ...(window.nibmark ? [{ label: 'Open in New Window', onClick: () => openInNewWindow(tab.id) }] : [])
              ])
            }
          >
            <span className="note-tab-title">{title}</span>
            <button
              className="note-tab-close"
              title="Close tab"
              aria-label={`Close ${title}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
      <span className="note-tabs-fill" />
    </div>
  )
}
