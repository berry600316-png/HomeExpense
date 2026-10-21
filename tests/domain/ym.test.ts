import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  clampDay,
  diffDays,
  isActiveIn,
  isValidYm,
  isValidYmd,
  monthsBetween,
  todayYmd,
} from '../../src/domain/ym'

describe('日期驗證（L-047：不存在的日期不可被靜默接受）', () => {
  it.each(['2026-02-31', '2026-09-99', '2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29', '2026-1-01', '26-10-01', ''])(
    '拒絕 %s',
    (s) => expect(isValidYmd(s)).toBe(false),
  )
  it.each(['2028-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])('接受 %s', (s) => expect(isValidYmd(s)).toBe(true))
  it('1900-02-29 不是閏日（百年非四百年）', () => expect(isValidYmd('1900-02-29')).toBe(false))
  it('年月', () => {
    expect(isValidYm('2026-10')).toBe(true)
    expect(isValidYm('2026-13')).toBe(false)
    expect(isValidYm(202610)).toBe(false)
  })
})

describe('月份運算', () => {
  it('跨年加減', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -12)).toBe('2025-10')
    expect(monthsBetween('2026-04', '2027-04')).toBe(12)
    expect(monthsBetween('2026-10', '2026-04')).toBe(-6)
  })

  it('每月 31 日在小月份取月底', () => {
    expect(clampDay('2026-02', 31)).toBe('2026-02-28')
    expect(clampDay('2028-02', 31)).toBe('2028-02-29')
    expect(clampDay('2026-04', 31)).toBe('2026-04-30')
    expect(clampDay('2026-10', 15)).toBe('2026-10-15')
  })
})

describe('天數運算（純整數，不經時區）', () => {
  it('跨月、跨年、閏年', () => {
    expect(addDays('2026-10-29', 5)).toBe('2026-11-03')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDays('2026-10-21', '2026-10-24')).toBe(3)
    expect(diffDays('2026-10-24', '2026-10-21')).toBe(-3)
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366)
  })

  it('與 Date 的本地日期逐日比對 1000 天', () => {
    const start = new Date(2025, 0, 1)
    for (let i = 0; i < 1000; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      expect(addDays('2025-01-01', i)).toBe(todayYmd(d))
    }
  })
})

describe('今天（本地時間，非 UTC）', () => {
  it('台灣清晨 00:30 仍是當天（toISOString 會變成前一天）', () => {
    expect(todayYmd(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01')
    expect(todayYmd(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31')
  })
})

describe('生效區間', () => {
  it('startYm 含、endYm 不含', () => {
    const r = { startYm: '2026-04', endYm: '2026-11' }
    expect(isActiveIn(r, '2026-03')).toBe(false)
    expect(isActiveIn(r, '2026-04')).toBe(true)
    expect(isActiveIn(r, '2026-10')).toBe(true)
    expect(isActiveIn(r, '2026-11')).toBe(false)
    expect(isActiveIn({ startYm: '2026-04', endYm: null }, '2099-01')).toBe(true)
  })
})
