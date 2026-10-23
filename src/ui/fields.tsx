import { useId, type ReactNode } from 'react'
import { parseAmount } from '../domain/money'
import type { ID, PaymentSource } from '../domain/types'
import type { AllData } from '../hooks/useData'

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="label">{label}</span>}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

/** 金額輸入。數字鍵盤；接受千分位逗號；失焦時自動加上千分位。 */
export function AmountInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  invalid,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  invalid?: boolean
}) {
  return (
    <div className="amount-wrap">
      <span className="prefix">$</span>
      <input
        id={id}
        className="input input-amount"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        value={value}
        placeholder={placeholder ?? '0'}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,，０-９]/g, ''))}
        onBlur={() => {
          const n = parseAmount(value)
          if (n !== null && !Number.isNaN(n)) onChange(new Intl.NumberFormat('en-US').format(n))
        }}
      />
    </div>
  )
}

export function amountToText(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : new Intl.NumberFormat('en-US').format(Math.abs(n))
}

export function DateInput({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
}

export function TextArea({ id, value, onChange, placeholder, rows = 3 }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea id={id} className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

/** 付款來源顯示名稱（信用卡以卡片目前名稱為準）。 */
export function sourceName(data: AllData, s: PaymentSource): string {
  if (s.kind === 'card' && s.cardId) return data.cards.find((c) => c.id === s.cardId)?.name ?? s.name
  return s.name
}

/**
 * 付款來源選單。停用的來源不列出，但若目前值是停用來源仍保留顯示（歷史資料不可因停用而失去關聯）。
 * kinds 可限制只列出某些種類。
 */
export function SourceSelect({
  id,
  data,
  value,
  onChange,
  allowEmpty,
  emptyLabel = '未指定',
}: {
  id?: string
  data: AllData
  value: ID | null
  onChange: (v: ID | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const visible = data.sources.filter((s) => !s.archived || s.id === value).sort((a, b) => a.order - b.order)
  // 信用卡依卡片本身的順序排列（與首頁一致，在扣款來源頁調整）；其他來源依來源自己的順序
  const cardOrder = new Map(data.cards.map((c) => [c.id, c.order]))
  const orderOfCard = (s: PaymentSource) => (s.cardId !== null ? (cardOrder.get(s.cardId) ?? s.order) : s.order)
  const cards = visible.filter((s) => s.kind === 'card').sort((a, b) => orderOfCard(a) - orderOfCard(b))
  const others = visible.filter((s) => s.kind !== 'card')
  const missing = value !== null && !data.sources.some((s) => s.id === value)
  return (
    <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {(allowEmpty || value === null) && <option value="">{emptyLabel}</option>}
      {missing && <option value={value}>（已刪除的來源）</option>}
      {cards.length > 0 && (
        <optgroup label="信用卡">
          {cards.map((s) => (
            <option key={s.id} value={s.id}>
              {sourceName(data, s)}
              {s.archived ? '（已停用）' : ''}
            </option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="銀行／現金／其他">
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.archived ? '（已停用）' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export function useFieldId(): string {
  return useId()
}

export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
