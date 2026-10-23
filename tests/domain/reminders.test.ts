import { describe, expect, it } from 'vitest'
import { computeReminders } from '../../src/domain/reminders'
import type { CardBill } from '../../src/domain/types'
import { card } from '../fixtures'

function bill(cardId: string, dueYm: string, over: Partial<CardBill> = {}): CardBill {
  return { id: `b-${cardId}-${dueYm}`, cardId, dueYm, dueDateOverride: null, paidDate: null, updatedAt: 0, ...over }
}

describe('卡費截止提醒', () => {
  const taishin = card('台新信用卡', { dueDay: 24, dueFrom: '2026-10-01' })

  it('截止前 5 天開始提醒（含第 5 天），第 6 天前不提醒', () => {
    expect(computeReminders('2026-10-18', [taishin], [])).toEqual([])
    const r = computeReminders('2026-10-19', [taishin], [])
    expect(r.map((x) => [x.dueDate, x.daysLeft, x.overdue])).toEqual([['2026-10-24', 5, false]])
    expect(computeReminders('2026-10-24', [taishin], [])[0]!.daysLeft).toBe(0)
  })

  it('過了截止日未繳 → 逾期持續提醒', () => {
    const r = computeReminders('2026-10-26', [taishin], [])
    expect(r.map((x) => [x.dueDate, x.daysLeft, x.overdue])).toEqual([['2026-10-24', -2, true]])
    // 拖到下個月仍提醒上個月的逾期
    const r2 = computeReminders('2026-11-10', [taishin], [])
    expect(r2.map((x) => x.dueDate)).toEqual(['2026-10-24'])
  })

  it('起算日之後未繳的月份會持續提醒（上個月逾期＋本月將到期同時出現）', () => {
    const c = card('台新信用卡', { dueDay: 24, dueFrom: '2026-09-01' })
    const r = computeReminders('2026-10-21', [c], [])
    expect(r.map((x) => [x.dueDate, x.overdue])).toEqual([
      ['2026-09-24', true],
      ['2026-10-24', false],
    ])
  })

  it('驗收回報 A15：逾期超過 3 個月仍持續提醒（只要起算日之後、未繳）', () => {
    const c = card('台新信用卡', { dueDay: 15, dueFrom: '2026-01-01' })
    const paidBills = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((ym) =>
      bill(c.id, ym, { paidDate: `${ym}-14` }),
    )
    const r = computeReminders('2026-10-21', [c], paidBills)
    expect(r.map((x) => x.dueDate)).toEqual(['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15'])
  })

  it('回溯上限 24 個月', () => {
    const c = card('舊卡', { dueDay: 10, dueFrom: '2020-01-01' })
    const r = computeReminders('2026-10-21', [c], [])
    expect(r[0]!.dueDate).toBe('2024-10-10')
    expect(r).toHaveLength(25)
  })

  it('按下已繳後不再提醒', () => {
    expect(computeReminders('2026-10-22', [taishin], [bill(taishin.id, '2026-10', { paidDate: '2026-10-22' })])).toEqual([])
  })

  it('個別月份覆寫截止日', () => {
    const r = computeReminders('2026-10-20', [taishin], [bill(taishin.id, '2026-10', { dueDateOverride: '2026-10-26' })])
    expect(r).toEqual([]) // 原本 10/24 截止、今天 10/20 已在 5 天內；覆寫成 10/26 後還差 6 天
    const r2 = computeReminders('2026-10-21', [taishin], [bill(taishin.id, '2026-10', { dueDateOverride: '2026-10-26' })])
    expect(r2.map((x) => [x.dueDate, x.daysLeft])).toEqual([['2026-10-26', 5]])
  })

  it('跨月：10/29 時，11/2 截止已在 5 天內', () => {
    const c = card('國泰信用卡', { dueDay: 2, dueFrom: '2026-10-01' })
    const bills = [bill(c.id, '2026-10', { paidDate: '2026-10-01' })]
    expect(computeReminders('2026-10-29', [c], bills).map((x) => [x.dueDate, x.daysLeft])).toEqual([['2026-11-02', 4]])
  })

  it('每月 31 日截止，在 11 月取 11/30', () => {
    const c = card('中信信用卡', { dueDay: 31, dueFrom: '2026-11-01' })
    expect(computeReminders('2026-11-27', [c], []).map((x) => x.dueDate)).toEqual(['2026-11-30'])
  })

  it('新設定截止日：起算日之前的截止日不提醒（不會一設定就跳逾期）', () => {
    const c = card('新卡', { dueDay: 15, dueFrom: '2026-10-21' })
    expect(computeReminders('2026-10-21', [c], [])).toEqual([])
    expect(computeReminders('2026-11-10', [c], []).map((x) => x.dueDate)).toEqual(['2026-11-15'])
  })

  it('未設定截止日不提醒；停用月份（含）之後的截止日不提醒', () => {
    expect(computeReminders('2026-10-22', [card('無截止日')], [])).toEqual([])
    const c = card('停用卡', { dueDay: 24, dueFrom: '2026-10-01', endYm: '2026-10' })
    expect(computeReminders('2026-10-22', [c], [])).toEqual([])
  })

  it('每張卡各自的提前天數：A 卡 1 天前、B 卡 2 天前（同一天截止）', () => {
    const a = card('A 卡', { dueDay: 24, dueFrom: '2026-10-01', remindDays: 1 })
    const b = card('B 卡', { dueDay: 24, dueFrom: '2026-10-01', remindDays: 2 })
    expect(computeReminders('2026-10-21', [a, b], [])).toEqual([])
    expect(computeReminders('2026-10-22', [a, b], []).map((x) => x.cardName)).toEqual(['B 卡'])
    expect(computeReminders('2026-10-23', [a, b], []).map((x) => [x.cardName, x.daysLeft])).toEqual([
      ['A 卡', 1],
      ['B 卡', 1],
    ])
    // 過了截止日兩張都逾期，繼續提醒
    expect(computeReminders('2026-10-26', [a, b], []).map((x) => x.overdue)).toEqual([true, true])
  })

  it('提前 7 天：第 7 天開始提醒；提前 0 天：截止當天才提醒', () => {
    const seven = card('七天卡', { dueDay: 24, dueFrom: '2026-10-01', remindDays: 7 })
    expect(computeReminders('2026-10-16', [seven], [])).toEqual([])
    expect(computeReminders('2026-10-17', [seven], []).map((x) => x.daysLeft)).toEqual([7])
    const zero = card('當天卡', { dueDay: 24, dueFrom: '2026-10-01', remindDays: 0 })
    expect(computeReminders('2026-10-23', [zero], [])).toEqual([])
    expect(computeReminders('2026-10-24', [zero], []).map((x) => x.daysLeft)).toEqual([0])
  })

  it('提前 31 天（舊版允許的上限）：兩個月後的截止日也會出現', () => {
    const c = card('早鳥卡', { dueDay: 1, dueFrom: '2026-10-01', remindDays: 31 })
    const paid = [bill(c.id, '2026-10', { paidDate: '2026-10-01' }), bill(c.id, '2026-11', { paidDate: '2026-10-31' })]
    expect(computeReminders('2026-10-31', [c], paid).map((x) => [x.dueDate, x.daysLeft])).toEqual([['2026-12-01', 31]])
  })

  it('多張卡依截止日排序', () => {
    const a = card('A 卡', { dueDay: 25, dueFrom: '2026-10-01' })
    const b = card('B 卡', { dueDay: 22, dueFrom: '2026-10-01' })
    expect(computeReminders('2026-10-21', [a, b], []).map((x) => x.cardName)).toEqual(['B 卡', 'A 卡'])
  })
})
