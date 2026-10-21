/**
 * 開發用示範資料，只寫入 `${DB_NAME}-demo`（見 db.ts 的 IS_DEMO），不會碰正式資料庫。
 * 內容：規格 4.3 的 2026 年 10 月 16,700 案例，加上待確認、未到期、長保單名稱、多筆項目。
 */
import { db } from './db'
import * as repo from './repo'

let seeding: Promise<void> | null = null

/** React StrictMode 會執行兩次 effect；用同一個 Promise 確保只建立一次。 */
export function seedDemo(today: string): Promise<void> {
  seeding ??= doSeed(today)
  return seeding
}

async function doSeed(today: string) {
  if ((await db.cards.count()) > 0) return
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
