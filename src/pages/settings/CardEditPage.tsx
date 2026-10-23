import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../db/db'
import { canDeleteCard, createCard, deleteCard, updateCard } from '../../db/repo'
import { DEFAULT_REMINDER_DAYS } from '../../domain/types'
import { addMonths, currentYm, formatYmLabel, isValidYm, todayYmd } from '../../domain/ym'
import { Field, TextArea, useFieldId } from '../../ui/fields'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

/** 下拉選項：截止當天～14 天前；舊資料若超過 14 天（舊版最多 31），保留原值不被改掉。 */
function remindOptions(current: number): number[] {
  const base = Array.from({ length: 15 }, (_, i) => i)
  return current > 14 ? [...base, current] : base
}

export function remindLabel(n: number): string {
  return n === 0 ? '截止當天才提醒' : `截止前 ${n} 天開始提醒`
}

export function CardEditPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const toast = useToast()
  const card = useLiveQuery(() => (isNew || !id ? undefined : db.cards.get(id)), [id])
  const deletable = useLiveQuery(() => (isNew || !id ? false : canDeleteCard(id)), [id])
  const ids = { name: useFieldId(), bank: useFieldId(), tag: useFieldId(), due: useFieldId(), remind: useFieldId(), start: useFieldId(), note: useFieldId(), end: useFieldId() }

  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [tag, setTag] = useState('')
  const [dueDay, setDueDay] = useState<number | null>(null)
  const [remindDays, setRemindDays] = useState(DEFAULT_REMINDER_DAYS)
  const [startYm, setStartYm] = useState(currentYm())
  const [note, setNote] = useState('')
  const [endYm, setEndYm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(isNew)

  useEffect(() => {
    if (!card || loaded) return
    setName(card.name)
    setBank(card.bank)
    setTag(card.tag)
    setDueDay(card.dueDay)
    setRemindDays(card.remindDays)
    setStartYm(card.startYm)
    setNote(card.note)
    setEndYm(card.endYm ?? '')
    setLoaded(true)
  }, [card, loaded])

  if (!isNew && (card === undefined || !loaded)) return <Loading />
  if (!isNew && card === null) return <p>找不到這張卡</p>

  const save = async () => {
    setError(null)
    if (!name.trim()) return setError('請輸入卡片名稱')
    if (!isValidYm(startYm)) return setError('請選擇開始記錄的月份')
    try {
      const today = todayYmd()
      if (isNew) {
        await createCard({ name, bank, tag, dueDay, remindDays, note, startYm }, today)
        toast('已新增信用卡')
      } else {
        await updateCard(id!, { name, bank, tag, dueDay, remindDays, note, startYm, endYm: endYm || null }, today)
        toast('已儲存')
      }
      nav(-1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const disable = async () => {
    const next = addMonths(currentYm(), 1)
    if (!window.confirm(`從 ${formatYmLabel(next)}起停用這張卡？\n之前月份的紀錄都會保留，首頁之後不再要求輸入這張卡。`)) return
    try {
      await updateCard(id!, { endYm: next }, todayYmd())
      setEndYm(next)
      toast('已停用')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const enable = async () => {
    try {
      await updateCard(id!, { endYm: null }, todayYmd())
      setEndYm('')
      toast('已重新啟用')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('永久刪除這張卡？（這張卡沒有任何紀錄才能刪除）')) return
    try {
      await deleteCard(id!)
      toast('已刪除')
      nav('/settings/cards', { replace: true })
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <main>
      <PageHeader title={isNew ? '新增信用卡' : '編輯信用卡'} back="/settings/cards" />
      <div className="edit-card form">
        <Field label="卡片顯示名稱" htmlFor={ids.name}>
          <input id={ids.name} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="例如：台新信用卡" />
        </Field>
        <div className="row-2">
          <Field label="銀行（選填）" htmlFor={ids.bank}>
            <input id={ids.bank} className="input" value={bank} maxLength={40} onChange={(e) => setBank(e.target.value)} />
          </Field>
          <Field label="末四碼或識別（選填）" htmlFor={ids.tag}>
            <input id={ids.tag} className="input" value={tag} maxLength={20} onChange={(e) => setTag(e.target.value)} placeholder="例如：1234" />
          </Field>
        </div>
        <Field label="繳款截止日" htmlFor={ids.due} hint="個別月份的截止日可在首頁點卡片調整。">
          <select id={ids.due} className="select" value={dueDay ?? ''} onChange={(e) => setDueDay(e.target.value ? Number(e.target.value) : null)}>
            <option value="">不提醒</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                每月 {i + 1} 日{i + 1 >= 29 ? '（小月份取月底）' : ''}
              </option>
            ))}
          </select>
        </Field>
        {dueDay !== null && (
          <Field
            label="提前幾天提醒"
            htmlFor={ids.remind}
            hint="從這天開始，每次打開 App 都會提醒，直到按「已繳」；過了截止日還沒按，會顯示「已逾期」繼續提醒。"
          >
            <select id={ids.remind} className="select" value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
              {remindOptions(remindDays).map((n) => (
                <option key={n} value={n}>
                  {remindLabel(n)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="開始記錄的月份" htmlFor={ids.start} hint="這個月份之前不會要求輸入這張卡的總額。">
          <input id={ids.start} type="month" className="input" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
        </Field>
        <Field label="備註（選填）" htmlFor={ids.note}>
          <TextArea id={ids.note} value={note} onChange={setNote} rows={3} />
        </Field>
        {!isNew && endYm && (
          <Field label="停用月份（這個月起不再要求輸入）" htmlFor={ids.end}>
            <input id={ids.end} type="month" className="input" value={endYm} onChange={(e) => setEndYm(e.target.value)} />
          </Field>
        )}
        {error && <div className="callout callout-danger">{error}</div>}
      </div>

      {!isNew && (
        <div className="danger-zone">
          {endYm ? (
            <button type="button" className="btn btn-secondary" onClick={() => void enable()}>
              重新啟用這張卡
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => void disable()}>
              停用這張卡
            </button>
          )}
          {deletable && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              永久刪除（沒有任何紀錄）
            </button>
          )}
        </div>
      )}

      <div className="save-bar">
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {isNew ? '新增' : '儲存'}
        </button>
      </div>
    </main>
  )
}
