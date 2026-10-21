/**
 * 卡費截止提醒。與花費計算完全無關：「已繳」只記日期、不記金額。
 */
import type { CardBill, CreditCard, ID, YM, YMD } from './types'
import { addDays, addMonths, clampDay, diffDays, monthsBetween, ymOf } from './ym'

export interface BillReminder {
  cardId: ID
  cardName: string
  dueYm: YM
  dueDate: YMD
  /** 距截止日天數；0 = 今天截止；負數 = 已逾期。 */
  daysLeft: number
  overdue: boolean
}

/** 某張卡某月的截止日：個別月份覆寫優先，否則 dueDay（小月份取月底）。 */
export function billDueDate(card: CreditCard, dueYm: YM, bill: CardBill | undefined): YMD | null {
  if (bill?.dueDateOverride) return bill.dueDateOverride
  if (card.dueDay === null) return null
  return clampDay(dueYm, card.dueDay)
}

/** 逾期最多回溯幾個月（避免資料異常時無限迴圈；24 個月未繳已遠超實際情境）。 */
export const MAX_LOOKBACK_MONTHS = 24

/**
 * 今天需要提醒的卡費。
 * 檢查範圍：從提醒起算月份（最多回溯 24 個月）～ 下個月的截止日
 * （下個月：例如 10/29 時，11/2 截止已在 5 天內）。逾期未繳會一直提醒，直到按已繳。
 * 條件：未繳、截止日 >= 提醒起算日 dueFrom、今天 >= 截止日 − daysBefore。
 * 卡片停用（endYm）之後的截止日不提醒。
 */
export function computeReminders(
  today: YMD,
  cards: CreditCard[],
  bills: CardBill[],
  daysBefore: number,
): BillReminder[] {
  const billMap = new Map(bills.map((b) => [`${b.cardId}|${b.dueYm}`, b]))
  const thisYm = ymOf(today)
  const out: BillReminder[] = []

  for (const card of cards) {
    if (card.dueDay === null && !bills.some((b) => b.cardId === card.id && b.dueDateOverride)) continue
    const fromYm = card.dueFrom !== null ? ymOf(card.dueFrom) : card.startYm
    const back = Math.min(MAX_LOOKBACK_MONTHS, Math.max(0, monthsBetween(fromYm, thisYm)))
    for (let i = -back; i <= 1; i++) {
      const dueYm = addMonths(thisYm, i)
      if (card.endYm !== null && dueYm >= card.endYm) continue
      const bill = billMap.get(`${card.id}|${dueYm}`)
      if (bill?.paidDate) continue
      const dueDate = billDueDate(card, dueYm, bill)
      if (dueDate === null) continue
      if (card.dueFrom !== null && dueDate < card.dueFrom) continue
      if (today < addDays(dueDate, -daysBefore)) continue
      const daysLeft = diffDays(today, dueDate)
      out.push({ cardId: card.id, cardName: card.name, dueYm, dueDate, daysLeft, overdue: daysLeft < 0 })
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardName.localeCompare(b.cardName, 'zh-Hant'))
}
