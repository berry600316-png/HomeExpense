import type { FixedTemplate, YM, YMD } from './types'
import { addMonths, clampDay, isActiveIn, monthsBetween } from './ym'

export const CYCLE_PRESETS: { months: number | null; label: string }[] = [
  { months: 1, label: '每月' },
  { months: 2, label: '每兩個月' },
  { months: 3, label: '每三個月' },
  { months: 6, label: '每半年' },
  { months: 12, label: '每年' },
  { months: null, label: '不固定週期' },
]

export function cycleLabel(cycleMonths: number | null): string {
  const preset = CYCLE_PRESETS.find((p) => p.months === cycleMonths)
  if (preset) return preset.label
  return `每 ${cycleMonths} 個月`
}

type ScheduleFields = Pick<FixedTemplate, 'cycleMonths' | 'anchorYm' | 'anchorDay' | 'startYm' | 'endYm'>

/**
 * 該項目在 ym 是否「預計到期」。
 * - 不固定週期：永遠不會自動到期。
 * - 週期由 anchorYm 決定相位（基準之前的月份只要對齊週期也算，例如基準 2026-04 每半年 → 2025-10 也是到期月）。
 * - 但只有在追蹤區間內（startYm <= ym < endYm）才算，避免回溯到開始使用 App 之前。
 */
export function isDueMonth(t: ScheduleFields, ym: YM): boolean {
  if (t.cycleMonths === null || t.cycleMonths < 1) return false
  if (!isActiveIn(t, ym)) return false
  const n = t.cycleMonths
  const diff = monthsBetween(t.anchorYm, ym)
  return ((diff % n) + n) % n === 0
}

/** 預計扣款日：到期月份的 anchorDay（超過月底取月底），未設定則 1 日。 */
export function expectedDate(t: Pick<FixedTemplate, 'anchorDay'>, periodYm: YM): YMD {
  return clampDay(periodYm, t.anchorDay ?? 1)
}

/** 從 fromYm（含）往後找最多 count 個到期月份，最多搜尋 limitMonths 個月。 */
export function upcomingDueMonths(t: ScheduleFields, fromYm: YM, count: number, limitMonths = 120): YM[] {
  const out: YM[] = []
  if (t.cycleMonths === null) return out
  for (let i = 0; i < limitMonths && out.length < count; i++) {
    const ym = addMonths(fromYm, i)
    if (t.endYm !== null && ym >= t.endYm) break
    if (isDueMonth(t, ym)) out.push(ym)
  }
  return out
}
