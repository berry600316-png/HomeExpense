/**
 * 本地年月日工具。全部以字串與整數運算，不建立 UTC 時間，避免時區造成的跨日、跨月錯誤。
 *   YM  = 'YYYY-MM'
 *   YMD = 'YYYY-MM-DD'
 */
import type { ActiveRange, YM, YMD } from './types'

const YM_RE = /^(\d{4})-(\d{2})$/
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(ym: YM): number {
  const { y, m } = parseYm(ym)
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

export function isValidYm(s: unknown): s is YM {
  if (typeof s !== 'string') return false
  const r = YM_RE.exec(s)
  if (!r) return false
  const y = Number(r[1])
  const m = Number(r[2])
  return y >= 1900 && y <= 2999 && m >= 1 && m <= 12
}

/** 格式與日曆都要正確：2026-02-31、2026-09-99、2026-13-01 都不合法（L-047）。 */
export function isValidYmd(s: unknown): s is YMD {
  if (typeof s !== 'string') return false
  const r = YMD_RE.exec(s)
  if (!r) return false
  const ym = `${r[1]}-${r[2]}`
  if (!isValidYm(ym)) return false
  const d = Number(r[3])
  return d >= 1 && d <= daysInMonth(ym)
}

export function parseYm(ym: YM): { y: number; m: number } {
  const r = YM_RE.exec(ym)
  if (!r) throw new Error(`年月格式錯誤：${ym}`)
  return { y: Number(r[1]), m: Number(r[2]) }
}

export function parseYmd(ymd: YMD): { y: number; m: number; d: number } {
  if (!isValidYmd(ymd)) throw new Error(`日期格式錯誤：${ymd}`)
  const r = YMD_RE.exec(ymd)!
  return { y: Number(r[1]), m: Number(r[2]), d: Number(r[3]) }
}

export function makeYm(y: number, m: number): YM {
  return `${y}-${pad2(m)}`
}

export function makeYmd(y: number, m: number, d: number): YMD {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function ymOf(ymd: YMD): YM {
  return ymd.slice(0, 7)
}

/** 月份序號，方便加減與比較。 */
function ymIndex(ym: YM): number {
  const { y, m } = parseYm(ym)
  return y * 12 + (m - 1)
}

function ymFromIndex(i: number): YM {
  return makeYm(Math.floor(i / 12), (i % 12) + 1)
}

export function addMonths(ym: YM, n: number): YM {
  return ymFromIndex(ymIndex(ym) + n)
}

/** b − a 的月數。 */
export function monthsBetween(a: YM, b: YM): number {
  return ymIndex(b) - ymIndex(a)
}

/** YM／YMD 字串格式固定，可直接字典序比較。 */
export function compareYm(a: YM, b: YM): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 該月第 day 日；超過當月天數時取月底（例：每月 31 日在 2 月 → 2/28 或 2/29）。 */
export function clampDay(ym: YM, day: number): YMD {
  const { y, m } = parseYm(ym)
  const d = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(ym))
  return makeYmd(y, m, d)
}

/** 以本地時間取得今天，不用 toISOString（那是 UTC，台灣早上 8 點前會變成前一天）。 */
export function todayYmd(now: Date = new Date()): YMD {
  return makeYmd(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function currentYm(now: Date = new Date()): YM {
  return ymOf(todayYmd(now))
}

/** 以「從 1970-01-01 起的天數」計算，純整數運算（civil-from-days 演算法），不依賴時區。 */
function dayNumber(ymd: YMD): number {
  const { y: y0, m, d } = parseYmd(ymd)
  const y = m <= 2 ? y0 - 1 : y0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const mp = (m + 9) % 12
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function fromDayNumber(z0: number): YMD {
  const z = z0 + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return makeYmd(y, m, d)
}

export function addDays(ymd: YMD, n: number): YMD {
  return fromDayNumber(dayNumber(ymd) + n)
}

/** b − a 的天數。 */
export function diffDays(a: YMD, b: YMD): number {
  return dayNumber(b) - dayNumber(a)
}

export function isActiveIn(range: ActiveRange, ym: YM): boolean {
  return range.startYm <= ym && (range.endYm === null || ym < range.endYm)
}

export function formatYmLabel(ym: YM): string {
  const { y, m } = parseYm(ym)
  return `${y} 年 ${m} 月`
}

export function formatYmdShort(ymd: YMD): string {
  const { y, m, d } = parseYmd(ymd)
  return `${y}/${pad2(m)}/${pad2(d)}`
}
