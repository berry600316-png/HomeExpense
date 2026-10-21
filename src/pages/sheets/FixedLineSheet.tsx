import { Info } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmOccurrence, markOccurrence, resetOccurrence } from '../../db/repo'
import type { FixedLine } from '../../domain/compute'
import { formatMoney, parseAmount } from '../../domain/money'
import { cycleLabel, expectedDate, upcomingDueMonths } from '../../domain/schedule'
import type { Occurrence } from '../../domain/types'
import { clampDay, formatYmLabel, formatYmdShort, isValidYmd, parseYm, ymOf } from '../../domain/ym'
import { sourceLabel, type AllData, type Lookups } from '../../hooks/useData'
import { AmountInput, amountToText, DateInput, Field, SourceSelect, TextArea, useFieldId } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'
import './sheets.css'

const STATE_BADGE: Record<FixedLine['state'], { cls: string; text: string }> = {
  confirmed: { cls: 'ok', text: '已確認' },
  pending: { cls: 'warn', text: '待確認' },
  carried: { cls: 'warn', text: '待確認（延後期）' },
  deferred: { cls: '', text: '本期延後' },
  skipped: { cls: '', text: '本期未扣款' },
  'paid-other-month': { cls: '', text: '已在其他月份扣款' },
  'not-due': { cls: '', text: '本月未到期' },
  'irregular-none': { cls: '', text: '不定期 · 本月無紀錄' },
}

function m(ym: string) {
  return `${parseYm(ym).m} 月`
}

export function FixedLineSheet({
  open,
  onClose,
  ym,
  today,
  line,
  data,
  lk,
}: {
  open: boolean
  onClose: () => void
  ym: string
  today: string
  line: FixedLine | null
  data: AllData
  lk: Lookups
}) {
  const toast = useToast()
  const ids = { amount: useFieldId(), date: useFieldId(), source: useFieldId(), note: useFieldId() }
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [inCardTotal, setInCardTotal] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const t = line?.template
  const occ = line?.occurrence ?? null
  const periodic = t ? t.cycleMonths !== null : false
  const periodYm = line?.periodYm ?? null
  const canRecord = !!line && line.state !== 'not-due'

  useEffect(() => {
    if (!open || !line || !t) return
    const defaultDate = () => {
      if (line.state === 'pending' && periodYm) return expectedDate(t, periodYm)
      return ym === ymOf(today) ? today : clampDay(ym, t.anchorDay ?? 1)
    }
    setAmount(amountToText(occ?.amount ?? t.defaultAmount))
    setDate(occ?.actualDate ?? defaultDate())
    setSourceId(occ?.sourceId ?? t.defaultSourceId)
    setInCardTotal(occ?.inCardTotal ?? true)
    setNote(occ?.note ?? '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.key, ym])

  const history = useMemo(() => {
    if (!t) return []
    return data.occurrences
      .filter((o) => o.templateId === t.id)
      .sort((a, b) => (b.actualDate ?? b.periodYm ?? '').localeCompare(a.actualDate ?? a.periodYm ?? ''))
  }, [data.occurrences, t])

  const upcoming = useMemo(() => {
    if (!t || t.cycleMonths === null) return []
    const taken = new Set(history.map((o) => o.periodKey))
    return upcomingDueMonths(t, ymOf(today), 4).filter((p) => !taken.has(p)).slice(0, 3)
  }, [t, history, today])

  if (!line || !t) return <Sheet open={false} onClose={onClose} title="" children={null} />

  const ins = lk.insuranceByTemplate.get(t.id)
  const who = ins?.beneficiaryId ? lk.beneficiaryById.get(ins.beneficiaryId)?.name : null
  const src = sourceId ? lk.sourceById.get(sourceId) : undefined
  const isCard = src?.kind === 'card'
  const actualYm = isValidYmd(date) ? ymOf(date) : null
  const badge = STATE_BADGE[line.state]

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast(msg)
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const onConfirm = () => {
    const n = parseAmount(amount)
    if (n === null || Number.isNaN(n)) {
      setError(n === null ? '請輸入實際扣款金額' : '金額只能是 0 以上的整數')
      return
    }
    if (!isValidYmd(date)) {
      setError('請選擇實際扣款日期')
      return
    }
    void run(
      () =>
        confirmOccurrence({
          templateId: t.id,
          periodYm: periodic ? periodYm : null,
          occurrenceId: periodic ? undefined : (occ?.id ?? undefined),
          actualDate: date,
          amount: n,
          sourceId,
          inCardTotal: isCard ? inCardTotal : true,
          note,
        }),
      `已確認 ${t.name} ${formatMoney(n)}`,
    )
  }

  const onMark = (status: 'skipped' | 'deferred') => {
    if (!periodYm) return
    if (occ?.status === 'confirmed' && !window.confirm('這一期已確認扣款，改標記後已確認的金額會被移除。確定嗎？')) return
    void run(() => markOccurrence(t.id, periodYm, status, note), status === 'skipped' ? '已標記本期未扣款' : '已標記延後，之後月份會持續提醒')
  }

  const onReset = () => {
    if (!occ) return
    const msg = periodic ? '恢復成「待確認」？這一期已填的金額與備註會被移除。' : '刪除這筆扣款紀錄？'
    if (!window.confirm(msg)) return
    void run(() => resetOccurrence(occ.id), periodic ? '已恢復為待確認' : '已刪除')
  }

  const title = periodic && periodYm ? `${t.name}` : t.name
  const subtitle =
    periodic && periodYm ? `${formatYmLabel(periodYm)}期 · ${cycleLabel(t.cycleMonths)}` : `${cycleLabel(t.cycleMonths)} · ${formatYmLabel(ym)}`

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        canRecord ? (
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {occ?.status === 'confirmed' ? '更新扣款' : '確認扣款'}
          </button>
        ) : undefined
      }
    >
      <div style={{ marginBottom: 14 }}>
        <span className={`state-badge ${badge.cls}`}>{badge.text}</span>
      </div>

      {canRecord ? (
        <div className="form">
          <Field label="實際扣款金額" htmlFor={ids.amount} error={error} hint={t.defaultAmount !== null ? `參考金額 ${formatMoney(t.defaultAmount)}，可依實際扣款修改` : undefined}>
            <AmountInput id={ids.amount} value={amount} onChange={(v) => { setAmount(v); setError(null) }} invalid={!!error} />
          </Field>
          <div className="row-2">
            <Field label="實際扣款日" htmlFor={ids.date}>
              <DateInput id={ids.date} value={date} onChange={(v) => { setDate(v); setError(null) }} />
            </Field>
            <Field label="扣款來源" htmlFor={ids.source}>
              <SourceSelect id={ids.source} data={data} value={sourceId} onChange={setSourceId} allowEmpty />
            </Field>
          </div>
          {periodic && periodYm && actualYm && actualYm !== periodYm && (
            <div className="callout callout-info">
              <Info size={16} />
              <span>
                這是 {m(periodYm)}期，實際在 {m(actualYm)}扣款，金額會計入 <b>{formatYmLabel(actualYm)}</b>。
              </span>
            </div>
          )}
          {isCard && (
            <>
              <div className="hint t-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: -6 }}>
                會從「{sourceLabel(data, sourceId)}」{actualYm ? `${m(actualYm)}` : ''}的消費總額中扣除，避免重複計算。
              </div>
              <label className="check-row" style={{ paddingTop: 0 }}>
                <input type="checkbox" checked={!inCardTotal} onChange={(e) => setInCardTotal(!e.target.checked)} />
                <span>這筆不在該卡當月消費總額內（罕見，勾選後不從卡片扣除）</span>
              </label>
            </>
          )}
          <Field label="當期備註" htmlFor={ids.note}>
            <TextArea id={ids.note} value={note} onChange={setNote} rows={2} placeholder="例如：本期保費調整、改用其他卡…" />
          </Field>

          {(periodic || occ) && (
            <div className="inline-actions">
              {periodic && periodYm && line.state !== 'deferred' && line.state !== 'carried' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMark('deferred')} disabled={busy}>
                  延後扣款
                </button>
              )}
              {periodic && periodYm && line.state !== 'skipped' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMark('skipped')} disabled={busy}>
                  本期未扣款
                </button>
              )}
              {occ && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onReset} disabled={busy}>
                  {periodic ? '恢復為待確認' : '刪除這筆'}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="t-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
          這個月不是扣款月份，不計入支出。{upcoming[0] ? `下次預計 ${formatYmLabel(upcoming[0])}。` : ''}
        </p>
      )}

      {ins && (
        <div className="sec">
          <h3 className="sec-title">保單資訊</h3>
          <dl className="meta-grid">
            <dt>歸屬對象</dt>
            <dd>{who ?? '未指定'}</dd>
            {ins.insurer && (
              <>
                <dt>保險公司</dt>
                <dd>{ins.insurer}</dd>
              </>
            )}
            {ins.policyNo && (
              <>
                <dt>保單編號</dt>
                <dd>{ins.policyNo}</dd>
              </>
            )}
            <dt>預設扣款</dt>
            <dd>{sourceLabel(data, t.defaultSourceId) || '未指定'}</dd>
          </dl>
        </div>
      )}

      {t.note && (
        <div className="sec">
          <h3 className="sec-title">{ins ? '保單備註' : '項目備註'}</h3>
          <div className="note-text">{t.note}</div>
        </div>
      )}

      <div className="sec">
        <h3 className="sec-title">繳費紀錄</h3>
        <HistoryList history={history} upcoming={upcoming} data={data} />
      </div>

      <div className="sec">
        <Link to={`/settings/fixed/${t.id}`} className="btn btn-ghost btn-block">
          編輯{ins ? '保單' : '項目'}設定
        </Link>
      </div>
    </Sheet>
  )
}

export function HistoryList({ history, upcoming, data }: { history: Occurrence[]; upcoming: string[]; data: AllData }) {
  if (history.length === 0 && upcoming.length === 0) return <p className="t-muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>尚無紀錄</p>
  return (
    <div className="history">
      {[...upcoming].reverse().map((p) => (
        <div className="history-row is-future" key={`u-${p}`}>
          <div className="when">{formatYmLabel(p)} · 預計繳費，尚未確認</div>
        </div>
      ))}
      {history.map((o) => (
        <div className="history-row" key={o.id}>
          <div className="when">
            <div>
              {o.status === 'confirmed' && o.actualDate
                ? formatYmdShort(o.actualDate)
                : `${o.periodYm ? formatYmLabel(o.periodYm) : ''}期`}
              {o.status === 'confirmed' && o.periodYm && o.actualYm !== o.periodYm ? `（${m(o.periodYm)}期）` : ''}
              {o.status === 'confirmed' && o.sourceId ? ` · ${sourceLabel(data, o.sourceId)}` : ''}
              {o.status === 'skipped' ? ' · 未扣款' : ''}
              {o.status === 'deferred' ? ' · 延後中' : ''}
            </div>
            {o.note && <div className="sub">{o.note}</div>}
          </div>
          {o.status === 'confirmed' && o.amount !== null && <div className="amt num">{formatMoney(o.amount)}</div>}
        </div>
      ))}
    </div>
  )
}
