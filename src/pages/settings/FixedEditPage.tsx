import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createBeneficiary, createTemplate, deleteTemplate, updateTemplate, type TemplateInput } from '../../db/repo'
import { formatMoney, parseAmount } from '../../domain/money'
import { upcomingDueMonths } from '../../domain/schedule'
import type { AmountMode, TemplateKind } from '../../domain/types'
import { addMonths, currentYm, formatYmLabel, isValidYm, todayYmd, ymOf } from '../../domain/ym'
import { useAllData } from '../../hooks/useData'
import { AmountInput, amountToText, Field, Segmented, SourceSelect, TextArea, useFieldId } from '../../ui/fields'
import { errorMessage, useToast } from '../../ui/Toast'
import { HistoryList } from '../sheets/FixedLineSheet'
import { Loading, PageHeader } from './common'

const PRESETS: (number | 'custom' | null)[] = [1, 2, 3, 6, 12, 'custom', null]
const PRESET_LABEL = (p: number | 'custom' | null) =>
  p === 1 ? '每月' : p === 2 ? '每兩個月' : p === 3 ? '每三個月' : p === 6 ? '每半年' : p === 12 ? '每年' : p === 'custom' ? '自訂' : '不固定'

export function FixedEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const toast = useToast()
  const data = useAllData()
  const t = !isNew && data ? data.templates.find((x) => x.id === id) : undefined
  const ins = !isNew && data ? data.insurance.find((x) => x.templateId === id) : undefined
  const ids = {
    name: useFieldId(), amount: useFieldId(), source: useFieldId(), anchor: useFieldId(), day: useFieldId(),
    start: useFieldId(), note: useFieldId(), ben: useFieldId(), insurer: useFieldId(), policy: useFieldId(), custom: useFieldId(), end: useFieldId(),
  }

  const [kind, setKind] = useState<TemplateKind>(params.get('kind') === 'insurance' ? 'insurance' : 'general')
  const [name, setName] = useState('')
  const [amountMode, setAmountMode] = useState<AmountMode>('fixed')
  const [amount, setAmount] = useState('')
  const [preset, setPreset] = useState<number | 'custom' | null>(1)
  const [customN, setCustomN] = useState('4')
  const [anchorYm, setAnchorYm] = useState(currentYm())
  const [anchorDay, setAnchorDay] = useState<number | null>(null)
  const [startYm, setStartYm] = useState(currentYm())
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [benId, setBenId] = useState<string | null>(null)
  const [insurer, setInsurer] = useState('')
  const [policyNo, setPolicyNo] = useState('')
  const [endYm, setEndYm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(isNew)

  useEffect(() => {
    if (!t || loaded) return
    setKind(t.kind)
    setName(t.name)
    setAmountMode(t.amountMode)
    setAmount(amountToText(t.defaultAmount))
    const p = t.cycleMonths
    if (p === null || [1, 2, 3, 6, 12].includes(p)) setPreset(p)
    else {
      setPreset('custom')
      setCustomN(String(p))
    }
    setAnchorYm(t.anchorYm)
    setAnchorDay(t.anchorDay)
    setStartYm(t.startYm)
    setSourceId(t.defaultSourceId)
    setNote(t.note)
    setEndYm(t.endYm ?? '')
    setBenId(ins?.beneficiaryId ?? null)
    setInsurer(ins?.insurer ?? '')
    setPolicyNo(ins?.policyNo ?? '')
    setLoaded(true)
  }, [t, ins, loaded])

  const cycleMonths = preset === 'custom' ? Number(customN) : preset
  const preview = useMemo(() => {
    if (cycleMonths === null || !Number.isInteger(cycleMonths) || cycleMonths < 1 || !isValidYm(anchorYm) || !isValidYm(startYm)) return []
    return upcomingDueMonths({ cycleMonths, anchorYm, anchorDay, startYm, endYm: endYm || null }, startYm > currentYm() ? startYm : currentYm(), 4)
  }, [cycleMonths, anchorYm, anchorDay, startYm, endYm])

  const history = useMemo(
    () =>
      data && t
        ? data.occurrences
            .filter((o) => o.templateId === t.id)
            .sort((a, b) => (b.actualDate ?? b.periodYm ?? '').localeCompare(a.actualDate ?? a.periodYm ?? ''))
        : [],
    [data, t],
  )

  if (!data || (!isNew && !loaded)) return <Loading />
  if (!isNew && !t) return <p>找不到這個項目</p>

  const bens = data.beneficiaries.filter((b) => !b.archived || b.id === benId).sort((a, b) => a.order - b.order)

  const addBen = async () => {
    const n = window.prompt('新增歸屬對象名稱（例如：爸爸、媽媽、自己）')
    if (!n?.trim()) return
    try {
      const b = await createBeneficiary(n)
      setBenId(b.id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const save = async () => {
    setError(null)
    const n = parseAmount(amount)
    if (!name.trim()) return setError(kind === 'insurance' ? '請輸入保險名稱' : '請輸入項目名稱')
    if (Number.isNaN(n)) return setError('金額只能是 0 以上的整數')
    if (amountMode === 'fixed' && n === null) return setError('固定金額模式需要填寫金額')
    if (preset === 'custom' && !(Number.isInteger(cycleMonths) && cycleMonths! >= 1 && cycleMonths! <= 120))
      return setError('自訂週期請輸入 1–120 的整數')
    const input: TemplateInput = {
      name,
      kind,
      defaultSourceId: sourceId,
      amountMode,
      defaultAmount: n,
      cycleMonths,
      anchorYm,
      anchorDay,
      startYm,
      note,
    }
    const insurance = kind === 'insurance' ? { beneficiaryId: benId, insurer, policyNo } : null
    try {
      if (isNew) {
        await createTemplate(input, insurance)
        toast(kind === 'insurance' ? '已新增保險' : '已新增固定支出')
      } else {
        if (t!.kind === 'insurance' && kind !== 'insurance' && !window.confirm('改成一般固定支出會移除歸屬對象、保險公司、保單編號。確定嗎？')) return
        await updateTemplate(id!, { ...input, endYm: endYm || null }, insurance)
        toast('已儲存（已確認的歷史紀錄不受影響）')
      }
      nav(-1)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const toggleActive = async () => {
    try {
      if (endYm) {
        await updateTemplate(id!, { endYm: null }, undefined)
        setEndYm('')
        toast('已重新啟用')
      } else {
        const next = addMonths(ymOf(todayYmd()), 1)
        if (!window.confirm(`從 ${formatYmLabel(next)}起停用？之前的繳費紀錄都會保留。`)) return
        await updateTemplate(id!, { endYm: next }, undefined)
        setEndYm(next)
        toast('已停用')
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('永久刪除這個項目？（沒有任何繳費紀錄才能刪除）')) return
    try {
      await deleteTemplate(id!)
      toast('已刪除')
      nav('/settings/fixed', { replace: true })
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const isIns = kind === 'insurance'
  return (
    <main>
      <PageHeader title={isNew ? (isIns ? '新增保險' : '新增固定支出') : isIns ? '編輯保險' : '編輯固定支出'} back="/settings/fixed" />
      <div className="edit-card form">
        <Field label="類型">
          <Segmented
            label="類型"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'general', label: '一般固定支出' },
              { value: 'insurance', label: '保險' },
            ]}
          />
        </Field>
        <Field label={isIns ? '保險名稱' : '項目名稱'} htmlFor={ids.name}>
          <input id={ids.name} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={isIns ? '例如：富邦醫療險' : '例如：電話費'} />
        </Field>

        {isIns && (
          <>
            <Field label="歸屬對象" htmlFor={ids.ben} hint="只是標示這張保單屬於誰，不影響金額計算。">
              <div style={{ display: 'flex', gap: 8 }}>
                <select id={ids.ben} className="select" value={benId ?? ''} onChange={(e) => setBenId(e.target.value || null)}>
                  <option value="">未指定</option>
                  {bens.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: 48, flex: 'none' }} onClick={() => void addBen()}>
                  新增
                </button>
              </div>
            </Field>
            <div className="row-2">
              <Field label="保險公司（選填）" htmlFor={ids.insurer}>
                <input id={ids.insurer} className="input" value={insurer} maxLength={40} onChange={(e) => setInsurer(e.target.value)} />
              </Field>
              <Field label="保單編號（選填）" htmlFor={ids.policy}>
                <input id={ids.policy} className="input" value={policyNo} maxLength={40} onChange={(e) => setPolicyNo(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <Field label="金額模式">
          <Segmented
            label="金額模式"
            value={amountMode}
            onChange={setAmountMode}
            options={[
              { value: 'fixed', label: '固定金額' },
              { value: 'variable', label: '每期金額不同' },
            ]}
          />
        </Field>
        <Field
          label={amountMode === 'fixed' ? (isIns ? '保費' : '金額') : '參考金額（選填）'}
          htmlFor={ids.amount}
          hint="只是確認時的預填值；每一期仍可填實際扣款金額，改這裡不會影響已確認的歷史紀錄。"
        >
          <AmountInput id={ids.amount} value={amount} onChange={setAmount} />
        </Field>

        <Field label="繳費頻率">
          <Segmented label="繳費頻率" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL(p) }))} />
        </Field>
        {preset === 'custom' && (
          <Field label="每幾個月一次" htmlFor={ids.custom}>
            <input id={ids.custom} className="input" inputMode="numeric" value={customN} onChange={(e) => setCustomN(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        {preset !== null && (
          <div className="row-2">
            <Field label="週期基準月份" htmlFor={ids.anchor} hint="任一次的扣款月份，例如 4 月扣、每半年 → 4 月、10 月">
              <input id={ids.anchor} type="month" className="input" value={anchorYm} onChange={(e) => setAnchorYm(e.target.value)} />
            </Field>
            <Field label="預計扣款日" htmlFor={ids.day}>
              <select id={ids.day} className="select" value={anchorDay ?? ''} onChange={(e) => setAnchorDay(e.target.value ? Number(e.target.value) : null)}>
                <option value="">未指定</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} 日
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {preview.length > 0 && (
          <div className="hint t-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: -6 }}>
            接下來的扣款月份：{preview.map((p) => formatYmLabel(p)).join('、')}
          </div>
        )}
        <Field label="開始記錄的月份" htmlFor={ids.start} hint="這個月份之前不會顯示「待確認」。">
          <input id={ids.start} type="month" className="input" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
        </Field>
        <Field label="預設扣款來源" htmlFor={ids.source} hint="確認每一期時會預填，可臨時改成別張卡或銀行轉帳。">
          <SourceSelect id={ids.source} data={data} value={sourceId} onChange={setSourceId} allowEmpty />
        </Field>
        <Field label={isIns ? '保單備註' : '備註'} htmlFor={ids.note} hint={isIns ? '例如保障內容、保費調整等。修改這裡不會覆蓋每一期的繳費備註。' : undefined}>
          <TextArea id={ids.note} value={note} onChange={setNote} rows={4} />
        </Field>
        {!isNew && endYm && (
          <Field label="停用月份（這個月起不再到期）" htmlFor={ids.end}>
            <input id={ids.end} type="month" className="input" value={endYm} onChange={(e) => setEndYm(e.target.value)} />
          </Field>
        )}
        {error && <div className="callout callout-danger">{error}</div>}
      </div>

      {!isNew && (
        <>
          <h2 className="group-title">繳費紀錄</h2>
          <HistoryList history={history} upcoming={[]} data={data} />
          {history.length > 0 && (
            <p className="t-muted" style={{ fontSize: 'var(--fs-xs)', margin: '6px 4px 0' }}>
              共 {history.filter((o) => o.status === 'confirmed').length} 次扣款，合計{' '}
              {formatMoney(history.reduce((s, o) => s + (o.status === 'confirmed' ? (o.amount ?? 0) : 0), 0))}
            </p>
          )}
          <div className="danger-zone">
            <button type="button" className="btn btn-secondary" onClick={() => void toggleActive()}>
              {endYm ? '重新啟用' : '停用這個項目'}
            </button>
            {history.length === 0 && (
              <button type="button" className="btn btn-danger" onClick={() => void remove()}>
                永久刪除（沒有任何紀錄）
              </button>
            )}
          </div>
        </>
      )}

      <div className="save-bar">
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {isNew ? '新增' : '儲存'}
        </button>
      </div>
    </main>
  )
}
