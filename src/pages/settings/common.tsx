import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import './settings.css'

/** 設定頁共用標題列。返回優先用瀏覽器歷史（回到首頁時保留原本的月份），沒有歷史才回 fallback。 */
export function PageHeader({ title, back = '/settings', action }: { title: string; back?: string; action?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="page-head">
      <button
        type="button"
        className="page-back"
        onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav(back, { replace: true }))}
      >
        <ChevronLeft size={22} />
        <span>返回</span>
      </button>
      <h1>{title}</h1>
      <div className="page-action">{action}</div>
    </header>
  )
}

export function Loading() {
  return <p className="t-muted" style={{ padding: 16 }}>讀取中…</p>
}
