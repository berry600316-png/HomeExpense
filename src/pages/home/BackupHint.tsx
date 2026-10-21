import { useLiveQuery } from 'dexie-react-hooks'
import { HardDriveDownload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { SETTING_KEYS } from '../../domain/types'

const DAY = 24 * 60 * 60 * 1000
export const BACKUP_REMIND_DAYS = 30

/** 計算距離上次備份的天數；從未備份時以最早一筆資料的建立時間起算。沒有任何資料回傳 null。 */
export async function daysSinceBackup(now = Date.now()): Promise<{ days: number; never: boolean } | null> {
  const row = await db.settings.get(SETTING_KEYS.lastBackupAt)
  if (typeof row?.value === 'number') return { days: Math.floor((now - row.value) / DAY), never: false }
  const firsts = await Promise.all([
    db.cards.orderBy('order').first(),
    db.templates.orderBy('order').first(),
    db.extras.orderBy('date').first(),
  ])
  const times = firsts.filter((x) => x !== undefined).map((x) => x!.createdAt)
  if (times.length === 0) return null
  return { days: Math.floor((now - Math.min(...times)) / DAY), never: true }
}

/** 超過 30 天沒備份時，首頁顯示一行低調提示（使用者決策 D3）。 */
export function BackupHint() {
  const info = useLiveQuery(() => daysSinceBackup(), [])
  if (!info || info.days < BACKUP_REMIND_DAYS) return null
  return (
    <Link to="/settings/backup" className="backup-hint">
      <HardDriveDownload size={15} />
      <span>{info.never ? '還沒有備份過資料' : `已經 ${info.days} 天沒有備份`}，建議匯出一份</span>
    </Link>
  )
}
