import { Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { renderShareImage } from '../home/shareImage'
import type { ShareSummary } from '../home/shareSummary'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'

type State = { kind: 'loading' } | { kind: 'ready'; file: File; url: string } | { kind: 'error'; message: string }

/** 預覽「分享給家人」圖片，按下後用 iPhone 分享面板傳 LINE 或存相簿；不支援分享面板時改為下載。 */
export function ShareSheet({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: ShareSummary | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const toast = useToast()

  useEffect(() => {
    if (!open || !summary) return
    let cancelled = false
    let url: string | null = null
    setState({ kind: 'loading' })
    renderShareImage(summary)
      .then((blob) => {
        if (cancelled) return
        const file = new File([blob], summary.fileName, { type: 'image/png' })
        url = URL.createObjectURL(file)
        setState({ kind: 'ready', file, url })
      })
      .catch((e) => !cancelled && setState({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // summary 每次重算都是新物件；只在打開時產生一次，避免預覽中途閃動
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 分享必須在點擊當下同步呼叫（iOS 要求使用者手勢），所以圖片事先產生好
  const share = () => {
    if (state.kind !== 'ready') return
    const { file, url } = state
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      nav.share({ files: [file] }).catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        toast(errorMessage(e), 'error')
      })
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast('已下載圖片')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="分享給家人"
      subtitle={summary?.month}
      footer={
        <button type="button" className="btn btn-primary" onClick={share} disabled={state.kind !== 'ready'}>
          <Share size={18} />
          分享或儲存圖片
        </button>
      }
    >
      <p className="share-hint">按下面的按鈕後，選「LINE」傳給家人，或選「儲存影像」存到相簿。</p>
      {state.kind === 'loading' && <div className="share-wait">正在產生圖片…</div>}
      {state.kind === 'error' && <div className="callout callout-danger">{state.message}</div>}
      {state.kind === 'ready' && <img className="share-preview" src={state.url} alt={`${summary?.month ?? ''}支出摘要圖片`} />}
    </Sheet>
  )
}
