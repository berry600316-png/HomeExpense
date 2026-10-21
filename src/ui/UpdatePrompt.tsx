import { useRegisterSW } from 'virtual:pwa-register/react'
import './UpdatePrompt.css'

/**
 * Service Worker 更新提示。採 prompt 模式：新版下載完成後由使用者決定何時重新整理，
 * 避免在輸入資料途中被自動換版打斷。
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // 主畫面 PWA 可能長時間不重開，定期檢查新版本。
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="update-bar" role="status">
      <span>有新版本可用</span>
      <button type="button" className="update-bar__later" onClick={() => setNeedRefresh(false)}>
        稍後
      </button>
      <button type="button" className="update-bar__go" onClick={() => void updateServiceWorker(true)}>
        重新整理
      </button>
    </div>
  )
}
