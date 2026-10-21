/**
 * 每月計算引擎。純函式：輸入資料 → 該月所有衍生數字。不存任何衍生金額。
 *
 *   信用卡變動消費 = 卡片原始月總額 − Σ(已確認、付款來源為該卡、包含於卡片總額、實際扣款日在該月的固定支出)
 *   本月總花費     = Σ 信用卡變動消費 + Σ 已確認固定支出（不論來源） + Σ 額外消費
 *
 * 防重複的結構保證：
 * - 每一期固定支出只有一個 sourceId，因此最多被一張卡扣除。
 * - 固定支出只依 actualYm 計入一個月份；預計月份與實際月份不同時，預計月份只顯示狀態、不計金額。
 */
import { isDueMonth } from './schedule'
import type {
  CardMonth,
  CreditCard,
  ExtraExpense,
  FixedTemplate,
  ID,
  Occurrence,
  PaymentSource,
  YM,
} from './types'
import { isActiveIn } from './ym'

export interface MonthInput {
  cards: CreditCard[]
  cardMonths: CardMonth[]
  sources: PaymentSource[]
  templates: FixedTemplate[]
  occurrences: Occurrence[]
  extras: ExtraExpense[]
}

export type FixedLineState =
  /** 已確認，實際扣款在本月 → 計入。 */
  | 'confirmed'
  /** 本月到期，尚未處理。 */
  | 'pending'
  /** 之前月份延後的期數，仍待確認。 */
  | 'carried'
  /** 本月到期，但標記延後（本月不計）。 */
  | 'deferred'
  /** 本期未扣款（永遠不計）。 */
  | 'skipped'
  /** 本月到期，但實際在其他月份扣款（計在那個月）。 */
  | 'paid-other-month'
  /** 週期性項目，本月未到期。 */
  | 'not-due'
  /** 不定期項目，本月沒有紀錄。 */
  | 'irregular-none'

export interface FixedLine {
  key: string
  template: FixedTemplate
  state: FixedLineState
  periodYm: YM | null
  occurrence: Occurrence | null
  /** 計入本月的金額；只有 state='confirmed' 才有值。 */
  amount: number | null
  /** 從哪張卡的月總額扣除；null = 非信用卡或未包含在卡片總額。 */
  deductedFromCardId: ID | null
}

export interface Deduction {
  line: FixedLine
  amount: number
}

export type CardStatus = 'missing' | 'zero' | 'entered'

export interface CardLine {
  card: CreditCard
  record: CardMonth | null
  raw: number | null
  status: CardStatus
  /** 本月是否必須輸入（區間內，或本月有固定支出從這張卡扣）。 */
  required: boolean
  deductions: Deduction[]
  deductionTotal: number
  /** 原始總額未輸入時為 null（不當作 0）。 */
  variable: number | null
  /** 扣除額大於原始總額：資料異常。 */
  exceedsTotal: boolean
  /** 原始總額為負數（退款大於消費）：需留意，非錯誤。 */
  rawNegative: boolean
}

export type IssueKind = 'card-missing' | 'fixed-pending' | 'deduction-exceeds-total' | 'raw-negative'

export interface Issue {
  kind: IssueKind
  /** 'anomaly' = 紅色異常；'incomplete' = 尚未完成；'notice' = 需留意。 */
  level: 'anomaly' | 'incomplete' | 'notice'
  cardId?: ID
  templateId?: ID
  message: string
}

export type MonthPhase = 'past' | 'current' | 'future'

export interface MonthResult {
  ym: YM
  cards: CardLine[]
  fixed: FixedLine[]
  extras: ExtraExpense[]
  totals: {
    cardVariable: number
    fixed: number
    extra: number
    total: number
  }
  phase: MonthPhase
  missingCards: number
  pendingFixed: number
  /** 所有必填卡片都已輸入、所有到期固定支出都已處理。 */
  complete: boolean
  hasAnomaly: boolean
  issues: Issue[]
}

function byOrder<T extends { order: number; name: string }>(a: T, b: T): number {
  return a.order - b.order || a.name.localeCompare(b.name, 'zh-Hant')
}

/** 這一期若計入，應從哪張卡扣除。 */
export function deductionCardId(o: Occurrence, sourcesById: Map<ID, PaymentSource>): ID | null {
  if (o.status !== 'confirmed' || !o.inCardTotal || o.sourceId === null) return null
  const s = sourcesById.get(o.sourceId)
  if (!s || s.kind !== 'card' || !s.cardId) return null
  return s.cardId
}

/** 已確認且資料齊全（有金額、有實際日期）的期數才會計入。 */
function isCountable(o: Occurrence): o is Occurrence & { amount: number; actualYm: YM } {
  return o.status === 'confirmed' && o.amount !== null && o.actualYm !== null && o.actualDate !== null
}

export function buildFixedLines(
  ym: YM,
  templates: FixedTemplate[],
  occurrences: Occurrence[],
  sourcesById: Map<ID, PaymentSource>,
): FixedLine[] {
  const occByTemplate = new Map<ID, Occurrence[]>()
  for (const o of occurrences) {
    const list = occByTemplate.get(o.templateId)
    if (list) list.push(o)
    else occByTemplate.set(o.templateId, [o])
  }

  const lines: FixedLine[] = []
  for (const t of [...templates].sort(byOrder)) {
    const occs = (occByTemplate.get(t.id) ?? []).slice().sort((a, b) =>
      (a.periodYm ?? a.actualYm ?? '').localeCompare(b.periodYm ?? b.actualYm ?? ''),
    )
    const own: FixedLine[] = []
    const push = (state: FixedLineState, o: Occurrence | null, periodYm: YM | null) => {
      const counted = state === 'confirmed' && o !== null && isCountable(o)
      own.push({
        key: o ? o.id : `${t.id}:${state}:${periodYm ?? ''}`,
        template: t,
        state,
        periodYm,
        occurrence: o,
        amount: counted ? o.amount : null,
        deductedFromCardId: counted ? deductionCardId(o, sourcesById) : null,
      })
    }

    // 1. 實際扣款在本月的期數（不論原本預計哪個月）
    for (const o of occs) {
      if (isCountable(o) && o.actualYm === ym) push('confirmed', o, o.periodYm)
    }

    // 2. 預計在本月的期數
    const forThisPeriod = occs.find((o) => o.periodYm === ym)
    if (forThisPeriod) {
      if (forThisPeriod.status === 'skipped') push('skipped', forThisPeriod, ym)
      else if (forThisPeriod.status === 'deferred') push('deferred', forThisPeriod, ym)
      else if (forThisPeriod.status === 'confirmed' && forThisPeriod.actualYm !== ym)
        push('paid-other-month', forThisPeriod, ym)
    } else if (isDueMonth(t, ym)) {
      push('pending', null, ym)
    }

    // 3. 之前延後、仍未結案的期數
    for (const o of occs) {
      if (o.status === 'deferred' && o.periodYm !== null && o.periodYm < ym) push('carried', o, o.periodYm)
    }

    // 4. 沒有任何狀態時，區間內的項目仍要顯示（規格 5.4：全部啟用中的項目都要顯示）
    if (own.length === 0 && isActiveIn(t, ym)) {
      push(t.cycleMonths === null ? 'irregular-none' : 'not-due', null, null)
    }

    lines.push(...own)
  }
  return lines
}

export function computeMonth(ym: YM, input: MonthInput, currentYm: YM): MonthResult {
  const sourcesById = new Map(input.sources.map((s) => [s.id, s]))
  const fixed = buildFixedLines(ym, input.templates, input.occurrences, sourcesById)

  const deductionsByCard = new Map<ID, Deduction[]>()
  for (const line of fixed) {
    if (line.deductedFromCardId && line.amount !== null) {
      const list = deductionsByCard.get(line.deductedFromCardId) ?? []
      list.push({ line, amount: line.amount })
      deductionsByCard.set(line.deductedFromCardId, list)
    }
  }

  const recordByCard = new Map<ID, CardMonth>()
  for (const r of input.cardMonths) if (r.ym === ym) recordByCard.set(r.cardId, r)

  const issues: Issue[] = []
  const cards: CardLine[] = []
  for (const card of [...input.cards].sort(byOrder)) {
    const record = recordByCard.get(card.id) ?? null
    const deductions = deductionsByCard.get(card.id) ?? []
    const active = isActiveIn(card, ym)
    if (!active && !record && deductions.length === 0) continue

    const raw = record?.amount ?? null
    const deductionTotal = deductions.reduce((s, d) => s + d.amount, 0)
    const variable = raw === null ? null : raw - deductionTotal
    const exceedsTotal = raw !== null && deductionTotal > 0 && deductionTotal > raw
    const rawNegative = raw !== null && raw < 0
    const required = active || deductions.length > 0
    const status: CardStatus = raw === null ? 'missing' : raw === 0 ? 'zero' : 'entered'

    if (required && raw === null)
      issues.push({ kind: 'card-missing', level: 'incomplete', cardId: card.id, message: `${card.name} 尚未輸入本月消費總額` })
    if (exceedsTotal)
      issues.push({
        kind: 'deduction-exceeds-total',
        level: 'anomaly',
        cardId: card.id,
        message: `${card.name} 扣除的固定支出大於當月消費總額`,
      })
    if (rawNegative)
      issues.push({ kind: 'raw-negative', level: 'notice', cardId: card.id, message: `${card.name} 本月總額為負數` })

    cards.push({ card, record, raw, status, required, deductions, deductionTotal, variable, exceedsTotal, rawNegative })
  }

  for (const line of fixed) {
    if (line.state === 'pending' || line.state === 'carried')
      issues.push({
        kind: 'fixed-pending',
        level: 'incomplete',
        templateId: line.template.id,
        message: `${line.template.name} 待確認`,
      })
  }

  const extras = input.extras
    .filter((e) => e.ym === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)

  const cardVariable = cards.reduce((s, c) => s + (c.variable ?? 0), 0)
  const fixedTotal = fixed.reduce((s, l) => s + (l.amount ?? 0), 0)
  const extraTotal = extras.reduce((s, e) => s + e.amount, 0)

  const missingCards = cards.filter((c) => c.required && c.raw === null).length
  const pendingFixed = fixed.filter((l) => l.state === 'pending' || l.state === 'carried').length

  return {
    ym,
    cards,
    fixed,
    extras,
    totals: { cardVariable, fixed: fixedTotal, extra: extraTotal, total: cardVariable + fixedTotal + extraTotal },
    phase: ym < currentYm ? 'past' : ym > currentYm ? 'future' : 'current',
    missingCards,
    pendingFixed,
    complete: missingCards === 0 && pendingFixed === 0,
    hasAnomaly: cards.some((c) => c.exceedsTotal),
    issues,
  }
}
