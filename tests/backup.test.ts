/**
 * 規格 #18 備份及還原後資料一致、#19 還原失敗時既有資料不受損。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportAll, restoreAll } from '../src/db/backupDb'
import { HomeExpenseDB } from '../src/db/db'
import * as repo from '../src/db/repo'
import { BACKUP_SCHEMA_VERSION, TABLE_NAMES, validateBackup } from '../src/domain/backup'
import { computeMonth } from '../src/domain/compute'

let d: HomeExpenseDB
let n = 0
const dbs: HomeExpenseDB[] = []
function open(name: string) {
  const x = new HomeExpenseDB(name)
  dbs.push(x)
  return x
}
beforeEach(() => {
  d = open(`t-backup-${++n}`)
})
afterEach(async () => {
  for (const x of dbs.splice(0)) {
    x.close()
    await x.delete()
  }
})

const TODAY = '2026-10-21'

/** 建立 16,700 案例＋保險、備註、卡費紀錄、設定等全部種類的資料。 */
async function seed(x: HomeExpenseDB) {
  const card = (name: string) => repo.createCard({ name, bank: '', tag: '', dueDay: 24, note: `${name}備註\n第二行`, startYm: '2026-01' }, TODAY, x)
  const taishin = await card('台新信用卡')
  const cathay = await card('國泰信用卡')
  const src = async (id: string) => (await x.sources.where('cardId').equals(id).first())!.id
  const sT = await src(taishin.id)
  const sC = await src(cathay.id)
  const bank = await repo.createSource('bank', '銀行轉帳', '', x)
  const dad = await repo.createBeneficiary('爸爸', x)
  const base = { amountMode: 'variable' as const, defaultAmount: null, anchorDay: null, startYm: '2026-01', note: '' }
  const ins1 = await repo.createTemplate({ ...base, name: '保險 1', kind: 'insurance', defaultSourceId: sT, cycleMonths: 6, anchorYm: '2026-04', note: '爸爸的醫療保險\n保費可能調整' }, { beneficiaryId: dad.id, insurer: '富邦', policyNo: 'P-001' }, x)
  const phone = await repo.createTemplate({ ...base, name: '電話費', kind: 'general', defaultSourceId: sT, cycleMonths: 1, anchorYm: '2026-01' }, null, x)
  const ins2 = await repo.createTemplate({ ...base, name: '保險 2', kind: 'insurance', defaultSourceId: sC, cycleMonths: 12, anchorYm: '2026-10' }, { beneficiaryId: null, insurer: '', policyNo: '' }, x)
  const water = await repo.createTemplate({ ...base, name: '水費', kind: 'general', defaultSourceId: bank.id, cycleMonths: 2, anchorYm: '2026-02' }, null, x)
  await repo.saveCardMonth(taishin.id, '2026-10', 8000, '十月備註', x)
  await repo.saveCardMonth(cathay.id, '2026-10', 5000, undefined, x)
  const c = (t: string, date: string, amount: number, s: string, note = '') =>
    repo.confirmOccurrence({ templateId: t, periodYm: '2026-10', actualDate: date, amount, sourceId: s, inCardTotal: true, note }, x)
  await c(ins1.id, '2026-10-15', 2000, sT, '本期保費調整')
  await c(phone.id, '2026-10-05', 720, sT)
  await c(ins2.id, '2026-10-20', 1000, sC)
  await c(water.id, '2026-10-12', 700, bank.id)
  await repo.markOccurrence(phone.id, '2026-09', 'deferred', '延後', x)
  await repo.saveExtra({ name: '額外銀行轉帳購物', amount: 3000, date: '2026-10-21', sourceId: bank.id, note: '家電' }, null, x)
  await repo.saveMonthNote('2026-10', '十月整體備註', x)
  await repo.markBillPaid(taishin.id, '2026-10', '2026-10-20', x)
  await repo.setSetting('reminderDaysBefore', 7, x)
}

async function dump(x: HomeExpenseDB) {
  const out: Record<string, unknown[]> = {}
  // 依主鍵排序（物件欄位順序不影響 toEqual 的深度比較）
  const pk = (r: Record<string, unknown>) => String(r.id ?? r.templateId ?? r.ym ?? r.key)
  for (const t of TABLE_NAMES) out[t] = (await x.table(t).toArray()).sort((a, b) => pk(a).localeCompare(pk(b)))
  return out
}

describe('#18 備份及還原後資料一致', () => {
  it('匯出 → 真的 JSON 序列化與解析 → 驗證 → 還原到另一個資料庫：每張表逐筆完全相同，16,700 仍成立', async () => {
    await seed(d)
    const backup = await exportAll(d)
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    const text = JSON.stringify(backup)
    const v = validateBackup(text)
    if (!v.ok) throw new Error(v.errors.join('\n'))
    expect(v.counts.cards).toBe(2)
    expect(v.counts.occurrences).toBe(5)

    const other = open(`t-backup-target-${n}`)
    await repo.createCard({ name: '會被取代的卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-01' }, TODAY, other)
    await restoreAll(v.backup, other)
    expect(await dump(other)).toEqual(await dump(d))
    const r = computeMonth('2026-10', await repo.loadAll(other), '2026-10')
    expect(r.totals.total).toBe(16700)
    expect((await other.monthNotes.get('2026-10'))?.note).toBe('十月整體備註')
    expect((await other.templates.toArray()).find((t) => t.name === '保險 1')!.note).toBe('爸爸的醫療保險\n保費可能調整')
  })

  it('空資料庫也能備份與還原', async () => {
    const v = validateBackup(JSON.stringify(await exportAll(d)))
    expect(v.ok).toBe(true)
  })
})

describe('#19 還原失敗時既有資料不受損', () => {
  async function expectRejectedAndIntact(mutate: (j: any) => void, expectMsg: RegExp) {
    await seed(d)
    const before = await dump(d)
    const j = JSON.parse(JSON.stringify(await exportAll(d)))
    mutate(j)
    const v = validateBackup(JSON.stringify(j))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors.join('\n')).toMatch(expectMsg)
    expect(await dump(d)).toEqual(before)
  }

  it('不是 JSON', async () => {
    await seed(d)
    const before = await dump(d)
    const v = validateBackup('{ not json')
    expect(v.ok).toBe(false)
    expect(await dump(d)).toEqual(before)
  })
  it('別的 App 的檔案', () => expectRejectedAndIntact((j) => (j.app = 'other'), /不是本 App/))
  it('版本比 App 新', () => expectRejectedAndIntact((j) => (j.schemaVersion = 99), /版本/))
  it('缺少整張表', () => expectRejectedAndIntact((j) => delete j.data.occurrences, /缺少「每期繳費紀錄」/))
  it('欄位型別錯誤（金額是小數）', () => expectRejectedAndIntact((j) => (j.data.extras[0].amount = 12.5), /額外消費/))
  it('不存在的日期', () => expectRejectedAndIntact((j) => (j.data.extras[0].date = '2026-02-31'), /日期/))
  it('關聯斷裂：月總額指向不存在的卡', () => expectRejectedAndIntact((j) => (j.data.cardMonths[0].cardId = 'ghost'), /不存在的信用卡/))
  it('關聯斷裂：繳費紀錄的扣款來源不存在', () => expectRejectedAndIntact((j) => (j.data.occurrences[0].sourceId = 'ghost'), /扣款來源不存在/))
  it('唯一性：同一期繳費紀錄重複', () =>
    expectRejectedAndIntact((j) => j.data.occurrences.push({ ...j.data.occurrences[0], id: 'dup' }), /同一期繳費紀錄重複/))
  it('已確認紀錄缺金額', () =>
    expectRejectedAndIntact((j) => {
      const o = j.data.occurrences.find((x: any) => x.status === 'confirmed')
      o.amount = null
    }, /缺少日期或金額/))

  it('驗證通過但寫入途中失敗（模擬）：交易回滾，原資料完整保留', async () => {
    await seed(d)
    const before = await dump(d)
    const other = open(`t-backup-src-${n}`)
    await repo.createCard({ name: '備份裡的卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-01' }, TODAY, other)
    const backup = await exportAll(other)
    const spy = vi.spyOn(d.table('sources'), 'bulkAdd').mockRejectedValueOnce(new Error('模擬寫入失敗'))
    await expect(restoreAll(backup, d)).rejects.toThrow('模擬寫入失敗')
    spy.mockRestore()
    expect(await dump(d)).toEqual(before)
  })
})
