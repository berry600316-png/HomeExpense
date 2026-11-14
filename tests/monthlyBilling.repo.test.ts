import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HomeExpenseDB } from '../src/db/db'
import { confirmOccurrence, createCard, createSource, createTemplate, loadAll, markBillNoPayment, markBillPaid, markOccurrence, resetOccurrence, saveExtra, updateTemplate } from '../src/db/repo'
import { computeMonth } from '../src/domain/compute'

let db: HomeExpenseDB
let seq = 0
beforeEach(() => { db = new HomeExpenseDB(`monthly-billing-${++seq}`) })
afterEach(async () => { db.close(); await db.delete() })

const templateInput = (sourceId: string) => ({
  name: '水費', kind: 'general' as const, defaultSourceId: sourceId,
  amountMode: 'fixed' as const, defaultAmount: 100, cycleMonths: 1,
  anchorYm: '2026-06', anchorDay: null, startYm: '2026-06', note: '',
})

describe('月度消費儲存規則', () => {
  it('改固定金額之前保存舊月份快照，將來月份用新金額', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-06' }, '2026-11-14', db)
    const source = (await db.sources.where('cardId').equals(c.id).first())!
    const t = await createTemplate(templateInput(source.id), null, db)
    await updateTemplate(t.id, { defaultAmount: 120 }, undefined, db)
    const data = await loadAll(db)
    expect(computeMonth('2026-06', data, '2026-11').totals.fixed).toBe(100)
    expect(computeMonth('2026-11', data, '2026-11').totals.fixed).toBe(100)
    expect(computeMonth('2026-12', data, '2026-12').totals.fixed).toBe(120)
    expect((await db.occurrences.where('templateId').equals(t.id).toArray()).every((o) => o.automatic)).toBe(true)
  })

  it('從銀行改成信用卡時，舊月份仍待填銀行付款日', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-06' }, '2026-11-14', db)
    const cardSource = (await db.sources.where('cardId').equals(c.id).first())!
    const bank = await createSource('bank', '銀行', '', db)
    const t = await createTemplate(templateInput(bank.id), null, db)
    await updateTemplate(t.id, { defaultSourceId: cardSource.id, defaultAmount: 120 }, undefined, db)
    const data = await loadAll(db)
    const june = computeMonth('2026-06', data, '2026-11')
    expect(june.fixed[0]?.state).toBe('pending')
    expect(june.fixed[0]?.occurrence?.sourceId).toBe(bank.id)
    expect(june.fixed[0]?.occurrence?.amount).toBe(100)
    expect(june.totals.fixed).toBe(0)
    expect(computeMonth('2026-12', data, '2026-12').fixed[0]?.state).toBe('automatic')
  })

  it('改週期後，原本未到期的舊月份不能新增支出', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-06' }, '2026-11-14', db)
    const source = (await db.sources.where('cardId').equals(c.id).first())!
    const t = await createTemplate({ ...templateInput(source.id), cycleMonths: 2 }, null, db)
    await updateTemplate(t.id, { cycleMonths: 1 }, undefined, db)
    const data = await loadAll(db)
    expect(computeMonth('2026-07', data, '2026-11').fixed[0]?.state).toBe('not-due')
    expect(computeMonth('2026-07', data, '2026-11').totals.fixed).toBe(0)
    expect(computeMonth('2026-12', data, '2026-12').totals.fixed).toBe(100)
  })

  it('重設舊月份改動，會恢復修改模板前的金額', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-06' }, '2026-11-14', db)
    const source = (await db.sources.where('cardId').equals(c.id).first())!
    const t = await createTemplate(templateInput(source.id), null, db)
    await updateTemplate(t.id, { defaultAmount: 120 }, undefined, db)
    const changed = await confirmOccurrence({ templateId: t.id, periodYm: '2026-06', actualDate: null, amount: 110, sourceId: source.id, inCardTotal: true, note: '' }, db)
    expect(computeMonth('2026-06', await loadAll(db), '2026-11').totals.fixed).toBe(110)
    await resetOccurrence(changed.id, db)
    const restored = computeMonth('2026-06', await loadAll(db), '2026-11')
    expect(restored.fixed[0]?.state).toBe('automatic')
    expect(restored.totals.fixed).toBe(100)
    await markOccurrence(t.id, '2026-06', 'skipped', '', db)
    await resetOccurrence(changed.id, db)
    expect(computeMonth('2026-06', await loadAll(db), '2026-11').totals.fixed).toBe(100)
  })

  it('信用卡免日期但保留消費月份；銀行沒有實際日期不能儲存', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-06' }, '2026-11-14', db)
    const source = (await db.sources.where('cardId').equals(c.id).first())!
    const bank = await createSource('bank', '銀行', '', db)
    const t = await createTemplate(templateInput(source.id), null, db)
    const base = { templateId: t.id, periodYm: '2026-06', actualDate: null, amount: 100, inCardTotal: true, note: '' }
    const cardOccurrence = await confirmOccurrence({ ...base, sourceId: source.id }, db)
    expect(cardOccurrence.actualDate).toBeNull()
    expect(cardOccurrence.actualYm).toBe('2026-06')
    await expect(confirmOccurrence({ ...base, sourceId: bank.id }, db)).rejects.toThrow('付款日期')
    const e = await saveExtra({ name: '餐費', amount: 50, date: null, ym: '2026-06', sourceId: source.id, note: '' }, null, db)
    expect(e.ym).toBe('2026-06')
    expect(e.date).toBeNull()
  })

  it('卡費可記實際日期或無須繳，未來日期不能當已繳', async () => {
    const c = await createCard({ name: '信用卡', bank: '', tag: '', dueDay: 13, note: '', startYm: '2026-06' }, '2026-11-14', db)
    await markBillNoPayment(c.id, '2026-07', true, db)
    expect((await db.cardBills.toArray())[0]?.noBill).toBe(true)
    await markBillPaid(c.id, '2026-07', '2026-07-12', db)
    expect((await db.cardBills.toArray())[0]).toMatchObject({ noBill: false, paidDate: '2026-07-12' })
    await expect(markBillPaid(c.id, '2026-07', '2999-01-01', db)).rejects.toThrow('晚於今天')
  })
})
