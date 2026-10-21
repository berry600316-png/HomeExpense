import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Sheet.css'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** 標題下方的小字（例如月份）。 */
  subtitle?: string
  children: ReactNode
  /** 固定在底部的操作列（儲存按鈕等），不隨內容捲動。 */
  footer?: ReactNode
}

const EXIT_MS = 240

/**
 * Bottom Sheet。
 * - 進出場用 CSS animation（不依賴 requestAnimationFrame：畫面隱藏時 rAF 不觸發，見 L-060）。
 * - 鍵盤開啟時，底部位移由 --kb（visualViewport 推算，見 useKeyboardInset）抬高，輸入框不被遮住。
 * - 內容區獨立捲動；底部保留 iPhone Safe Area。
 */
export function Sheet({ open, onClose, title, subtitle, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  // 鎖定背景捲動
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  // Esc 關閉（桌面瀏覽器）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 聚焦輸入框時捲到可視範圍（等鍵盤動畫）
  useEffect(() => {
    const el = bodyRef.current
    if (!el || !mounted) return
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (!target.matches('input, textarea, select')) return
      window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
    }
    el.addEventListener('focusin', onFocus)
    return () => el.removeEventListener('focusin', onFocus)
  }, [mounted])

  if (!mounted) return null
  return createPortal(
    <div className={`sheet-root${closing ? ' is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="sheet-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            <X size={20} strokeWidth={2} />
          </button>
        </header>
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
