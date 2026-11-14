import { describe, expect, it } from 'vitest'
import { computeMonth } from '../../src/domain/compute'
import { computeReminders } from '../../src/domain/reminders'
import { card, cardSource, emptyInput, extra, month, otherSource, paid, template } from '../fixtures'

const CURRENT = '2026-11'

describe('信用卡消費月份與付款日期分開', () => {
  it('固定金額在沒有卡片總額時先列入，輸入總額後扣重', () => {
    const c = card('信用卡')
    const s = cardSource(c)
    const t = template('水費', { defaultSourceId: s.id, defaultAmount: 100, startYm: '2026-06' })
    const input = { ...emptyInput(), cards: [c], sources: [s], templates: [t] }
    const june = computeMonth('2026-06', input, CURRENT)
    expect(june.fixed[0]?.state).toBe('automatic')
    expect(june.totals.fixed).toBe(100)
    expect(june.totals.total).toBe(100)
    expect(june.missingCards).toBe(1)
    input.cardMonths = [month(c, '2026-06', 500)]
    const entered = computeMonth('2026-06', input, CURRENT)
    expect(entered.cards[0]?.variable).toBe(400)
    expect(entered.totals.total).toBe(500)
  })

  it('卡片總額不足時全部自動項目暫停；修正總額後恢復', () => {
    const c = card('信用卡')
    const s = cardSource(c)
    const a = template('水費', { defaultSourceId: s.id, defaultAmount: 100 })
    const b = template('電話費', { defaultSourceId: s.id, defaultAmount: 80 })
    const input = { ...emptyInput(), cards: [c], sources: [s], templates: [a, b], cardMonths: [month(c, '2026-11', 150)] }
    const short = computeMonth('2026-11', input, CURRENT)
    expect(short.fixed.map((l) => l.state)).toEqual(['pending', 'pending'])
    expect(short.pendingFixed).toBe(2)
    expect(short.hasAnomaly).toBe(true)
    input.cardMonths = [month(c, '2026-11', 200)]
    const corrected = computeMonth('2026-11', input, CURRENT)
    expect(corrected.fixed.map((l) => l.state)).toEqual(['automatic', 'automatic'])
    expect(corrected.totals.total).toBe(200)
  })

  it('逐筆手動確認後仍保留總額不一致警示', () => {
    const c = card('信用卡')
    const s = cardSource(c)
    const a = template('水費', { defaultSourceId: s.id, defaultAmount: 100 })
    const b = template('電話費', { defaultSourceId: s.id, defaultAmount: 80 })
    const result = computeMonth('2026-11', {
      ...emptyInput(), cards: [c], sources: [s], templates: [a, b],
      cardMonths: [month(c, '2026-11', 150)],
      occurrences: [paid(a, '2026-11-01', 100, s), paid(b, '2026-11-02', 80, s)],
    }, CURRENT)
    expect(result.pendingFixed).toBe(0)
    expect(result.hasAnomaly).toBe(true)
    expect(result.complete).toBe(false)
  })

  it('晚一個月刷的固定信用卡支出仍只算原所屬月；銀行則依付款日', () => {
    const c = card('信用卡')
    const s = cardSource(c)
    const bank = otherSource('銀行')
    const cardTpl = template('卡片水費', { defaultSourceId: s.id, defaultAmount: 100, cycleMonths: 12, anchorYm: '2026-06' })
    const bankTpl = template('銀行電費', { defaultSourceId: bank.id, defaultAmount: 300 })
    const input = {
      ...emptyInput(), cards: [c], sources: [s, bank], templates: [cardTpl, bankTpl],
      occurrences: [
        paid(cardTpl, '2026-07-05', 100, s, { periodYm: '2026-06', periodKey: '2026-06' }),
        paid(bankTpl, '2026-07-05', 300, bank, { periodYm: '2026-06', periodKey: '2026-06' }),
      ],
    }
    expect(computeMonth('2026-06', input, CURRENT).totals.fixed).toBe(100)
    expect(computeMonth('2026-07', input, CURRENT).totals.fixed).toBe(300)
  })

  it('信用卡額外消費列明細並從同月卡片總額扣重', () => {
    const c = card('信用卡')
    const s = cardSource(c)
    const e = { ...extra('餐費', '2026-11-05', 100), sourceId: s.id, date: null }
    const result = computeMonth('2026-11', {
      ...emptyInput(), cards: [c], sources: [s], cardMonths: [month(c, '2026-11', 500)], extras: [e],
    }, CURRENT)
    expect(result.cards[0]?.extraDeductionTotal).toBe(100)
    expect(result.cards[0]?.variable).toBe(400)
    expect(result.totals.total).toBe(500)
  })

  it('本月無須繳會關閉該截止月份提醒，與消費月份無關', () => {
    const c = card('信用卡', { dueDay: 13, dueFrom: '2026-07-01' })
    expect(computeReminders('2026-07-12', [c], []).length).toBe(1)
    expect(computeReminders('2026-07-12', [c], [{
      id: 'b', cardId: c.id, dueYm: '2026-07', dueDateOverride: null,
      paidDate: null, noBill: true, updatedAt: 0,
    }])).toEqual([])
  })

  it('卡片停用後仍可操作最後一期卡費', () => {
    const c = card('信用卡', { startYm: '2026-01', endYm: '2026-07', dueDay: 13, dueFrom: '2026-01-01' })
    const august = computeMonth('2026-08', { ...emptyInput(), cards: [c] }, '2026-08')
    expect(august.cards).toHaveLength(1)
    expect(august.cards[0]?.required).toBe(false)
    expect(computeReminders('2026-08-12', [c], []).map((r) => r.dueYm)).toContain('2026-08')
    expect(computeReminders('2026-09-12', [c], []).some((r) => r.dueYm === '2026-09')).toBe(false)
  })

  it('停用卡片的個別截止日覆寫仍可顯示與撤銷已繳', () => {
    const c = card('信用卡', { startYm: '2026-01', endYm: '2026-07', dueDay: null })
    const bill = { id: 'bill', cardId: c.id, dueYm: '2026-09', dueDateOverride: '2026-09-13', paidDate: null, updatedAt: 0 }
    expect(computeReminders('2026-09-12', [c], [bill]).map((r) => r.dueYm)).toContain('2026-09')
    expect(computeMonth('2026-09', { ...emptyInput(), cards: [c], cardBills: [bill] }, '2026-09').cards).toHaveLength(1)
    const paid = { ...bill, paidDate: '2026-09-12' }
    expect(computeReminders('2026-09-12', [c], [paid])).toEqual([])
    expect(computeMonth('2026-09', { ...emptyInput(), cards: [c], cardBills: [paid] }, '2026-09').cards).toHaveLength(1)
  })
})
