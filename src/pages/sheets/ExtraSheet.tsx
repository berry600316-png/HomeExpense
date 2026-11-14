import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deleteExtra, saveExtra } from '../../db/repo'
import { formatMoney, parseAmount } from '../../domain/money'
import type { ExtraExpense } from '../../domain/types'
import { formatYmLabel, isValidYmd, ymOf } from '../../domain/ym'
import type { AllData } from '../../hooks/useData'
import { AmountInput, amountToText, DateInput, Field, SourceSelect, TextArea, useFieldId } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'
import './sheets.css'

/** 新增／修改非固定的消費。信用卡消費會從月總額扣重。 */
export function ExtraSheet({
  open,
  onClose,
  ym,
  today,
  extra,
  data,
}: {
  open: boolean
  onClose: () => void
  ym: string
  today: string
  extra: ExtraExpense | null
  data: AllData
}) {
  const toast = useToast()
  const ids = { name: useFieldId(), amount: useFieldId(), date: useFieldId(), source: useFieldId(), note: useFieldId() }
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ name?: string; amount?: string; date?: string }>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(extra?.name ?? '')
    setAmount(amountToText(extra?.amount))
    setDate(extra?.date ?? (ym === ymOf(today) ? today : `${ym}-01`))
    setSourceId(extra?.sourceId ?? null)
    setNote(extra?.note ?? '')
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extra?.id, ym])

  const src = sourceId ? data.sources.find((s) => s.id === sourceId) : undefined

  const onSave = async () => {
    const n = parseAmount(amount)
    const errs: typeof errors = {}
    if (!name.trim()) errs.name = '請輸入消費名稱'
    if (n === null) errs.amount = '請輸入金額'
    else if (Number.isNaN(n)) errs.amount = '金額只能是 0 以上的整數'
    if (src?.kind !== 'card' && !isValidYmd(date)) errs.date = '請選擇付款日期'
    setErrors(errs)
    if (Object.keys(errs).length || n === null || Number.isNaN(n)) return
    setBusy(true)
    try {
      const saved = await saveExtra({ name, amount: n, date: src?.kind === 'card' ? null : date, ym, sourceId, note }, extra?.id ?? null)
      toast(`${extra ? '已更新' : '已新增'} ${saved.name} ${formatMoney(saved.amount)}${saved.ym !== ym ? `（記在 ${formatYmLabel(saved.ym)}）` : ''}`)
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!extra || !window.confirm(`刪除「${extra.name}」${formatMoney(extra.amount)}？刪除後無法復原。`)) return
    setBusy(true)
    try {
      await deleteExtra(extra.id)
      toast('已刪除')
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={extra ? '編輯額外消費' : '新增額外消費'}
      subtitle={`${formatYmLabel(ym)}的其他花費`}
      footer={
        <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={busy}>
          {extra ? '儲存' : '新增'}
        </button>
      }
    >
      <div className="form">
        <Field label="消費名稱" htmlFor={ids.name} error={errors.name}>
          <input id={ids.name} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="例如：銀行轉帳買家電" aria-invalid={!!errors.name || undefined} />
        </Field>
        <Field label="金額" htmlFor={ids.amount} error={errors.amount}>
          <AmountInput id={ids.amount} value={amount} onChange={setAmount} invalid={!!errors.amount} />
        </Field>
        <div className="row-2">
          {src?.kind !== 'card' && <Field label="實際付款日" htmlFor={ids.date} error={errors.date}>
            <DateInput id={ids.date} value={date} onChange={setDate} />
          </Field>}
          <Field label="付款方式（選填）" htmlFor={ids.source}>
            <SourceSelect id={ids.source} data={data} value={sourceId} onChange={setSourceId} allowEmpty emptyLabel="不指定" />
          </Field>
        </div>
        {src?.kind === 'card' && (
          <div className="callout callout-warn">
            <Info size={16} />
            <span>列入 {formatYmLabel(ym)} 消費；若已輸入卡片月總額，系統會自動扣重。</span>
          </div>
        )}
        <Field label="備註（選填）" htmlFor={ids.note}>
          <TextArea id={ids.note} value={note} onChange={setNote} rows={2} />
        </Field>
        {extra && (
          <button type="button" className="btn btn-danger" onClick={() => void onDelete()} disabled={busy}>
            刪除這筆
          </button>
        )}
      </div>
    </Sheet>
  )
}
