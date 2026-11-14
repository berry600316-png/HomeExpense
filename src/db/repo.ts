/**
 * 資料存取層。所有寫入都在這裡驗證，UI 不直接寫資料表。
 * 原則：
 * - 實際紀錄（月總額、每期扣款、額外消費）與模板分開，修改模板不回頭改紀錄。
 * - 唯一鍵衝突一律「更新既有」，不新增第二筆。
 * - 有歷史紀錄的主檔只能停用，不能刪除（L-050）。
 */
import type { MonthInput } from '../domain/compute'
import { isValidAmount } from '../domain/money'
import { isDueMonth } from '../domain/schedule'
import {
  DEFAULT_REMINDER_DAYS,
  isValidRemindDays,
  MAX_REMINDER_DAYS,
  SETTING_KEYS,
  type Beneficiary,
  type CardBill,
  type CardMonth,
  type CreditCard,
  type ExtraExpense,
  type FixedTemplate,
  type ID,
  type InsuranceInfo,
  type Occurrence,
  type PaymentSource,
  type SourceKind,
  type YM,
  type YMD,
} from '../domain/types'
import { addMonths, isActiveIn, isValidYm, isValidYmd, todayYmd, ymOf } from '../domain/ym'
import { db as defaultDb, newId, type HomeExpenseDB } from './db'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function must(cond: unknown, message: string): asserts cond {
  if (!cond) throw new ValidationError(message)
}

function cleanText(s: string | undefined | null): string {
  return (s ?? '').replace(/\r\n?/g, '\n')
}

function cleanName(s: string, label: string): string {
  const v = s.trim()
  must(v.length > 0, `請輸入${label}`)
  must(v.length <= 80, `${label}最多 80 字`)
  return v
}

function checkDay(d: number | null, label: string) {
  must(d === null || (Number.isInteger(d) && d >= 1 && d <= 31), `${label}需為 1–31`)
}

function checkToday(today: YMD) {
  must(isValidYmd(today), '今天的日期格式錯誤')
}

function checkOrder(order: number | undefined) {
  must(order === undefined || Number.isSafeInteger(order), '排序值需為整數')
}

function checkRange(startYm: YM, endYm: YM | null) {
  must(isValidYm(startYm), '起始月份格式錯誤')
  must(endYm === null || isValidYm(endYm), '停用月份格式錯誤')
  must(endYm === null || endYm > startYm, '停用月份必須晚於起始月份')
}

async function nextOrder(table: { orderBy(k: string): { last(): Promise<{ order: number } | undefined> } }) {
  const last = await table.orderBy('order').last()
  return (last?.order ?? 0) + 1
}

// ───────────────────────── 讀取 ─────────────────────────

/** 一次載入計算所需全部資料。個人資料量小（每月數十筆），全量載入最單純也最不易出錯。 */
export async function loadAll(d: HomeExpenseDB = defaultDb): Promise<MonthInput> {
  const [cards, cardMonths, sources, templates, occurrences, extras] = await Promise.all([
    d.cards.toArray(),
    d.cardMonths.toArray(),
    d.sources.toArray(),
    d.templates.toArray(),
    d.occurrences.toArray(),
    d.extras.toArray(),
  ])
  return { cards, cardMonths, sources, templates, occurrences, extras }
}

export async function getSetting<T>(key: string, fallback: T, d: HomeExpenseDB = defaultDb): Promise<T> {
  const row = await d.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown, d: HomeExpenseDB = defaultDb) {
  if (key === SETTING_KEYS.lastBackupAt)
    must(typeof value === 'number' && Number.isFinite(value) && value > 0, '備份時間格式錯誤')
  else must(false, `未知的設定項目：${key}`)
  await d.settings.put({ key, value })
}

// ───────────────────────── 信用卡 ─────────────────────────

export interface CardInput {
  name: string
  bank: string
  tag: string
  dueDay: number | null
  /** 截止前幾天開始提醒；新增時省略 = 預設 5 天。 */
  remindDays?: number
  note: string
  startYm: YM
}

function checkRemindDays(n: number | undefined) {
  must(n === undefined || isValidRemindDays(n), `提前提醒天數需為 0–${MAX_REMINDER_DAYS} 的整數`)
}

/** 新增信用卡，同時建立一對一的付款來源。 */
export async function createCard(input: CardInput, today: YMD, d: HomeExpenseDB = defaultDb): Promise<CreditCard> {
  const name = cleanName(input.name, '卡片名稱')
  checkDay(input.dueDay, '繳款截止日')
  checkRemindDays(input.remindDays)
  checkRange(input.startYm, null)
  checkToday(today)
  const now = Date.now()
  return d.transaction('rw', d.cards, d.sources, async () => {
    const card: CreditCard = {
      id: newId(),
      name,
      bank: input.bank.trim(),
      tag: input.tag.trim(),
      order: await nextOrder(d.cards),
      dueDay: input.dueDay,
      dueFrom: input.dueDay === null ? null : today,
      remindDays: input.remindDays ?? DEFAULT_REMINDER_DAYS,
      note: cleanText(input.note),
      startYm: input.startYm,
      endYm: null,
      createdAt: now,
      updatedAt: now,
    }
    await d.cards.add(card)
    await d.sources.add({
      id: newId(),
      kind: 'card',
      cardId: card.id,
      name: card.name,
      order: await nextOrder(d.sources),
      archived: false,
      note: '',
    })
    return card
  })
}

export async function updateCard(
  id: ID,
  patch: Partial<CardInput> & { endYm?: YM | null; order?: number },
  today: YMD,
  d: HomeExpenseDB = defaultDb,
): Promise<void> {
  checkToday(today)
  checkOrder(patch.order)
  checkRemindDays(patch.remindDays)
  await d.transaction('rw', d.cards, d.sources, async () => {
    const card = await d.cards.get(id)
    must(card, '找不到這張卡')
    const next: CreditCard = { ...card, updatedAt: Date.now() }
    if (patch.name !== undefined) next.name = cleanName(patch.name, '卡片名稱')
    if (patch.bank !== undefined) next.bank = patch.bank.trim()
    if (patch.tag !== undefined) next.tag = patch.tag.trim()
    if (patch.note !== undefined) next.note = cleanText(patch.note)
    if (patch.order !== undefined) next.order = patch.order
    if (patch.remindDays !== undefined) next.remindDays = patch.remindDays
    if (patch.startYm !== undefined) next.startYm = patch.startYm
    if (patch.endYm !== undefined) next.endYm = patch.endYm
    if (patch.dueDay !== undefined && patch.dueDay !== card.dueDay) {
      checkDay(patch.dueDay, '繳款截止日')
      next.dueDay = patch.dueDay
      // 變更截止日：從今天起算，不追溯舊月份的提醒
      next.dueFrom = patch.dueDay === null ? null : today
    }
    checkRange(next.startYm, next.endYm)
    await d.cards.put(next)
    const src = await d.sources.where('cardId').equals(id).first()
    if (src) await d.sources.update(src.id, { name: next.name, archived: next.endYm !== null })
  })
}

/**
 * 對調兩張卡的顯示順序（首頁、分享圖片、信用卡管理、扣款下拉選單依此排序；卡費提醒依截止日排序，不受影響）。
 * 單一交易：任何一步失敗，兩張卡都維持原本的順序，不會留下兩張同順位的卡。
 */
export async function swapCardOrder(aId: ID, bId: ID, d: HomeExpenseDB = defaultDb): Promise<void> {
  must(aId !== bId, '不能和自己對調')
  await d.transaction('rw', d.cards, async () => {
    const a = await d.cards.get(aId)
    const b = await d.cards.get(bId)
    must(a && b, '找不到這張卡')
    const now = Date.now()
    await d.cards.update(a.id, { order: b.order, updatedAt: now })
    await d.cards.update(b.id, { order: a.order, updatedAt: now })
  })
}

/**
 * 對調兩個「銀行／現金／其他」扣款來源的順序（扣款下拉選單依此排列）。
 * 信用卡來源不在這裡調：信用卡的順序一律以卡片本身的 order 為準，用 swapCardOrder。
 * 單一交易：任何一步失敗，兩筆都維持原本的順序。
 */
export async function swapSourceOrder(aId: ID, bId: ID, d: HomeExpenseDB = defaultDb): Promise<void> {
  must(aId !== bId, '不能和自己對調')
  await d.transaction('rw', d.sources, async () => {
    const a = await d.sources.get(aId)
    const b = await d.sources.get(bId)
    must(a && b, '找不到這個扣款來源')
    must(a.kind !== 'card' && b.kind !== 'card', '信用卡的順序請用卡片順序調整')
    await d.sources.update(a.id, { order: b.order })
    await d.sources.update(b.id, { order: a.order })
  })
}

/** 輸入／修改某張卡某月的原始總額。null = 清除金額（回到未輸入）。同一張卡同一月份永遠只有一筆。 */
export async function saveCardMonth(
  cardId: ID,
  ym: YM,
  amount: number | null,
  note: string | undefined,
  d: HomeExpenseDB = defaultDb,
): Promise<void> {
  must(isValidYm(ym), '月份格式錯誤')
  must(amount === null || isValidAmount(amount, { allowNegative: true }), '金額需為整數')
  await d.transaction('rw', d.cardMonths, d.cards, async () => {
    must(await d.cards.get(cardId), '找不到這張卡')
    const existing = await d.cardMonths.where('[cardId+ym]').equals([cardId, ym]).first()
    const nextNote = note === undefined ? (existing?.note ?? '') : cleanText(note)
    if (existing) {
      if (amount === null && nextNote === '') await d.cardMonths.delete(existing.id)
      else await d.cardMonths.update(existing.id, { amount, note: nextNote, updatedAt: Date.now() })
    } else if (amount !== null || nextNote !== '') {
      const row: CardMonth = { id: newId(), cardId, ym, amount, note: nextNote, updatedAt: Date.now() }
      await d.cardMonths.add(row)
    }
  })
}

/** 卡片只有在完全沒有月份紀錄、扣款紀錄、繳款紀錄時才可永久刪除；否則只能停用。 */
export async function canDeleteCard(id: ID, d: HomeExpenseDB = defaultDb): Promise<boolean> {
  const src = await d.sources.where('cardId').equals(id).first()
  const [months, bills, occ, ext, tpl] = await Promise.all([
    d.cardMonths.where('cardId').equals(id).count(),
    d.cardBills.where('cardId').equals(id).count(),
    src ? d.occurrences.filter((o) => o.sourceId === src.id).count() : 0,
    src ? d.extras.filter((e) => e.sourceId === src.id).count() : 0,
    src ? d.templates.filter((t) => t.defaultSourceId === src.id).count() : 0,
  ])
  return months + bills + occ + ext + tpl === 0
}

export async function deleteCard(id: ID, d: HomeExpenseDB = defaultDb): Promise<void> {
  await d.transaction('rw', [d.cards, d.sources, d.cardMonths, d.cardBills, d.occurrences, d.extras, d.templates], async () => {
    must(await canDeleteCard(id, d), '這張卡已有紀錄，只能停用，不能刪除')
    await d.sources.where('cardId').equals(id).delete()
    await d.cards.delete(id)
  })
}

// ───────────────────────── 卡費繳款 ─────────────────────────

async function upsertBill(cardId: ID, dueYm: YM, patch: Partial<CardBill>, d: HomeExpenseDB) {
  must(isValidYm(dueYm), '月份格式錯誤')
  await d.transaction('rw', d.cardBills, d.cards, async () => {
    must(await d.cards.get(cardId), '找不到這張卡')
    const existing = await d.cardBills.where('[cardId+dueYm]').equals([cardId, dueYm]).first()
    if (existing) await d.cardBills.update(existing.id, { ...patch, updatedAt: Date.now() })
    else
      await d.cardBills.add({
        id: newId(),
        cardId,
        dueYm,
        dueDateOverride: null,
        paidDate: null,
        updatedAt: Date.now(),
        ...patch,
      })
  })
}

export async function markBillPaid(cardId: ID, dueYm: YM, paidDate: YMD | null, d: HomeExpenseDB = defaultDb) {
  must(paidDate === null || isValidYmd(paidDate), '日期格式錯誤')
  must(paidDate === null || paidDate <= todayYmd(), '已繳日期不能晚於今天')
  await upsertBill(cardId, dueYm, { paidDate, noBill: false }, d)
}

export async function markBillNoPayment(cardId: ID, dueYm: YM, noBill: boolean, d: HomeExpenseDB = defaultDb) {
  await upsertBill(cardId, dueYm, { noBill, paidDate: null }, d)
}

export async function setBillDueDate(cardId: ID, dueYm: YM, dueDate: YMD | null, d: HomeExpenseDB = defaultDb) {
  must(dueDate === null || (isValidYmd(dueDate) && ymOf(dueDate) === dueYm), '截止日必須在該月份內')
  await upsertBill(cardId, dueYm, { dueDateOverride: dueDate }, d)
}

// ───────────────────────── 付款來源 ─────────────────────────

export async function createSource(
  kind: Exclude<SourceKind, 'card'>,
  name: string,
  note = '',
  d: HomeExpenseDB = defaultDb,
): Promise<PaymentSource> {
  const s: PaymentSource = {
    id: newId(),
    kind,
    cardId: null,
    name: cleanName(name, '名稱'),
    order: await nextOrder(d.sources),
    archived: false,
    note: cleanText(note),
  }
  await d.sources.add(s)
  return s
}

export async function updateSource(
  id: ID,
  patch: { name?: string; note?: string; archived?: boolean; kind?: Exclude<SourceKind, 'card'> },
  d: HomeExpenseDB = defaultDb,
) {
  const s = await d.sources.get(id)
  must(s, '找不到付款來源')
  must(s.kind !== 'card', '信用卡的付款來源請到信用卡管理修改')
  await d.sources.update(id, {
    ...(patch.name !== undefined ? { name: cleanName(patch.name, '名稱') } : {}),
    ...(patch.note !== undefined ? { note: cleanText(patch.note) } : {}),
    ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
  })
}

export async function isSourceUsed(id: ID, d: HomeExpenseDB = defaultDb): Promise<boolean> {
  const [o, e, t] = await Promise.all([
    d.occurrences.filter((x) => x.sourceId === id).count(),
    d.extras.filter((x) => x.sourceId === id).count(),
    d.templates.filter((x) => x.defaultSourceId === id).count(),
  ])
  return o + e + t > 0
}

export async function deleteSource(id: ID, d: HomeExpenseDB = defaultDb) {
  await d.transaction('rw', [d.sources, d.occurrences, d.extras, d.templates], async () => {
    const s = await d.sources.get(id)
    must(s, '找不到付款來源')
    must(s.kind !== 'card', '信用卡的付款來源不能單獨刪除')
    must(!(await isSourceUsed(id, d)), '這個付款來源已有紀錄，只能停用')
    await d.sources.delete(id)
  })
}

// ───────────────────────── 歸屬對象 ─────────────────────────

export async function createBeneficiary(name: string, d: HomeExpenseDB = defaultDb): Promise<Beneficiary> {
  const b: Beneficiary = { id: newId(), name: cleanName(name, '名稱'), order: await nextOrder(d.beneficiaries), archived: false }
  await d.beneficiaries.add(b)
  return b
}

export async function updateBeneficiary(id: ID, patch: { name?: string; archived?: boolean }, d: HomeExpenseDB = defaultDb) {
  must(await d.beneficiaries.get(id), '找不到歸屬對象')
  await d.beneficiaries.update(id, {
    ...(patch.name !== undefined ? { name: cleanName(patch.name, '名稱') } : {}),
    ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
  })
}

export async function deleteBeneficiary(id: ID, d: HomeExpenseDB = defaultDb) {
  await d.transaction('rw', d.beneficiaries, d.insurance, async () => {
    const used = await d.insurance.where('beneficiaryId').equals(id).count()
    must(used === 0, '已有保單屬於這位歸屬對象，只能停用')
    await d.beneficiaries.delete(id)
  })
}

// ───────────────────────── 固定支出模板 ─────────────────────────

export interface TemplateInput {
  name: string
  kind: FixedTemplate['kind']
  defaultSourceId: ID | null
  amountMode: FixedTemplate['amountMode']
  defaultAmount: number | null
  cycleMonths: number | null
  anchorYm: YM
  anchorDay: number | null
  startYm: YM
  note: string
}

export type InsuranceInput = Omit<InsuranceInfo, 'templateId'>

function validateTemplate(t: TemplateInput) {
  cleanName(t.name, '名稱')
  must(t.defaultAmount === null || isValidAmount(t.defaultAmount), '預設金額需為 0 以上的整數')
  must(t.amountMode !== 'fixed' || t.defaultAmount !== null, '固定金額模式需要預設金額')
  must(t.cycleMonths === null || (Number.isInteger(t.cycleMonths) && t.cycleMonths >= 1 && t.cycleMonths <= 120), '週期需為 1–120 個月')
  must(isValidYm(t.anchorYm), '週期基準月份格式錯誤')
  checkDay(t.anchorDay, '預計扣款日')
  checkRange(t.startYm, null)
}

export async function createTemplate(
  input: TemplateInput,
  insurance: InsuranceInput | null,
  d: HomeExpenseDB = defaultDb,
): Promise<FixedTemplate> {
  validateTemplate(input)
  must(input.kind !== 'insurance' || insurance !== null, '保險需要保單資料')
  const now = Date.now()
  return d.transaction('rw', d.templates, d.insurance, d.sources, d.beneficiaries, async () => {
    if (input.defaultSourceId) must(await d.sources.get(input.defaultSourceId), '找不到預設扣款來源')
    if (insurance?.beneficiaryId) must(await d.beneficiaries.get(insurance.beneficiaryId), '找不到歸屬對象')
    const t: FixedTemplate = {
      ...input,
      id: newId(),
      name: input.name.trim(),
      note: cleanText(input.note),
      endYm: null,
      order: await nextOrder(d.templates),
      createdAt: now,
      updatedAt: now,
    }
    await d.templates.add(t)
    if (input.kind === 'insurance' && insurance)
      await d.insurance.put({
        templateId: t.id,
        beneficiaryId: insurance.beneficiaryId,
        insurer: insurance.insurer.trim(),
        policyNo: insurance.policyNo.trim(),
      })
    return t
  })
}

/** 修改模板只影響「之後尚未處理的期數」的預填值；已存在的 Occurrence 一律不動。 */
export async function updateTemplate(
  id: ID,
  patch: Partial<TemplateInput> & { endYm?: YM | null; order?: number },
  insurance: InsuranceInput | null | undefined,
  d: HomeExpenseDB = defaultDb,
): Promise<void> {
  checkOrder(patch.order)
  await d.transaction('rw', d.templates, d.insurance, d.sources, d.beneficiaries, d.occurrences, async () => {
    const t = await d.templates.get(id)
    must(t, '找不到這個項目')
    const next: FixedTemplate = { ...t, ...patch, updatedAt: Date.now() }
    if (patch.name !== undefined) next.name = patch.name.trim()
    if (patch.note !== undefined) next.note = cleanText(patch.note)
    validateTemplate(next)
    checkRange(next.startYm, next.endYm)
    if (next.defaultSourceId) must(await d.sources.get(next.defaultSourceId), '找不到預設扣款來源')
    // 修改預設值之前保存舊月份快照，避免歷史月份跟著新金額／來源重算。
    const oldSource = t.defaultSourceId ? await d.sources.get(t.defaultSourceId) : undefined
    if (t.cycleMonths !== null || next.cycleMonths !== null) {
      const lastYm = ymOf(todayYmd())
      const oldRows = await d.occurrences.where('templateId').equals(id).toArray()
      const existing = new Set(oldRows.map((o) => o.periodKey))
      for (const o of oldRows) {
        if (o.periodYm === null || o.baseline || o.status === 'not-due' || o.status === 'hidden' || !isDueMonth(t, o.periodYm)) continue
        const automatic = t.amountMode === 'fixed' && t.defaultAmount !== null && oldSource?.kind === 'card'
        await d.occurrences.update(o.id, { baseline: {
          status: automatic ? 'confirmed' : 'pending', amount: t.defaultAmount,
          sourceId: t.defaultSourceId, backfilled: automatic && o.periodYm < lastYm,
        } })
      }
      const firstYm = t.startYm < next.startYm ? t.startYm : next.startYm
      for (let period = firstYm, n = 0; period <= lastYm && n < 1200; period = addMonths(period, 1), n++) {
        if (existing.has(period)) continue
        const now = Date.now()
        const due = isDueMonth(t, period)
        const automatic = due && t.amountMode === 'fixed' && t.defaultAmount !== null && oldSource?.kind === 'card'
        const baseline = due ? {
          status: automatic ? 'confirmed' as const : 'pending' as const, amount: t.defaultAmount,
          sourceId: t.defaultSourceId, backfilled: automatic && period < lastYm,
        } : undefined
        await d.occurrences.add({
          id: newId(), templateId: id, periodKey: period, periodYm: period,
          status: !due ? isActiveIn(t, period) ? 'not-due' : 'hidden' : automatic ? 'confirmed' : 'pending',
          actualDate: null, actualYm: automatic ? period : null, amount: due ? t.defaultAmount : null,
          sourceId: due ? t.defaultSourceId : null, baseline,
          inCardTotal: true, automatic, backfilled: automatic && period < lastYm,
          note: '', createdAt: now, updatedAt: now,
        })
      }
    }
    await d.templates.put(next)
    if (insurance !== undefined) {
      if (next.kind === 'insurance' && insurance) {
        if (insurance.beneficiaryId) must(await d.beneficiaries.get(insurance.beneficiaryId), '找不到歸屬對象')
        await d.insurance.put({
          templateId: id,
          beneficiaryId: insurance.beneficiaryId,
          insurer: insurance.insurer.trim(),
          policyNo: insurance.policyNo.trim(),
        })
      } else if (next.kind !== 'insurance') {
        await d.insurance.delete(id)
      }
    }
  })
}

export async function deleteTemplate(id: ID, d: HomeExpenseDB = defaultDb) {
  await d.transaction('rw', d.templates, d.insurance, d.occurrences, d.sources, async () => {
    const rows = await d.occurrences.where('templateId').equals(id).toArray()
    must(!rows.some((o) => o.status === 'confirmed' || o.status === 'skipped' || o.status === 'deferred'), '這個項目已有繳費紀錄，只能停用，不能刪除')
    const t = await d.templates.get(id)
    const source = t?.defaultSourceId ? await d.sources.get(t.defaultSourceId) : undefined
    if (t && source?.kind === 'card' && t.amountMode === 'fixed' && t.cycleMonths !== null) {
      for (let period = t.startYm, count = 0; period <= ymOf(todayYmd()) && count < 1200; period = addMonths(period, 1), count++)
        must(!isDueMonth(t, period), '這個項目已有自動列入的月份，只能停用，不能刪除')
    }
    if (rows.length) await d.occurrences.bulkDelete(rows.map((o) => o.id))
    await d.insurance.delete(id)
    await d.templates.delete(id)
  })
}

// ───────────────────────── 每期實際扣款 ─────────────────────────

export interface ConfirmInput {
  templateId: ID
  /** 週期性項目：預計年月；不定期項目：null。 */
  periodYm: YM | null
  /** 修改既有不定期紀錄時傳入其 id。 */
  occurrenceId?: ID
  actualDate: YMD | null
  /** 不定期信用卡項目使用目前查看的月份。 */
  recordYm?: YM
  amount: number
  sourceId: ID | null
  inCardTotal: boolean
  note: string
}

/**
 * 確認一期扣款。週期性項目以 [templateId+periodKey] 為唯一鍵：同一期再確認一次是「更新」，不會新增第二筆。
 * 信用卡依期別月份計入，不要求刷卡日期；銀行／現金依實際付款日計入。
 */
export async function confirmOccurrence(input: ConfirmInput, d: HomeExpenseDB = defaultDb): Promise<Occurrence> {
  must(input.actualDate === null || isValidYmd(input.actualDate), '實際扣款日期格式錯誤')
  must(input.recordYm === undefined || isValidYm(input.recordYm), '記帳月份格式錯誤')
  must(isValidAmount(input.amount), '金額需為 0 以上的整數')
  must(input.periodYm === null || isValidYm(input.periodYm), '預計月份格式錯誤')
  must(typeof input.inCardTotal === 'boolean', '「包含在卡片總額」格式錯誤')
  return d.transaction('rw', d.occurrences, d.templates, d.sources, async () => {
    const t = await d.templates.get(input.templateId)
    must(t, '找不到這個項目')
    must((t.cycleMonths === null) === (input.periodYm === null), '週期設定與預計月份不一致')
    const source = input.sourceId ? await d.sources.get(input.sourceId) : undefined
    if (input.sourceId) must(source, '找不到扣款來源')
    if (source?.kind !== 'card') must(input.actualDate !== null, '請選擇實際付款日期')
    if (source?.kind === 'card' && input.periodYm === null) must(input.recordYm || input.actualDate, '請指定記帳月份')
    const now = Date.now()
    let existing: Occurrence | undefined
    if (input.periodYm !== null) {
      existing = await d.occurrences.where('[templateId+periodKey]').equals([input.templateId, input.periodYm]).first()
      // 只能確認「到期月份」的期數；已存在的期數（例如週期改過之前延後的那期）仍可確認
      must(existing || isDueMonth(t, input.periodYm), '這個月份不是該項目的到期月份')
    } else if (input.occurrenceId) {
      existing = await d.occurrences.get(input.occurrenceId)
      must(existing && existing.templateId === input.templateId, '找不到這筆紀錄')
    }
    const id = existing?.id ?? newId()
    const baseline = existing?.baseline ?? (input.periodYm && t.amountMode === 'fixed' && t.defaultAmount !== null &&
      (t.defaultSourceId ? (await d.sources.get(t.defaultSourceId))?.kind === 'card' : false)
      ? { status: 'confirmed' as const, amount: t.defaultAmount, sourceId: t.defaultSourceId, backfilled: input.periodYm < ymOf(todayYmd()) }
      : undefined)
    const row: Occurrence = {
      id,
      templateId: input.templateId,
      periodKey: input.periodYm ?? existing?.periodKey ?? `x:${id}`,
      periodYm: input.periodYm,
      status: 'confirmed',
      actualDate: source?.kind === 'card' ? null : input.actualDate,
      actualYm: source?.kind === 'card' ? (input.periodYm ?? input.recordYm ?? ymOf(input.actualDate!)) : ymOf(input.actualDate!),
      automatic: false,
      backfilled: false,
      baseline,
      amount: input.amount,
      sourceId: input.sourceId,
      inCardTotal: input.inCardTotal,
      note: cleanText(input.note),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await d.occurrences.put(row)
    return row
  })
}

/** 標記某一期「本期未扣款」或「延後」。延後的期數會持續出現在之後月份，直到確認或標記未扣款。 */
export async function markOccurrence(
  templateId: ID,
  periodYm: YM,
  status: 'skipped' | 'deferred',
  note: string,
  d: HomeExpenseDB = defaultDb,
): Promise<void> {
  must(isValidYm(periodYm), '月份格式錯誤')
  await d.transaction('rw', d.occurrences, d.templates, d.sources, async () => {
    const t = await d.templates.get(templateId)
    must(t && t.cycleMonths !== null, '不定期項目沒有「期」可以標記')
    const existing = await d.occurrences.where('[templateId+periodKey]').equals([templateId, periodYm]).first()
    must(existing || isDueMonth(t, periodYm), '這個月份不是該項目的到期月份')
    const defaultSource = t.defaultSourceId ? await d.sources.get(t.defaultSourceId) : undefined
    const baseline = existing?.baseline ?? (t.amountMode === 'fixed' && t.defaultAmount !== null && defaultSource?.kind === 'card'
      ? { status: 'confirmed' as const, amount: t.defaultAmount, sourceId: defaultSource.id, backfilled: periodYm < ymOf(todayYmd()) }
      : undefined)
    const now = Date.now()
    await d.occurrences.put({
      id: existing?.id ?? newId(),
      templateId,
      periodKey: periodYm,
      periodYm,
      status,
      actualDate: null,
      actualYm: null,
      automatic: false,
      baseline,
      amount: null,
      sourceId: existing?.sourceId ?? null,
      inCardTotal: existing?.inCardTotal ?? true,
      note: cleanText(note),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  })
}

/** 撤銷某一期的處理，回到「待確認」（週期性）或刪除該筆（不定期）。 */
export async function resetOccurrence(id: ID, d: HomeExpenseDB = defaultDb) {
  await d.transaction('rw', d.occurrences, async () => {
    const existing = await d.occurrences.get(id)
    if (!existing) return
    if (!existing.baseline || !existing.periodYm) return d.occurrences.delete(id)
    const base = existing.baseline
    await d.occurrences.put({
      ...existing, status: base.status, actualDate: null,
      actualYm: base.status === 'confirmed' ? existing.periodYm : null,
      amount: base.amount, sourceId: base.sourceId, inCardTotal: true,
      automatic: base.status === 'confirmed', backfilled: base.backfilled,
      note: '', updatedAt: Date.now(),
    })
  })
}

// ───────────────────────── 額外消費 ─────────────────────────

export interface ExtraInput {
  name: string
  amount: number
  date: YMD | null
  /** 信用卡消費歸屬月；銀行／現金仍由付款日期決定。 */
  ym?: YM
  sourceId: ID | null
  note: string
}

export async function saveExtra(input: ExtraInput, id: ID | null, d: HomeExpenseDB = defaultDb): Promise<ExtraExpense> {
  const name = cleanName(input.name, '消費名稱')
  must(isValidAmount(input.amount), '金額需為 0 以上的整數')
  must(input.date === null || isValidYmd(input.date), '日期格式錯誤')
  must(input.ym === undefined || isValidYm(input.ym), '月份格式錯誤')
  return d.transaction('rw', d.extras, d.sources, async () => {
    const source = input.sourceId ? await d.sources.get(input.sourceId) : undefined
    if (input.sourceId) must(source, '找不到付款方式')
    if (source?.kind !== 'card') must(input.date !== null, '請選擇付款日期')
    if (source?.kind === 'card') must(input.ym || input.date, '請指定消費月份')
    const existing = id ? await d.extras.get(id) : undefined
    must(!id || existing, '找不到這筆消費')
    const now = Date.now()
    const row: ExtraExpense = {
      id: existing?.id ?? newId(),
      name,
      amount: input.amount,
      date: source?.kind === 'card' ? null : input.date,
      ym: source?.kind === 'card' ? (input.ym ?? ymOf(input.date!)) : ymOf(input.date!),
      sourceId: input.sourceId,
      note: cleanText(input.note),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await d.extras.put(row)
    return row
  })
}

export async function deleteExtra(id: ID, d: HomeExpenseDB = defaultDb) {
  await d.extras.delete(id)
}

// ───────────────────────── 月份備註 ─────────────────────────

export async function saveMonthNote(ym: YM, note: string, d: HomeExpenseDB = defaultDb) {
  must(isValidYm(ym), '月份格式錯誤')
  const v = cleanText(note)
  if (v.trim() === '') await d.monthNotes.delete(ym)
  else await d.monthNotes.put({ ym, note: v, updatedAt: Date.now() })
}
