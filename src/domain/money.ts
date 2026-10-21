/** 金額一律為整數新台幣。 */

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** $5,280；負數用真正的減號 −$720。 */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}$${fmt.format(Math.abs(n))}`
}

/** NT$16,700（首頁總花費用）。 */
export function formatNT(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}NT$${fmt.format(Math.abs(n))}`
}

export const MAX_AMOUNT = 999_999_999

/**
 * 解析使用者輸入的金額：接受千分位逗號、全形數字、前後空白。
 * 只接受整數；空字串回傳 null；格式不對回傳 NaN。
 */
export function parseAmount(input: string, opts: { allowNegative?: boolean } = {}): number | null {
  const s = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,\s]/g, '')
    .replace(/^[−－]/, '-')
  if (s === '') return null
  const re = opts.allowNegative ? /^-?\d+$/ : /^\d+$/
  if (!re.test(s)) return Number.NaN
  const n = Number(s)
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_AMOUNT) return Number.NaN
  return n === 0 ? 0 : n // 消除 -0
}

export function isValidAmount(n: unknown, opts: { allowNegative?: boolean } = {}): n is number {
  return (
    typeof n === 'number' &&
    Number.isSafeInteger(n) &&
    Math.abs(n) <= MAX_AMOUNT &&
    (opts.allowNegative === true || n >= 0)
  )
}
