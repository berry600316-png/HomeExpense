import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, Download, Info, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { exportAll, restoreAll } from '../../db/backupDb'
import { db } from '../../db/db'
import { setSetting } from '../../db/repo'
import { validateBackup, type BackupFile } from '../../domain/backup'
import { SETTING_KEYS } from '../../domain/types'
import { errorMessage, useToast } from '../../ui/Toast'
import { APP_NAME } from '../../appInfo'
import { PageHeader } from './common'

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 優先用 iOS 分享面板（可存到「檔案」或 iCloud Drive），不支援時改為下載。回傳是否真的完成。 */
async function deliverFile(file: File): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${APP_NAME} 備份` })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      // 分享失敗就退回下載
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

const COUNT_LABELS: [keyof BackupFile['data'], string][] = [
  ['cards', '信用卡'],
  ['cardMonths', '信用卡月總額'],
  ['templates', '固定支出（含保險）'],
  ['occurrences', '每期繳費紀錄'],
  ['extras', '額外消費'],
  ['beneficiaries', '歸屬對象'],
  ['monthNotes', '月份備註'],
]

export function BackupPage() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const lastBackup = useLiveQuery(() => db.settings.get(SETTING_KEYS.lastBackupAt))
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ backup: BackupFile; counts: Record<string, number>; fileName: string } | null>(null)
  const [errors, setErrors] = useState<string[] | null>(null)

  const doExport = async () => {
    setBusy(true)
    try {
      const now = new Date()
      const backup = await exportAll(db, now)
      const json = JSON.stringify(backup, null, 1)
      const file = new File([json], `homeexpense-backup-${stamp(now)}.json`, { type: 'application/json' })
      if (await deliverFile(file)) {
        await setSetting(SETTING_KEYS.lastBackupAt, now.getTime())
        toast('已匯出備份檔')
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onPick = async (f: File | undefined) => {
    setErrors(null)
    setPending(null)
    if (!f) return
    if (f.size > 50 * 1024 * 1024) {
      setErrors(['檔案太大，不像是本 App 的備份檔'])
      return
    }
    const text = await f.text()
    const r = validateBackup(text)
    if (!r.ok) setErrors(r.errors)
    else setPending({ backup: r.backup, counts: r.counts, fileName: f.name })
  }

  const doRestore = async () => {
    if (!pending) return
    if (!window.confirm('確定要用這個備份「完整取代」目前手機上的所有資料嗎？\n目前的資料會被清除，無法復原。')) return
    setBusy(true)
    try {
      await restoreAll(pending.backup, db)
      toast('已還原備份')
      setPending(null)
    } catch (e) {
      // restoreAll 在單一交易中執行，失敗時原資料不變
      toast(`還原失敗，目前資料未被更動（${errorMessage(e)}）`, 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const last = typeof lastBackup?.value === 'number' ? new Date(lastBackup.value) : null

  return (
    <main>
      <PageHeader title="備份與還原" />
      <div className="callout callout-warn" style={{ marginBottom: 14 }}>
        <CircleAlert size={16} />
        <span>
          資料只存在這台裝置的瀏覽器裡。清除 Safari 網站資料、刪除主畫面 App、換手機或系統清理都可能讓資料消失，請定期匯出備份並存到「檔案」或 iCloud Drive。
        </span>
      </div>

      <h2 className="group-title">匯出</h2>
      <div className="edit-card">
        <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', color: 'var(--c-text-2)' }}>
          {last ? `上次備份：${last.toLocaleString('zh-TW', { hour12: false })}` : '還沒有備份過。'}
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void doExport()} disabled={busy}>
          <Download size={18} /> 匯出完整備份（JSON）
        </button>
      </div>

      <h2 className="group-title">還原</h2>
      <div className="edit-card">
        <p style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', color: 'var(--c-text-2)' }}>
          會先完整檢查備份檔；檢查通過、你再次確認後，才會<b>完整取代</b>目前的資料。檢查失敗不會動到任何資料。
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void onPick(e.target.files?.[0])} />
        <button type="button" className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={18} /> 選擇備份檔…
        </button>

        {errors && (
          <div className="callout callout-danger" style={{ marginTop: 12 }}>
            <CircleAlert size={16} />
            <div>
              <b>無法還原，目前資料沒有被更動：</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {pending && (
          <div style={{ marginTop: 12 }}>
            <div className="callout callout-info">
              <Info size={16} />
              <span>
                檢查通過：{pending.fileName}
                {pending.backup.exportedAt && `（匯出於 ${new Date(pending.backup.exportedAt).toLocaleString('zh-TW', { hour12: false })}）`}
              </span>
            </div>
            <div className="breakdown" style={{ marginTop: 10 }}>
              {COUNT_LABELS.map(([k, label]) => (
                <div className="kv" key={k}>
                  <span className="k">{label}</span>
                  <span className="v num">{pending.counts[k] ?? 0} 筆</span>
                </div>
              ))}
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>
                取消
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void doRestore()} disabled={busy}>
                取代目前資料並還原
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
