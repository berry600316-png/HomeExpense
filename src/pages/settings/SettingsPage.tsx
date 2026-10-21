import { useLiveQuery } from 'dexie-react-hooks'
import { BellRing, ChevronRight, CreditCard, HardDriveDownload, Landmark, ShieldCheck, Users, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { getReminderDays, setSetting } from '../../db/repo'
import { DEFAULT_REMINDER_DAYS, SETTING_KEYS } from '../../domain/types'
import { errorMessage, useToast } from '../../ui/Toast'
import { APP_NAME } from '../../appInfo'
import { PageHeader } from './common'

function Row({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <Link to={to} className="list-row">
      <span className="icon">{icon}</span>
      <span className="grow">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </span>
      <ChevronRight size={18} className="trail" />
    </Link>
  )
}

export function SettingsPage() {
  const toast = useToast()
  const counts = useLiveQuery(async () => ({
    cards: await db.cards.filter((c) => c.endYm === null).count(),
    templates: await db.templates.filter((t) => t.endYm === null).count(),
    insurance: await db.templates.filter((t) => t.kind === 'insurance' && t.endYm === null).count(),
    sources: await db.sources.filter((s) => s.kind !== 'card' && !s.archived).count(),
    beneficiaries: await db.beneficiaries.filter((b) => !b.archived).count(),
  }))
  const days = useLiveQuery(() => getReminderDays(db), [], DEFAULT_REMINDER_DAYS)
  const lastBackup = useLiveQuery(() => db.settings.get(SETTING_KEYS.lastBackupAt))
  const persisted = useLiveQuery(async () => (navigator.storage?.persisted ? navigator.storage.persisted() : null))

  const setDays = async (n: number) => {
    try {
      await setSetting(SETTING_KEYS.reminderDaysBefore, Math.min(31, Math.max(0, n)), db)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const backupText =
    typeof lastBackup?.value === 'number'
      ? `上次備份：${new Date(lastBackup.value).toLocaleDateString('zh-TW')}`
      : '尚未備份過'

  return (
    <main>
      <PageHeader title="設定" back="/" />

      <h2 className="group-title">資料管理</h2>
      <div className="group settings-list">
        <Row to="/settings/cards" icon={<CreditCard size={18} />} title="信用卡管理" sub={counts ? `${counts.cards} 張使用中` : undefined} />
        <Row to="/settings/fixed" icon={<Wallet size={18} />} title="固定支出與保險" sub={counts ? `${counts.templates} 個項目，其中保險 ${counts.insurance} 張` : undefined} />
        <Row to="/settings/beneficiaries" icon={<Users size={18} />} title="保險歸屬對象" sub={counts ? `${counts.beneficiaries} 位` : undefined} />
        <Row to="/settings/sources" icon={<Landmark size={18} />} title="扣款來源" sub={counts ? `銀行／現金／其他 ${counts.sources} 個（信用卡自動建立）` : undefined} />
      </div>

      <h2 className="group-title">卡費提醒</h2>
      <div className="group">
        <div className="list-row">
          <span className="icon">
            <BellRing size={18} />
          </span>
          <span className="grow">
            <div className="title">截止前幾天開始提醒</div>
            <div className="sub">每張卡的截止日在「信用卡管理」設定</div>
          </span>
          <span className="stepper">
            <button type="button" aria-label="減少一天" onClick={() => void setDays(days - 1)}>
              −
            </button>
            <span className="num">{days} 天</span>
            <button type="button" aria-label="增加一天" onClick={() => void setDays(days + 1)}>
              +
            </button>
          </span>
        </div>
      </div>

      <h2 className="group-title">資料安全</h2>
      <div className="group settings-list">
        <Row to="/settings/backup" icon={<HardDriveDownload size={18} />} title="備份與還原" sub={backupText} />
        <div className="list-row">
          <span className="icon">
            <ShieldCheck size={18} />
          </span>
          <span className="grow">
            <div className="title">本機儲存</div>
            <div className="sub">
              {persisted === true ? '已向瀏覽器申請保留資料' : persisted === false ? '瀏覽器未同意長期保留，請定期備份' : '無法確認儲存狀態'}
            </div>
          </span>
        </div>
      </div>

      <p className="about">
        {APP_NAME} · 所有資料只存在這台裝置的瀏覽器中，不會上傳到任何伺服器。清除 Safari 網站資料、刪除主畫面 App 或換手機都會讓資料消失，請定期到「備份與還原」匯出備份檔。
      </p>
    </main>
  )
}
