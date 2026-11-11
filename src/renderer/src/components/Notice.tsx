import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

export function Notice(): React.JSX.Element | null {
  const notice = useStore((s) => s.notice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useStore.setState({ notice: null }), notice.tone === 'error' ? 8000 : 4000)
    return () => clearTimeout(timer)
  }, [notice])

  if (!notice) return null
  return (
    <div className={cx('notice', notice.tone === 'error' && 'error')} role="status">
      <span>{notice.text}</span>
      <button className="notice-close" title="Dismiss" onClick={() => useStore.setState({ notice: null })}>
        <X size={13} />
      </button>
    </div>
  )
}
