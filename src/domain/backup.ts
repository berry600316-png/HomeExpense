/**
 * 備份格式與還原驗證（規格 12.3／12.4）。
 * 還原前做完整檢查：JSON 格式 → App 識別與結構版本 → 每筆必要欄位與型別 → 唯一性 → 資料間關聯。
 * 任何一項不通過就不動本機資料。
 */
import { z } from 'zod'
import { MAX_AMOUNT } from './money'
import { isValidYm, isValidYmd } from './ym'

export const BACKUP_APP_ID = 'homeexpense-tw'
export const BACKUP_SCHEMA_VERSION = 1

const id = z.string().min(1).max(100)
const ym = z.string().refine(isValidYm, '年月格式錯誤')
const ymd = z.string().refine(isValidYmd, '日期格式錯誤')
const money = z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT)
const moneyPos = z.number().int().min(0).max(MAX_AMOUNT)
const text = z.string().max(20000)
const day = z.number().int().min(1).max(31)
const ts = z.number().finite()
const order = z.number().int()

const range = { startYm: ym, endYm: ym.nullable() }

export const tableSchemas = {
  cards: z.object({ id, name: text.min(1), bank: text, tag: text, order, dueDay: day.nullable(), dueFrom: ymd.nullable(), note: text, ...range, createdAt: ts, updatedAt: ts }),
  cardMonths: z.object({ id, cardId: id, ym, amount: money.nullable(), note: text, updatedAt: ts }),
  sources: z.object({ id, kind: z.enum(['card', 'bank', 'cash', 'other']), cardId: id.nullable(), name: text, order, archived: z.boolean(), note: text }),
  templates: z.object({
    id,
    name: text.min(1),
    kind: z.enum(['general', 'insurance']),
    defaultSourceId: id.nullable(),
    amountMode: z.enum(['fixed', 'variable']),
    defaultAmount: moneyPos.nullable(),
    cycleMonths: z.number().int().min(1).max(120).nullable(),
    anchorYm: ym,
    anchorDay: day.nullable(),
    order,
    note: text,
    ...range,
    createdAt: ts,
    updatedAt: ts,
  }),
  insurance: z.object({ templateId: id, beneficiaryId: id.nullable(), insurer: text, policyNo: text }),
  beneficiaries: z.object({ id, name: text.min(1), order, archived: z.boolean() }),
  occurrences: z.object({
    id,
    templateId: id,
    periodKey: z.string().min(1).max(120),
    periodYm: ym.nullable(),
    status: z.enum(['confirmed', 'skipped', 'deferred']),
    actualDate: ymd.nullable(),
    actualYm: ym.nullable(),
    amount: moneyPos.nullable(),
    sourceId: id.nullable(),
    inCardTotal: z.boolean(),
    note: text,
    createdAt: ts,
    updatedAt: ts,
  }),
  extras: z.object({ id, name: text.min(1), amount: moneyPos, date: ymd, ym, sourceId: id.nullable(), note: text, createdAt: ts, updatedAt: ts }),
  monthNotes: z.object({ ym, note: text, updatedAt: ts }),
  cardBills: z.object({ id, cardId: id, dueYm: ym, dueDateOverride: ymd.nullable(), paidDate: ymd.nullable(), updatedAt: ts }),
  settings: z.object({ key: z.enum(['reminderDaysBefore', 'lastBackupAt']), value: z.unknown() }),
} as const

export type BackupTables = { [K in keyof typeof tableSchemas]: z.infer<(typeof tableSchemas)[K]>[] }
export const TABLE_NAMES = Object.keys(tableSchemas) as (keyof BackupTables)[]

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  schemaVersion: number
  exportedAt: string
  data: BackupTables
}

export function buildBackup(tables: BackupTables, exportedAt: Date = new Date()): BackupFile {
  return { app: BACKUP_APP_ID, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: exportedAt.toISOString(), data: tables }
}

export type ValidationResult = { ok: true; backup: BackupFile; counts: Record<keyof BackupTables, number> } | { ok: false; errors: string[] }

const TABLE_LABEL: Record<keyof BackupTables, string> = {
  cards: '信用卡',
  cardMonths: '信用卡月總額',
  sources: '付款來源',
  templates: '固定支出',
  insurance: '保單資料',
  beneficiaries: '歸屬對象',
  occurrences: '每期繳費紀錄',
  extras: '額外消費',
  monthNotes: '月份備註',
  cardBills: '卡費繳款紀錄',
  settings: '設定',
}

/** 驗證備份內容。錯誤最多回報 20 筆，避免訊息爆量。 */
export function validateBackup(raw: string): ValidationResult {
  const errors: string[] = []
  const fail = (m: string) => {
    if (errors.length < 20) errors.push(m)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['檔案不是有效的 JSON'] }
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { ok: false, errors: ['檔案格式不正確'] }
  const obj = json as Record<string, unknown>
  if (obj.app !== BACKUP_APP_ID) return { ok: false, errors: ['這不是本 App 的備份檔'] }
  if (typeof obj.schemaVersion !== 'number' || !Number.isInteger(obj.schemaVersion))
    return { ok: false, errors: ['缺少資料結構版本'] }
  if (obj.schemaVersion > BACKUP_SCHEMA_VERSION)
    return { ok: false, errors: [`備份檔版本（v${obj.schemaVersion}）比目前 App 新，請先更新 App`] }
  if (obj.schemaVersion < 1) return { ok: false, errors: ['不支援的備份版本'] }
  if (typeof obj.data !== 'object' || obj.data === null) return { ok: false, errors: ['備份檔沒有資料內容'] }
  const dataIn = obj.data as Record<string, unknown>

  const data = {} as BackupTables
  for (const name of TABLE_NAMES) {
    const rows = dataIn[name]
    if (!Array.isArray(rows)) {
      fail(`缺少「${TABLE_LABEL[name]}」資料`)
      continue
    }
    const schema = tableSchemas[name]
    const parsed: unknown[] = []
    rows.forEach((row, i) => {
      const r = schema.safeParse(row)
      if (r.success) parsed.push(r.data)
      else {
        const issue = r.error.issues[0]
        fail(`「${TABLE_LABEL[name]}」第 ${i + 1} 筆欄位錯誤：${issue?.path.join('.') || '(整筆)'} ${issue?.message ?? ''}`)
      }
    })
    ;(data as Record<string, unknown[]>)[name] = parsed
  }
  if (errors.length) return { ok: false, errors }

  // 唯一性
  const uniq = <T,>(rows: T[], key: (r: T) => string, label: string) => {
    const seen = new Set<string>()
    for (const r of rows) {
      const k = key(r)
      if (seen.has(k)) fail(`${label}重複：${k}`)
      seen.add(k)
    }
  }
  uniq(data.cards, (r) => r.id, '信用卡 ID ')
  uniq(data.cardMonths, (r) => r.id, '月總額 ID ')
  uniq(data.cardMonths, (r) => `${r.cardId}|${r.ym}`, '同一張卡同一月份的月總額')
  uniq(data.sources, (r) => r.id, '付款來源 ID ')
  uniq(data.templates, (r) => r.id, '固定支出 ID ')
  uniq(data.insurance, (r) => r.templateId, '保單資料')
  uniq(data.beneficiaries, (r) => r.id, '歸屬對象 ID ')
  uniq(data.occurrences, (r) => r.id, '繳費紀錄 ID ')
  uniq(data.occurrences, (r) => `${r.templateId}|${r.periodKey}`, '同一期繳費紀錄')
  uniq(data.extras, (r) => r.id, '額外消費 ID ')
  uniq(data.monthNotes, (r) => r.ym, '月份備註')
  uniq(data.cardBills, (r) => r.id, '卡費紀錄 ID ')
  uniq(data.cardBills, (r) => `${r.cardId}|${r.dueYm}`, '同一張卡同一月份的卡費紀錄')
  uniq(data.settings, (r) => r.key, '設定')

  // 關聯
  const cardIds = new Set(data.cards.map((c) => c.id))
  const sourceIds = new Set(data.sources.map((s) => s.id))
  const templateIds = new Set(data.templates.map((t) => t.id))
  const benIds = new Set(data.beneficiaries.map((b) => b.id))
  for (const r of data.cardMonths) if (!cardIds.has(r.cardId)) fail(`月總額指向不存在的信用卡（${r.ym}）`)
  for (const r of data.cardBills) if (!cardIds.has(r.cardId)) fail(`卡費紀錄指向不存在的信用卡（${r.dueYm}）`)
  const cardSourceCount = new Map<string, number>()
  for (const s of data.sources) {
    if (s.kind === 'card') {
      if (!s.cardId || !cardIds.has(s.cardId)) fail(`付款來源「${s.name}」指向不存在的信用卡`)
      else cardSourceCount.set(s.cardId, (cardSourceCount.get(s.cardId) ?? 0) + 1)
    } else if (s.cardId !== null) fail(`付款來源「${s.name}」不是信用卡卻有卡片關聯`)
  }
  for (const c of data.cards) if (cardSourceCount.get(c.id) !== 1) fail(`信用卡「${c.name}」沒有對應（或有多個）付款來源`)
  for (const t of data.templates) {
    if (t.defaultSourceId && !sourceIds.has(t.defaultSourceId)) fail(`固定支出「${t.name}」的預設扣款來源不存在`)
    if (t.endYm !== null && t.endYm <= t.startYm) fail(`固定支出「${t.name}」的停用月份早於起始月份`)
  }
  for (const c of data.cards) if (c.endYm !== null && c.endYm <= c.startYm) fail(`信用卡「${c.name}」的停用月份早於起始月份`)
  for (const i of data.insurance) {
    if (!templateIds.has(i.templateId)) fail('保單資料指向不存在的固定支出')
    if (i.beneficiaryId && !benIds.has(i.beneficiaryId)) fail('保單的歸屬對象不存在')
  }
  for (const o of data.occurrences) {
    if (!templateIds.has(o.templateId)) fail(`繳費紀錄指向不存在的固定支出（${o.periodKey}）`)
    if (o.sourceId && !sourceIds.has(o.sourceId)) fail(`繳費紀錄的扣款來源不存在（${o.periodKey}）`)
    if (o.periodYm !== null && o.periodKey !== o.periodYm) fail(`繳費紀錄的期別不一致（${o.periodKey}）`)
    if (o.status === 'confirmed') {
      if (o.actualDate === null || o.amount === null) fail(`已確認的繳費紀錄缺少日期或金額（${o.periodKey}）`)
      else if (o.actualYm !== o.actualDate.slice(0, 7)) fail(`繳費紀錄的實際月份與日期不一致（${o.periodKey}）`)
    }
  }
  for (const e of data.extras) {
    if (e.sourceId && !sourceIds.has(e.sourceId)) fail(`額外消費「${e.name}」的付款方式不存在`)
    if (e.ym !== e.date.slice(0, 7)) fail(`額外消費「${e.name}」的月份與日期不一致`)
  }
  for (const s of data.settings) {
    if (s.key === 'reminderDaysBefore' && !(typeof s.value === 'number' && Number.isInteger(s.value) && s.value >= 0 && s.value <= 31))
      fail('設定「提醒天數」格式錯誤')
    if (s.key === 'lastBackupAt' && !(typeof s.value === 'number' && Number.isFinite(s.value))) fail('設定「上次備份時間」格式錯誤')
  }

  if (errors.length) return { ok: false, errors }
  const counts = Object.fromEntries(TABLE_NAMES.map((n) => [n, data[n].length])) as Record<keyof BackupTables, number>
  return {
    ok: true,
    backup: { app: BACKUP_APP_ID, schemaVersion: obj.schemaVersion, exportedAt: String(obj.exportedAt ?? ''), data },
    counts,
  }
}
