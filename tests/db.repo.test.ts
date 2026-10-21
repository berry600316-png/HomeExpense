/**
 * 資料存取層整合測試（fake-indexeddb）。驗證資料完整性規則在「真的寫進資料庫」時成立。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HomeExpenseDB } from '../src/db/db'
import * as repo from '../src/db/repo'
import { computeMonth } from '../src/domain/compute'

let d: HomeExpenseDB
let n = 0
beforeEach(() => {
  d = new HomeExpenseDB(`t-repo-${++n}`)
})
afterEach(async () => {
  d.close()
  await d.delete()
})

const TODAY = '2026-10-21'
const cardInput = (name: string) => ({ name, bank: '', tag: '', dueDay: null, note: '', startYm: '2026-01' })
const tplInput = (over: Partial<repo.TemplateInput> = {}): repo.TemplateInput => ({
  name: '電話費',
  kind: 'general',
  defaultSourceId: null,
  amountMode: 'variable',
  defaultAmount: null,
  cycleMonths: 1,
  anchorYm: '2026-01',
  anchorDay: null,
  startYm: '2026-01',
  note: '',
  ...over,
})

async function cardSourceId(cardId: string) {
  return (await d.sources.where('cardId').equals(cardId).first())!.id
}

describe('完整流程：用資料存取層建出 2026 年 10 月資料 → 總花費 16,700', () => {
  it('寫入資料庫、重新載入後計算正確', async () => {
    const taishin = await repo.createCard(cardInput('台新信用卡'), TODAY, d)
    const cathay = await repo.createCard(cardInput('國泰信用卡'), TODAY, d)
    const bank = await repo.createSource('bank', '銀行轉帳', '', d)
    const sT = await cardSourceId(taishin.id)
    const sC = await cardSourceId(cathay.id)
    const dad = await repo.createBeneficiary('爸爸', d)

    const ins1 = await repo.createTemplate(
      tplInput({ name: '保險 1', kind: 'insurance', cycleMonths: 6, anchorYm: '2026-04', amountMode: 'fixed', defaultAmount: 2000, defaultSourceId: sT }),
      { beneficiaryId: dad.id, insurer: '富邦', policyNo: '' },
      d,
    )
    const phone = await repo.createTemplate(tplInput({ name: '電話費', defaultSourceId: sT }), null, d)
    const ins2 = await repo.createTemplate(
      tplInput({ name: '保險 2', kind: 'insurance', cycleMonths: 12, anchorYm: '2026-10', amountMode: 'fixed', defaultAmount: 1000, defaultSourceId: sC }),
      { beneficiaryId: null, insurer: '', policyNo: '' },
      d,
    )
    const water = await repo.createTemplate(tplInput({ name: '水費', cycleMonths: 2, anchorYm: '2026-02', defaultSourceId: bank.id }), null, d)

    await repo.saveCardMonth(taishin.id, '2026-10', 8000, undefined, d)
    await repo.saveCardMonth(cathay.id, '2026-10', 5000, undefined, d)
    const c = (templateId: string, actualDate: string, amount: number, sourceId: string) =>
      repo.confirmOccurrence({ templateId, periodYm: '2026-10', actualDate, amount, sourceId, inCardTotal: true, note: '' }, d)
    await c(ins1.id, '2026-10-15', 2000, sT)
    await c(phone.id, '2026-10-05', 720, sT)
    await c(ins2.id, '2026-10-20', 1000, sC)
    await c(water.id, '2026-10-12', 700, bank.id)
    await repo.saveExtra({ name: '額外銀行轉帳購物', amount: 3000, date: '2026-10-21', sourceId: bank.id, note: '' }, null, d)

    // 關閉後重開，確認資料保留（#17）
    const name = d.name
    d.close()
    d = new HomeExpenseDB(name)
    const r = computeMonth('2026-10', await repo.loadAll(d), '2026-10')
    expect(r.totals).toEqual({ cardVariable: 9280, fixed: 4420, extra: 3000, total: 16700 })
    expect(r.complete).toBe(true)
  })
})

describe('信用卡', () => {
  it('新增卡片自動建立一對一的付款來源；改名同步', async () => {
    const c = await repo.createCard(cardInput('台新'), TODAY, d)
    const srcs = await d.sources.where('cardId').equals(c.id).toArray()
    expect(srcs).toHaveLength(1)
    expect(srcs[0]!.kind).toBe('card')
    await repo.updateCard(c.id, { name: '台新 Richart' }, TODAY, d)
    expect((await d.sources.get(srcs[0]!.id))!.name).toBe('台新 Richart')
  })

  it('同一張卡同一月份重複輸入是更新，不新增第二筆', async () => {
    const c = await repo.createCard(cardInput('台新'), TODAY, d)
    await repo.saveCardMonth(c.id, '2026-10', 8000, '第一次', d)
    await repo.saveCardMonth(c.id, '2026-10', 8200, undefined, d)
    const rows = await d.cardMonths.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amount).toBe(8200)
    expect(rows[0]!.note).toBe('第一次')
  })

  it('確認為 0 與清除（回到未輸入）不同', async () => {
    const c = await repo.createCard(cardInput('台新'), TODAY, d)
    await repo.saveCardMonth(c.id, '2026-10', 0, undefined, d)
    expect((await d.cardMonths.toArray())[0]!.amount).toBe(0)
    await repo.saveCardMonth(c.id, '2026-10', null, '', d)
    expect(await d.cardMonths.count()).toBe(0)
    await repo.saveCardMonth(c.id, '2026-10', null, '只寫備註', d)
    expect((await d.cardMonths.toArray())[0]).toMatchObject({ amount: null, note: '只寫備註' })
  })

  it('設定截止日時記錄起算日；改截止日重設起算日', async () => {
    const c = await repo.createCard({ ...cardInput('台新'), dueDay: 24 }, '2026-10-21', d)
    expect(c.dueFrom).toBe('2026-10-21')
    await repo.updateCard(c.id, { dueDay: 15 }, '2026-11-02', d)
    expect((await d.cards.get(c.id))!.dueFrom).toBe('2026-11-02')
    await repo.updateCard(c.id, { name: '改名' }, '2026-12-01', d)
    expect((await d.cards.get(c.id))!.dueFrom).toBe('2026-11-02')
  })

  it('#20 有月份紀錄的卡不能刪除只能停用；停用後歷史仍可計算', async () => {
    const c = await repo.createCard(cardInput('台新'), TODAY, d)
    await repo.saveCardMonth(c.id, '2026-10', 8000, undefined, d)
    expect(await repo.canDeleteCard(c.id, d)).toBe(false)
    await expect(repo.deleteCard(c.id, d)).rejects.toThrow('只能停用')
    await repo.updateCard(c.id, { endYm: '2026-11' }, TODAY, d)
    const all = await repo.loadAll(d)
    expect(computeMonth('2026-10', all, '2026-11').cards[0]!.raw).toBe(8000)
    expect(computeMonth('2026-11', all, '2026-11').cards).toHaveLength(0)
    expect((await d.sources.where('cardId').equals(c.id).first())!.archived).toBe(true)
  })

  it('沒有任何紀錄的卡可以刪除，連同付款來源', async () => {
    const c = await repo.createCard(cardInput('誤建的卡'), TODAY, d)
    await repo.deleteCard(c.id, d)
    expect(await d.cards.count()).toBe(0)
    expect(await d.sources.count()).toBe(0)
  })

  it('卡費已繳只記日期，重複標記是更新', async () => {
    const c = await repo.createCard({ ...cardInput('台新'), dueDay: 24 }, TODAY, d)
    await repo.markBillPaid(c.id, '2026-10', '2026-10-22', d)
    await repo.markBillPaid(c.id, '2026-10', '2026-10-23', d)
    const bills = await d.cardBills.toArray()
    expect(bills).toHaveLength(1)
    expect(bills[0]!.paidDate).toBe('2026-10-23')
    await expect(repo.setBillDueDate(c.id, '2026-10', '2026-11-01', d)).rejects.toThrow()
  })
})

describe('固定支出每期紀錄', () => {
  it('#9 同一期確認兩次 → 只有一筆（更新）', async () => {
    const t = await repo.createTemplate(tplInput(), null, d)
    const base = { templateId: t.id, periodYm: '2026-10', actualDate: '2026-10-05', amount: 720, sourceId: null, inCardTotal: true, note: '' }
    const a = await repo.confirmOccurrence(base, d)
    const b = await repo.confirmOccurrence({ ...base, amount: 750 }, d)
    expect(b.id).toBe(a.id)
    expect(await d.occurrences.count()).toBe(1)
    expect((await d.occurrences.get(a.id))!.amount).toBe(750)
  })

  it('#13 修改某期的扣款來源只影響那一期', async () => {
    const t1 = await repo.createCard(cardInput('台新'), TODAY, d)
    const t2 = await repo.createCard(cardInput('國泰'), TODAY, d)
    const s1 = await cardSourceId(t1.id)
    const s2 = await cardSourceId(t2.id)
    const t = await repo.createTemplate(tplInput({ defaultSourceId: s1 }), null, d)
    const conf = (periodYm: string, sourceId: string) =>
      repo.confirmOccurrence({ templateId: t.id, periodYm, actualDate: `${periodYm}-05`, amount: 720, sourceId, inCardTotal: true, note: '' }, d)
    await conf('2026-09', s1)
    await conf('2026-10', s1)
    await conf('2026-10', s2)
    const occ = await d.occurrences.orderBy('periodYm').toArray()
    expect(occ.map((o) => [o.periodYm, o.sourceId])).toEqual([
      ['2026-09', s1],
      ['2026-10', s2],
    ])
  })

  it('#14 修改主檔預設金額、預設來源、名稱 → 既有紀錄不變', async () => {
    const bank = await repo.createSource('bank', '銀行', '', d)
    const t = await repo.createTemplate(tplInput({ amountMode: 'fixed', defaultAmount: 5800 }), null, d)
    await repo.confirmOccurrence({ templateId: t.id, periodYm: '2026-10', actualDate: '2026-10-15', amount: 5800, sourceId: null, inCardTotal: true, note: '當期備註' }, d)
    const before = await d.occurrences.toArray()
    await repo.updateTemplate(t.id, { defaultAmount: 6000, defaultSourceId: bank.id, name: '新名稱', note: '長期備註改了' }, undefined, d)
    expect(await d.occurrences.toArray()).toEqual(before)
  })

  it('#15 延後再確認：同一筆紀錄從 deferred 變 confirmed，只計入實際月份', async () => {
    const t = await repo.createTemplate(tplInput({ cycleMonths: 6, anchorYm: '2026-04' }), null, d)
    await repo.markOccurrence(t.id, '2026-10', 'deferred', '延到 11 月', d)
    await repo.confirmOccurrence({ templateId: t.id, periodYm: '2026-10', actualDate: '2026-11-05', amount: 6000, sourceId: null, inCardTotal: true, note: '' }, d)
    expect(await d.occurrences.count()).toBe(1)
    const all = await repo.loadAll(d)
    expect(['2026-10', '2026-11', '2026-12'].map((ym) => computeMonth(ym, all, '2026-11').totals.fixed)).toEqual([0, 6000, 0])
  })

  it('不定期項目：每次確認新增一筆，修改時以 id 更新', async () => {
    const t = await repo.createTemplate(tplInput({ cycleMonths: null }), null, d)
    const base = { templateId: t.id, periodYm: null, actualDate: '2026-10-08', amount: 3200, sourceId: null, inCardTotal: true, note: '' }
    const a = await repo.confirmOccurrence(base, d)
    await repo.confirmOccurrence({ ...base, actualDate: '2026-10-28', amount: 800 }, d)
    expect(await d.occurrences.count()).toBe(2)
    await repo.confirmOccurrence({ ...base, occurrenceId: a.id, amount: 3300 }, d)
    expect(await d.occurrences.count()).toBe(2)
    expect((await d.occurrences.get(a.id))!.amount).toBe(3300)
  })

  it('有紀錄的項目不能刪除', async () => {
    const t = await repo.createTemplate(tplInput(), null, d)
    await repo.markOccurrence(t.id, '2026-10', 'skipped', '', d)
    await expect(repo.deleteTemplate(t.id, d)).rejects.toThrow('只能停用')
  })

  it('驗證：不存在的日期、負數金額、週期與預計月份不一致都拒絕', async () => {
    const t = await repo.createTemplate(tplInput(), null, d)
    const base = { templateId: t.id, periodYm: '2026-02', actualDate: '2026-02-28', amount: 1, sourceId: null, inCardTotal: true, note: '' }
    await expect(repo.confirmOccurrence({ ...base, actualDate: '2026-02-31' }, d)).rejects.toThrow('日期')
    await expect(repo.confirmOccurrence({ ...base, amount: -1 }, d)).rejects.toThrow('金額')
    await expect(repo.confirmOccurrence({ ...base, amount: 1.5 }, d)).rejects.toThrow('金額')
    await expect(repo.confirmOccurrence({ ...base, periodYm: null }, d)).rejects.toThrow('不一致')
    expect(await d.occurrences.count()).toBe(0)
  })
})

describe('歸屬對象與付款來源', () => {
  it('已被保單使用的歸屬對象不能刪除', async () => {
    const dad = await repo.createBeneficiary('爸爸', d)
    await repo.createTemplate(tplInput({ kind: 'insurance' }), { beneficiaryId: dad.id, insurer: '', policyNo: '' }, d)
    await expect(repo.deleteBeneficiary(dad.id, d)).rejects.toThrow('只能停用')
  })

  it('信用卡的付款來源不能單獨修改或刪除；用過的銀行來源不能刪除', async () => {
    const c = await repo.createCard(cardInput('台新'), TODAY, d)
    const sc = await cardSourceId(c.id)
    await expect(repo.updateSource(sc, { name: 'x' }, d)).rejects.toThrow()
    await expect(repo.deleteSource(sc, d)).rejects.toThrow()
    const bank = await repo.createSource('bank', '銀行', '', d)
    await repo.saveExtra({ name: '買東西', amount: 100, date: '2026-10-01', sourceId: bank.id, note: '' }, null, d)
    await expect(repo.deleteSource(bank.id, d)).rejects.toThrow('只能停用')
  })
})

describe('額外消費', () => {
  it('新增、修改（日期換月）、刪除', async () => {
    const e = await repo.saveExtra({ name: '現金購物', amount: 500, date: '2026-10-31', sourceId: null, note: '' }, null, d)
    expect(e.ym).toBe('2026-10')
    const e2 = await repo.saveExtra({ name: '現金購物', amount: 500, date: '2026-11-01', sourceId: null, note: '' }, e.id, d)
    expect(e2.id).toBe(e.id)
    expect(e2.ym).toBe('2026-11')
    expect(await d.extras.count()).toBe(1)
    await repo.deleteExtra(e.id, d)
    expect(await d.extras.count()).toBe(0)
  })

  it('名稱空白、金額非整數拒絕', async () => {
    await expect(repo.saveExtra({ name: '  ', amount: 1, date: '2026-10-01', sourceId: null, note: '' }, null, d)).rejects.toThrow()
    await expect(repo.saveExtra({ name: 'x', amount: 1.2, date: '2026-10-01', sourceId: null, note: '' }, null, d)).rejects.toThrow()
  })
})
