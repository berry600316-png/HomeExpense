import { CircleAlert, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { markBillNoPayment, markBillPaid, saveCardMonth, setBillDueDate } from '../../db/repo'
import type { CardLine } from '../../domain/compute'
import { formatMoney, parseAmount } from '../../domain/money'
import { billDueDate } from '../../domain/reminders'
import { clampDay, formatYmLabel, formatYmdShort, todayYmd, weekdayLabel } from '../../domain/ym'
import type { AllData, Lookups } from '../../hooks/useData'
import { AmountInput, amountToText, Field, TextArea, useFieldId } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'
import './sheets.css'

/**
 * 輸入某張卡某月的原始消費總額，並顯示扣除明細：
 *   當月消費總額 − 已確認固定支出 = 信用卡變動消費（即時計算，不另存）。
 */
export function CardMonthSheet({
  open,
  onClose,
  ym,
  line,
  lk,
}: {
  open: boolean
  onClose: () => void
  ym: string
  line: CardLine | null
  data: AllData
  lk: Lookups
}) {
  const toast = useToast()
  const amountId = useFieldId()
  const noteId = useFieldId()
  const [amount, setAmount] = useState('')
  const [negative, setNegative] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [paymentDate, setPaymentDate] = useState(todayYmd())

  const cardId = line?.card.id
  useEffect(() => {
    if (!open || !line) return
    setAmount(amountToText(line.raw))
    setNegative(line.raw !== null && line.raw < 0)
    setNote(line.record?.note ?? '')
    setError(null)
    setPaymentDate(todayYmd())
    // 只在打開或換卡／換月時載入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardId, ym])

  if (!line) return <Sheet open={false} onClose={onClose} title="" children={null} />

  const parsed = parseAmount(amount)
  const preview = parsed === null || Number.isNaN(parsed) ? null : negative ? -parsed : parsed
  const variablePreview = preview === null ? null : preview - line.deductionTotal
  const exceeds = preview !== null && ((line.deductionTotal > 0 && line.deductionTotal > preview) || (preview === line.raw && line.exceedsTotal))

  const save = async (value: number | null) => {
    setBusy(true)
    try {
      await saveCardMonth(line.card.id, ym, value, note)
      toast(value === null ? '已清除本月總額' : value === 0 ? '已記錄：本月無消費' : '已儲存')
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onSave = () => {
    if (parsed === null) {
      setError('請輸入金額；本月沒刷卡請按「本月無消費」')
      return
    }
    if (Number.isNaN(parsed)) {
      setError('金額只能是整數')
      return
    }
    void save(negative && parsed !== 0 ? -parsed : parsed)
  }

  const bill = lk.cardBillByKey.get(`${line.card.id}|${ym}`)
  const dueDate = billDueDate(line.card, ym, bill)
  const today = todayYmd()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={line.card.name}
      subtitle={`${formatYmLabel(ym)} · 1 日～月底消費總額`}
      footer={
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
          儲存
        </button>
      }
    >
      <div className="form">
        <Field label="本月信用卡消費總額" htmlFor={amountId} error={error} hint="依 App 的消費月份（1 日至月底）填寫；固定與額外消費會自動分類並扣重。">
          <AmountInput id={amountId} value={amount} onChange={(v) => { setAmount(v); setError(null) }} invalid={!!error} />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
          <span>總額為負數（本月退款大於消費）</span>
        </label>
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => {
              if (line.raw !== null && line.raw !== 0 && !window.confirm(`目前已輸入 ${formatMoney(line.raw)}，確定改成本月無消費（$0）嗎？`)) return
              void save(0)
            }}
          >
            本月無消費（$0）
          </button>
          {line.raw !== null && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm('清除後這個月會顯示「尚未輸入」，確定嗎？')) void save(null)
              }}
            >
              清除金額
            </button>
          )}
        </div>
      </div>

      <div className="sec">
        <h3 className="sec-title">扣除明細</h3>
        <div className="breakdown">
          <div className="kv">
            <span className="k">當月消費總額</span>
            <span className="v num">{preview === null ? <span className="t-muted">未輸入</span> : formatMoney(preview)}</span>
          </div>
          {line.deductions.map((d) => (
            <div className="kv" key={d.line.key}>
              <span className="k">
                {d.line.template.name}
                {d.line.occurrence?.actualDate && <span className="t-muted">　{formatYmdShort(d.line.occurrence.actualDate).slice(5)}</span>}
              </span>
              <span className="v num minus">−{formatMoney(d.amount)}</span>
            </div>
          ))}
          {line.extraDeductionTotal > 0 && <div className="kv"><span className="k">信用卡額外消費</span><span className="v num minus">−{formatMoney(line.extraDeductionTotal)}</span></div>}
          {line.deductions.length === 0 && line.extraDeductionTotal === 0 && (
            <div className="kv">
              <span className="k t-muted">本月沒有需要扣重的項目</span>
            </div>
          )}
          <div className="kv total">
            <span className="k">信用卡變動消費</span>
            <span className={`v num${variablePreview !== null && variablePreview < 0 ? ' t-danger' : ''}`}>
              {variablePreview === null ? '—' : formatMoney(variablePreview)}
            </span>
          </div>
        </div>
        {exceeds && (
          <div className="callout callout-danger" style={{ marginTop: 10 }}>
            <CircleAlert size={16} />
            <span>已列入項目大於當月消費總額。自動固定項目會先列為待確認，請修正卡片總額或逐項確認。</span>
          </div>
        )}
        {line.deductions.length > 0 && (
          <div className="callout callout-info" style={{ marginTop: 10 }}>
            <Info size={16} />
            <span>這些支出已在卡片月總額內，會先扣除再分類顯示，不會重複計算。</span>
          </div>
        )}
      </div>

      <div className="sec">
        <Field label="本月備註（這張卡）" htmlFor={noteId}>
          <TextArea id={noteId} value={note} onChange={setNote} rows={3} placeholder="例如：含一筆分期、退款 $500…" />
        </Field>
      </div>

      {(dueDate || bill) && (
        <div className="sec">
          <h3 className="sec-title">{formatYmLabel(ym)}截止的卡費</h3>
          <div className="breakdown">
            <div className="kv">
              <span className="k">本月截止日（可單獨修改）</span>
              <span className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  className="input"
                  style={{ minHeight: 40, padding: '6px 10px', width: 'auto' }}
                  value={dueDate ?? ''}
                  min={`${ym}-01`}
                  max={clampDay(ym, 31)}
                  onChange={(e) => {
                    const v = e.target.value
                    void setBillDueDate(line.card.id, ym, v || null)
                      .then(() => toast(v ? '已修改本月截止日' : '已恢復預設截止日'))
                      .catch((err) => toast(errorMessage(err), 'error'))
                  }}
                />
              </span>
            </div>
            {bill?.dueDateOverride && (
              <div className="kv">
                <span className="k t-muted">預設為每月 {line.card.dueDay} 日</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setBillDueDate(line.card.id, ym, null).then(() => toast('已恢復預設截止日'))}>
                  恢復預設
                </button>
              </div>
            )}
            <div className="kv">
              <span className="k">
                {dueDate ? `${formatYmdShort(dueDate)}（${weekdayLabel(dueDate)}）` : '未設定截止日'}
              </span>
              <span className="v">{bill?.paidDate ? `已繳 ${formatYmdShort(bill.paidDate)}` : bill?.noBill ? '本月無須繳' : '尚未繳款'}</span>
            </div>
            <div className="kv"><span className="k">實際繳款日</span><input type="date" className="input" style={{ width: 'auto', minHeight: 40 }} value={paymentDate} max={today} onChange={(e) => setPaymentDate(e.target.value)} /></div>
            <div className="inline-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={!paymentDate || paymentDate > today} onClick={() => void markBillPaid(line.card.id, ym, paymentDate).then(() => toast('已記錄繳款日期')).catch((e) => toast(errorMessage(e), 'error'))}>已繳</button>
              {!bill?.paidDate && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markBillNoPayment(line.card.id, ym, !bill?.noBill).then(() => toast(bill?.noBill ? '已恢復提醒' : '已標記本月無須繳')).catch((e) => toast(errorMessage(e), 'error'))}>{bill?.noBill ? '恢復提醒' : '本月無須繳'}</button>}
              {(bill?.paidDate || bill?.noBill) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markBillPaid(line.card.id, ym, null).then(() => toast('已改回未繳')).catch((e) => toast(errorMessage(e), 'error'))}>改回未繳</button>}
            </div>
          </div>
        </div>
      )}

      {line.card.note && (
        <div className="sec">
          <h3 className="sec-title">卡片備註</h3>
          <div className="note-text">{line.card.note}</div>
        </div>
      )}

      <div className="sec">
        <Link to={`/settings/cards/${line.card.id}`} className="btn btn-ghost btn-block">
          編輯卡片設定
        </Link>
      </div>
    </Sheet>
  )
}
