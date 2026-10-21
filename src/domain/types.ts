/**
 * 資料模型。所有金額都是整數新台幣；所有日期都是「台灣本地」字串，不經過 UTC。
 *   YM  = 'YYYY-MM'
 *   YMD = 'YYYY-MM-DD'
 * 關聯一律用穩定 ID，不用顯示名稱。
 */
export type ID = string
export type YM = string
export type YMD = string

/** 生效區間：startYm <= ym < endYm（endYm 為 null 表示仍在使用）。 */
export interface ActiveRange {
  startYm: YM
  endYm: YM | null
}

export interface CreditCard extends ActiveRange {
  id: ID
  name: string
  bank: string
  /** 卡片識別名稱或末四碼，選填。 */
  tag: string
  order: number
  /** 每月繳款截止日（1–31），null 表示不提醒。 */
  dueDay: number | null
  note: string
  createdAt: number
  updatedAt: number
}

/** 某張卡某個月份的原始消費總額。每張卡每月最多一筆（唯一鍵 [cardId+ym]）。 */
export interface CardMonth {
  id: ID
  cardId: ID
  ym: YM
  /** null = 尚未輸入；0 = 已確認當月零消費。可為負數（退款大於消費）。 */
  amount: number | null
  note: string
  updatedAt: number
}

export type SourceKind = 'card' | 'bank' | 'cash' | 'other'

/** 付款來源。kind='card' 時必有 cardId，且與 CreditCard 一對一。 */
export interface PaymentSource {
  id: ID
  kind: SourceKind
  cardId: ID | null
  /** card 類型顯示時以卡片名稱為準，此欄僅作備援。 */
  name: string
  order: number
  archived: boolean
  note: string
}

export type TemplateKind = 'general' | 'insurance'
export type AmountMode = 'fixed' | 'variable'

/** 固定支出長期設定（模板）。實際每一期的扣款存在 Occurrence，不受模板修改影響。 */
export interface FixedTemplate extends ActiveRange {
  id: ID
  name: string
  kind: TemplateKind
  defaultSourceId: ID | null
  amountMode: AmountMode
  /** 參考／預設金額，只是填寫輔助，不代表實際扣款。 */
  defaultAmount: number | null
  /** 每幾個月一次（1、2、3、6、12 或自訂 N）；null = 不固定週期。 */
  cycleMonths: number | null
  /** 週期基準年月，例如半年繳、基準 2026-04 → 4 月、10 月到期。 */
  anchorYm: YM
  /** 預計扣款日（1–31），用來預填實際日期；null = 預填當月 1 日。 */
  anchorDay: number | null
  order: number
  note: string
  createdAt: number
  updatedAt: number
}

/** 保險專屬資料，以 templateId 對應 FixedTemplate(kind='insurance')。 */
export interface InsuranceInfo {
  templateId: ID
  beneficiaryId: ID | null
  insurer: string
  policyNo: string
}

export interface Beneficiary {
  id: ID
  name: string
  order: number
  archived: boolean
}

export type OccurrenceStatus = 'confirmed' | 'skipped' | 'deferred'

/**
 * 固定支出某一期的實際狀態。只有使用者「動過」的期數才會存在；
 * 「待確認」不存，由週期即時推算，所以不可能重複產生紀錄。
 * 唯一鍵 [templateId+periodKey]：週期性項目 periodKey = 預計年月；不定期項目 periodKey = 'x:' + id。
 */
export interface Occurrence {
  id: ID
  templateId: ID
  periodKey: string
  /** 預計繳費年月；不定期項目為 null。 */
  periodYm: YM | null
  status: OccurrenceStatus
  /** 實際扣款日；status='confirmed' 時必填。 */
  actualDate: YMD | null
  /** 由 actualDate 推得，存起來供索引查詢。 */
  actualYm: YM | null
  amount: number | null
  sourceId: ID | null
  /** 刷卡時是否已包含在該卡當月總額內（預設 true）。非信用卡來源時無意義。 */
  inCardTotal: boolean
  note: string
  createdAt: number
  updatedAt: number
}

export interface ExtraExpense {
  id: ID
  name: string
  amount: number
  date: YMD
  ym: YM
  /** 付款方式選填、不限制。 */
  sourceId: ID | null
  note: string
  createdAt: number
  updatedAt: number
}

export interface MonthNote {
  ym: YM
  note: string
  updatedAt: number
}

/** 卡費繳款：某張卡在某個月份的截止日覆寫與已繳紀錄。唯一鍵 [cardId+dueYm]。 */
export interface CardBill {
  id: ID
  cardId: ID
  /** 截止日所在年月。 */
  dueYm: YM
  /** 個別月份覆寫的截止日；null 用卡片的 dueDay。 */
  dueDateOverride: YMD | null
  /** 按下「已繳」的日期；null = 未繳。只記日期，不記金額。 */
  paidDate: YMD | null
  updatedAt: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export const SETTING_KEYS = {
  reminderDaysBefore: 'reminderDaysBefore',
  lastBackupAt: 'lastBackupAt',
} as const

export const DEFAULT_REMINDER_DAYS = 5
