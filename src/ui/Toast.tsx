import { Check, CircleAlert } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import './Toast.css'

type ToastKind = 'ok' | 'error'
interface ToastState {
  id: number
  kind: ToastKind
  message: string
}

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {})

/** 儲存結果的回饋。錯誤訊息停留較久。 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((message: string, kind: ToastKind = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), kind, message })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 4000 : 1800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.kind === 'ok' ? <Check size={16} strokeWidth={2.5} /> : <CircleAlert size={16} strokeWidth={2.2} />}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/** 把例外轉成給使用者看的訊息：驗證錯誤顯示原文，其他錯誤顯示通用訊息。 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.name === 'ValidationError') return e.message
  if (e instanceof Error && e.name === 'ConstraintError') return '資料重複，請重新整理後再試'
  console.error(e)
  return '儲存失敗，請再試一次'
}
