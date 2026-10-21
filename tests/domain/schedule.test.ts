import { describe, expect, it } from 'vitest'
import { cycleLabel, expectedDate, isDueMonth, upcomingDueMonths } from '../../src/domain/schedule'

const base = { anchorDay: null, startYm: '2026-01', endYm: null }

describe('週期判定', () => {
  it('每月', () => {
    const t = { ...base, cycleMonths: 1, anchorYm: '2026-01' }
    expect(['2026-01', '2026-02', '2026-12'].every((ym) => isDueMonth(t, ym))).toBe(true)
  })

  it('每兩個月：基準 2026-02 → 偶數月', () => {
    const t = { ...base, cycleMonths: 2, anchorYm: '2026-02' }
    expect(upcomingDueMonths(t, '2026-01', 6)).toEqual(['2026-02', '2026-04', '2026-06', '2026-08', '2026-10', '2026-12'])
  })

  it('每三個月、每年、自訂每 5 個月', () => {
    expect(upcomingDueMonths({ ...base, cycleMonths: 3, anchorYm: '2026-03' }, '2026-01', 4)).toEqual([
      '2026-03',
      '2026-06',
      '2026-09',
      '2026-12',
    ])
    expect(upcomingDueMonths({ ...base, cycleMonths: 12, anchorYm: '2026-07' }, '2026-01', 3)).toEqual([
      '2026-07',
      '2027-07',
      '2028-07',
    ])
    expect(upcomingDueMonths({ ...base, cycleMonths: 5, anchorYm: '2026-01' }, '2026-01', 3)).toEqual([
      '2026-01',
      '2026-06',
      '2026-11',
    ])
  })

  it('基準之前的月份只要週期對齊也算到期（基準只決定相位）', () => {
    const t = { ...base, cycleMonths: 6, anchorYm: '2026-04', startYm: '2025-01' }
    expect(isDueMonth(t, '2025-10')).toBe(true)
    expect(isDueMonth(t, '2025-09')).toBe(false)
  })

  it('不固定週期永遠不會自動到期', () => {
    expect(isDueMonth({ ...base, cycleMonths: null, anchorYm: '2026-01' }, '2026-01')).toBe(false)
    expect(upcomingDueMonths({ ...base, cycleMonths: null, anchorYm: '2026-01' }, '2026-01', 3)).toEqual([])
  })

  it('停用月份（含）之後不再到期', () => {
    const t = { ...base, cycleMonths: 1, anchorYm: '2026-01', endYm: '2026-04' }
    expect(upcomingDueMonths(t, '2026-01', 12)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('預計扣款日：anchorDay 超過月底取月底；未設定取 1 日', () => {
    expect(expectedDate({ anchorDay: 31 }, '2026-02')).toBe('2026-02-28')
    expect(expectedDate({ anchorDay: 15 }, '2026-10')).toBe('2026-10-15')
    expect(expectedDate({ anchorDay: null }, '2026-10')).toBe('2026-10-01')
  })

  it('週期名稱', () => {
    expect(cycleLabel(6)).toBe('每半年')
    expect(cycleLabel(null)).toBe('不固定週期')
    expect(cycleLabel(4)).toBe('每 4 個月')
  })
})
