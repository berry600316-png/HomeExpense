import type {
  CardMonth,
  CreditCard,
  ExtraExpense,
  FixedTemplate,
  Occurrence,
  PaymentSource,
} from '../src/domain/types'
import type { MonthInput } from '../src/domain/compute'
import { ymOf } from '../src/domain/ym'

let seq = 0
const nid = (p: string) => `${p}-${++seq}`

export function card(name: string, over: Partial<CreditCard> = {}): CreditCard {
  return {
    id: nid('card'),
    name,
    bank: '',
    tag: '',
    order: seq,
    dueDay: null,
    dueFrom: null,
    remindDays: 5,
    note: '',
    startYm: '2026-01',
    endYm: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

export function cardSource(c: CreditCard): PaymentSource {
  return { id: nid('src'), kind: 'card', cardId: c.id, name: c.name, order: seq, archived: false, note: '' }
}

export function otherSource(name: string, kind: PaymentSource['kind'] = 'bank'): PaymentSource {
  return { id: nid('src'), kind, cardId: null, name, order: seq, archived: false, note: '' }
}

export function template(name: string, over: Partial<FixedTemplate> = {}): FixedTemplate {
  return {
    id: nid('tpl'),
    name,
    kind: 'general',
    defaultSourceId: null,
    amountMode: 'fixed',
    defaultAmount: null,
    cycleMonths: 1,
    anchorYm: '2026-01',
    anchorDay: null,
    order: seq,
    note: '',
    startYm: '2026-01',
    endYm: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

/** 已確認的一期：period 預設等於實際扣款月份。 */
export function paid(
  t: FixedTemplate,
  date: string,
  amount: number,
  source: PaymentSource | null,
  over: Partial<Occurrence> = {},
): Occurrence {
  const periodYm = over.periodYm !== undefined ? over.periodYm : t.cycleMonths === null ? null : ymOf(date)
  const id = nid('occ')
  return {
    id,
    templateId: t.id,
    periodKey: periodYm ?? `x:${id}`,
    periodYm,
    status: 'confirmed',
    actualDate: date,
    actualYm: ymOf(date),
    amount,
    sourceId: source?.id ?? null,
    inCardTotal: true,
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

export function marked(t: FixedTemplate, periodYm: string, status: 'skipped' | 'deferred'): Occurrence {
  return {
    id: nid('occ'),
    templateId: t.id,
    periodKey: periodYm,
    periodYm,
    status,
    actualDate: null,
    actualYm: null,
    amount: null,
    sourceId: null,
    inCardTotal: true,
    note: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

export function month(c: CreditCard, ym: string, amount: number | null): CardMonth {
  return { id: nid('cm'), cardId: c.id, ym, amount, note: '', updatedAt: 0 }
}

export function extra(name: string, date: string, amount: number): ExtraExpense {
  return {
    id: nid('ex'),
    name,
    amount,
    date,
    ym: ymOf(date),
    sourceId: null,
    note: '',
    createdAt: seq,
    updatedAt: 0,
  }
}

export function emptyInput(): MonthInput {
  return { cards: [], cardMonths: [], sources: [], templates: [], occurrences: [], extras: [] }
}

/** 規格 4.3 的完整驗算範例：2026 年 10 月，本月總花費 16,700。 */
export function october2026() {
  const taishin = card('台新信用卡')
  const cathay = card('國泰信用卡')
  const sTaishin = cardSource(taishin)
  const sCathay = cardSource(cathay)
  const sBank = otherSource('銀行轉帳')

  const ins1 = template('保險 1', { kind: 'insurance', cycleMonths: 6, anchorYm: '2026-04', defaultAmount: 2000, defaultSourceId: sTaishin.id })
  const phone = template('電話費', { amountMode: 'variable', defaultSourceId: sTaishin.id })
  const ins2 = template('保險 2', { kind: 'insurance', cycleMonths: 12, anchorYm: '2026-10', defaultAmount: 1000, defaultSourceId: sCathay.id })
  const water = template('水費', { cycleMonths: 2, anchorYm: '2026-02', amountMode: 'variable', defaultSourceId: sBank.id })

  const input: MonthInput = {
    cards: [taishin, cathay],
    sources: [sTaishin, sCathay, sBank],
    templates: [ins1, phone, ins2, water],
    cardMonths: [month(taishin, '2026-10', 8000), month(cathay, '2026-10', 5000)],
    occurrences: [
      paid(ins1, '2026-10-15', 2000, sTaishin),
      paid(phone, '2026-10-05', 720, sTaishin),
      paid(ins2, '2026-10-20', 1000, sCathay),
      paid(water, '2026-10-12', 700, sBank),
    ],
    extras: [extra('額外銀行轉帳購物', '2026-10-21', 3000)],
  }
  return { input, taishin, cathay, sTaishin, sCathay, sBank, ins1, phone, ins2, water }
}
