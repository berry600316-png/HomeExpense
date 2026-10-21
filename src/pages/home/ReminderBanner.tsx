import { useLiveQuery } from 'dexie-react-hooks'
import { BellRing, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../../db/db'
import { getReminderDays, markBillPaid } from '../../db/repo'
import { computeReminders, type BillReminder } from '../../domain/reminders'
import { DEFAULT_REMINDER_DAYS } from '../../domain/types'
import { formatYmdShort, weekdayLabel } from '../../domain/ym'
import type { AllData } from '../../hooks/useData'
import { errorMessage, useToast } from '../../ui/Toast'
import './reminder.css'

function whenText(r: BillReminder): string {
  if (r.overdue) return `已逾期 ${-r.daysLeft} 天`
  if (r.daysLeft === 0) return '今天截止'
  return `剩 ${r.daysLeft} 天`
}

/**
 * 卡費截止提醒（使用者決策 R1–R5）：
 * - 截止前 N 天起，每次「打開 App」（載入，或從背景回到前景）都跳全畫面提醒，直到按「已繳」。
 * - 「稍後」只關掉這一次；首頁頂端常駐提醒條。
 */
export function ReminderBanner({ data, today }: { data: AllData; today: string }) {
  const toast = useToast()
  const days = useLiveQuery(() => getReminderDays(db), [], DEFAULT_REMINDER_DAYS)
  const reminders = useMemo(
    () => computeReminders(today, data.cards, data.cardBills, days),
    [today, data.cards, data.cardBills, days],
  )
  const [snoozed, setSnoozed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 從背景回到前景 = 再次打開 App → 重新提醒
  useEffect(() => {
    let wasHidden = false
    const onVis = () => {
      if (document.visibilityState === 'hidden') wasHidden = true
      else if (wasHidden) {
        wasHidden = false
        setSnoozed(false)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const showModal = reminders.length > 0 && !snoozed

  useEffect(() => {
    if (!showModal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [showModal])

  const pay = async (r: BillReminder) => {
    setBusyId(`${r.cardId}|${r.dueYm}`)
    try {
      await markBillPaid(r.cardId, r.dueYm, today)
      toast(`${r.cardName} 已標記繳款`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (reminders.length === 0) return null
  const anyOverdue = reminders.some((r) => r.overdue)

  return (
    <>
      <button type="button" className={`rm-strip${anyOverdue ? ' is-overdue' : ''}`} onClick={() => setSnoozed(false)}>
        <BellRing size={17} strokeWidth={2} />
        <span className="rm-strip-text">
          {reminders.map((r, i) => (
            <span key={`${r.cardId}|${r.dueYm}`}>
              {i > 0 && '、'}
              <b>{r.cardName}</b> {formatYmdShort(r.dueDate).slice(5)} {whenText(r)}
            </span>
          ))}
        </span>
        <ChevronRight size={16} className="rm-strip-chev" />
      </button>

      {showModal &&
        createPortal(
          <div className={`rm-modal${anyOverdue ? ' is-overdue' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="rm-title">
            <div className="rm-inner">
              <div className="rm-icon">
                <BellRing size={34} strokeWidth={1.8} />
              </div>
              <h2 id="rm-title">{anyOverdue ? '卡費已逾期' : '卡費快到期了'}</h2>
              <p className="rm-lead">繳完請按「已繳」，之後就不會再提醒。</p>
              <ul className="rm-list">
                {reminders.map((r) => {
                  const key = `${r.cardId}|${r.dueYm}`
                  return (
                    <li key={key} className={r.overdue ? 'is-overdue' : ''}>
                      <div className="rm-card">
                        <div className="rm-name">{r.cardName}</div>
                        <div className="rm-due">
                          {formatYmdShort(r.dueDate)}（{weekdayLabel(r.dueDate)}）截止
                        </div>
                      </div>
                      <div className="rm-left">{whenText(r)}</div>
                      <button type="button" className="rm-pay" onClick={() => void pay(r)} disabled={busyId === key}>
                        已繳
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="rm-later" onClick={() => setSnoozed(true)}>
                稍後提醒
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
