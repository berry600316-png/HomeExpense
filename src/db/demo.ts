/**
 * 開發用示範資料，只寫入 `${DB_NAME}-demo`（見 db.ts 的 IS_DEMO），不會碰正式資料庫。
 * 內容：規格 4.3 的 2026 年 10 月 16,700 案例，加上待確認、未到期、長保單名稱、多筆項目。
 */
import { db, IS_STRESS } from './db'
import * as repo from './repo'

let seeding: Promise<void> | null = null

/** React StrictMode 會執行兩次 effect；用同一個 Promise 確保只建立一次。 */
export function seedDemo(today: string): Promise<void> {
  seeding ??= doSeed(today)
  return seeding
}

async function doSeed(today: string) {
  if ((await db.cards.count()) > 0) return
  if (IS_STRESS) return seedStress(today)
  const taishin = await repo.createCard({ name: '台新信用卡', bank: '台新銀行', tag: '1234', dueDay: 24, note: '', startYm: '2026-04' }, today, db)
  const cathay = await repo.createCard({ name: '國泰信用卡', bank: '國泰世華', tag: '', dueDay: 2, note: '', startYm: '2026-04' }, today, db)
  const src = async (cardId: string) => (await db.sources.where('cardId').equals(cardId).first())!.id
  const sT = await src(taishin.id)
  const sC = await src(cathay.id)
  const bank = await repo.createSource('bank', '銀行轉帳', '', db)
  await repo.createSource('cash', '現金', '', db)
  const dad = await repo.createBeneficiary('爸爸', db)
  const mom = await repo.createBeneficiary('媽媽', db)
  const me = await repo.createBeneficiary('自己', db)

  const base = { amountMode: 'fixed' as const, anchorDay: 15, startYm: '2026-04', note: '' }
  const ins1 = await repo.createTemplate(
    { ...base, name: '保險 1', kind: 'insurance', defaultSourceId: sT, defaultAmount: 2000, cycleMonths: 6, anchorYm: '2026-04' },
    { beneficiaryId: dad.id, insurer: '富邦人壽', policyNo: '' },
    db,
  )
  const phone = await repo.createTemplate(
    { ...base, name: '電話費', kind: 'general', defaultSourceId: sT, amountMode: 'variable', defaultAmount: 720, cycleMonths: 1, anchorYm: '2026-04', anchorDay: 5 },
    null,
    db,
  )
  const ins2 = await repo.createTemplate(
    { ...base, name: '保險 2', kind: 'insurance', defaultSourceId: sC, defaultAmount: 1000, cycleMonths: 12, anchorYm: '2026-10', anchorDay: 20 },
    { beneficiaryId: mom.id, insurer: '國泰人壽', policyNo: '' },
    db,
  )
  const water = await repo.createTemplate(
    { ...base, name: '水費', kind: 'general', defaultSourceId: bank.id, amountMode: 'variable', defaultAmount: 700, cycleMonths: 2, anchorYm: '2026-04', anchorDay: 12 },
    null,
    db,
  )
  await repo.createTemplate(
    { ...base, name: '電費', kind: 'general', defaultSourceId: bank.id, amountMode: 'variable', defaultAmount: 1200, cycleMonths: 2, anchorYm: '2026-04', anchorDay: 18 },
    null,
    db,
  )
  await repo.createTemplate(
    { ...base, name: '國泰真心相守長期照顧終身保險', kind: 'insurance', defaultSourceId: sC, defaultAmount: 8600, cycleMonths: 12, anchorYm: '2026-05' },
    { beneficiaryId: me.id, insurer: '國泰人壽', policyNo: 'A123456789' },
    db,
  )
  await repo.createTemplate(
    { ...base, name: '管理費', kind: 'general', defaultSourceId: bank.id, defaultAmount: 3000, cycleMonths: 3, anchorYm: '2026-06' },
    null,
    db,
  )

  await repo.saveCardMonth(taishin.id, '2026-10', 8000, undefined, db)
  await repo.saveCardMonth(cathay.id, '2026-10', 5000, undefined, db)
  await repo.saveCardMonth(taishin.id, '2026-09', 6400, undefined, db)
  await repo.saveCardMonth(cathay.id, '2026-09', 0, undefined, db)
  const c = (templateId: string, periodYm: string, actualDate: string, amount: number, sourceId: string) =>
    repo.confirmOccurrence({ templateId, periodYm, actualDate, amount, sourceId, inCardTotal: true, note: '' }, db)
  await c(ins1.id, '2026-10', '2026-10-15', 2000, sT)
  await c(phone.id, '2026-10', '2026-10-05', 720, sT)
  await c(ins2.id, '2026-10', '2026-10-20', 1000, sC)
  await c(water.id, '2026-10', '2026-10-12', 700, bank.id)
  await c(phone.id, '2026-09', '2026-09-05', 699, sT)
  await repo.saveExtra({ name: '銀行轉帳購物', amount: 3000, date: '2026-10-21', sourceId: bank.id, note: '購買家用電器' }, null, db)
}

/** 版面壓力測試：14 筆固定支出、12 筆額外消費、超長名稱、九位數金額、扣除大於總額的異常卡。 */
async function seedStress(today: string) {
  const big = await repo.createCard({ name: '超長名稱的聯名信用卡（白金無限卡・海外回饋）', bank: '', tag: '', dueDay: 15, note: '', startYm: '2026-01' }, today, db)
  const small = await repo.createCard({ name: '國泰', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-01' }, today, db)
  await repo.createCard({ name: '尚未輸入的卡', bank: '', tag: '', dueDay: null, note: '', startYm: '2026-01' }, today, db)
  const sBig = (await db.sources.where('cardId').equals(big.id).first())!.id
  const sSmall = (await db.sources.where('cardId').equals(small.id).first())!.id
  const bank = await repo.createSource('bank', '銀行轉帳', '', db)
  const dad = await repo.createBeneficiary('爸爸', db)
  await repo.saveCardMonth(big.id, '2026-10', 123456789, undefined, db)
  await repo.saveCardMonth(small.id, '2026-10', 500, undefined, db)
  for (let i = 1; i <= 14; i++) {
    const long = i % 4 === 0
    const t = await repo.createTemplate(
      {
        name: long ? `第${i}張・新光人壽美滿人生終身壽險附加住院醫療日額給付附約` : `固定項目 ${i}`,
        kind: long ? 'insurance' : 'general',
        defaultSourceId: i === 2 ? sSmall : i % 3 === 0 ? bank.id : sBig,
        amountMode: 'fixed',
        defaultAmount: i * 1111,
        cycleMonths: i % 5 === 0 ? 6 : 1,
        anchorYm: '2026-04',
        anchorDay: 10,
        startYm: '2026-01',
        note: '',
      },
      long ? { beneficiaryId: dad.id, insurer: '新光人壽', policyNo: '' } : null,
      db,
    )
    if (i <= 9)
      await repo.confirmOccurrence(
        { templateId: t.id, periodYm: '2026-10', actualDate: '2026-10-10', amount: i === 1 ? 98765432 : i * 1111, sourceId: t.defaultSourceId, inCardTotal: true, note: '' },
        db,
      )
  }
  for (let i = 1; i <= 12; i++)
    await repo.saveExtra(
      { name: i === 3 ? '非常非常長的額外消費名稱用來測試換行是否會擠壓金額欄位' : `額外消費 ${i}`, amount: i === 5 ? 999999999 : i * 321, date: `2026-10-${String(i + 1).padStart(2, '0')}`, sourceId: null, note: '' },
      null,
      db,
    )
}
