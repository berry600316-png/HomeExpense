/** 首頁各行的顯示文字。集中在這裡，方便測試與統一用詞。 */
import type { CardLine, FixedLine, MonthResult } from '../../domain/compute'
import { formatMoney } from '../../domain/money'
import { cycleLabel, upcomingDueMonths } from '../../domain/schedule'
import { addMonths, parseYm } from '../../domain/ym'
import { sourceLabel, type AllData, type Lookups } from '../../hooks/useData'

export type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'info'

export function monthLabel(ym: string): string {
  const { m } = parseYm(ym)
  return `${m} 月`
}

export function monthStatus(r: MonthResult): { tone: Tone; text: string } {
  if (r.cards.length === 0 && r.fixed.length === 0 && r.extras.length === 0)
    return { tone: 'muted', text: '還沒有資料，先從新增信用卡開始' }
  const parts: string[] = []
  if (r.missingCards > 0) parts.push(`${r.missingCards} 張卡未輸入`)
  if (r.pendingFixed > 0) parts.push(`${r.pendingFixed} 項待確認`)
  if (r.hasAnomaly) {
    const n = r.cards.filter((c) => c.exceedsTotal).length
    return { tone: 'danger', text: `金額異常 · ${n} 張卡扣除大於總額` }
  }
  if (r.phase === 'future') return { tone: 'muted', text: parts.length ? `未來月份 · ${parts.join(' · ')}` : '未來月份' }
  if (r.phase === 'current') {
    return parts.length
      ? { tone: 'info', text: `本月進行中 · ${parts.join(' · ')}` }
      : { tone: 'info', text: '本月進行中 · 目前資料已齊' }
  }
  if (!r.complete) return { tone: 'warn', text: `資料尚未完成 · ${parts.join(' · ')}` }
  return { tone: 'ok', text: '資料已完整' }
}

export function cardSub(c: CardLine): { tone: Tone; text: string } {
  if (c.exceedsTotal) return { tone: 'danger', text: `扣除 ${formatMoney(c.deductionTotal)} 大於總額 ${formatMoney(c.raw ?? 0)}` }
  if (c.status === 'missing') {
    return c.deductions.length
      ? { tone: 'warn', text: `尚未輸入總額 · 已有 ${c.deductions.length} 筆扣除` }
      : { tone: 'warn', text: '尚未輸入本月總額' }
  }
  if (c.status === 'zero') return { tone: 'muted', text: c.deductions.length ? `原始 $0 · 扣除 ${c.deductions.length} 筆` : '本月無消費' }
  const base = `原始 ${formatMoney(c.raw ?? 0)}`
  const extra = c.deductions.length ? ` · 扣除 ${c.deductions.length} 筆` : ''
  return { tone: c.rawNegative ? 'warn' : 'muted', text: c.rawNegative ? `${base} · 負數需留意` : base + extra }
}

/** 固定支出行的副標：歸屬對象（保險）或扣款來源 + 狀態。 */
export function fixedMeta(line: FixedLine, ym: string, data: AllData, lk: Lookups): { tone: Tone; text: string } {
  const t = line.template
  const ins = lk.insuranceByTemplate.get(t.id)
  const who = ins?.beneficiaryId ? (lk.beneficiaryById.get(ins.beneficiaryId)?.name ?? '') : ''
  const o = line.occurrence
  const lead = (s: string) => [who, s].filter(Boolean).join(' · ')
  switch (line.state) {
    case 'confirmed': {
      const src = sourceLabel(data, o?.sourceId ?? null)
      const period = line.periodYm && line.periodYm !== ym ? `${monthLabel(line.periodYm)}期 · ` : ''
      return { tone: 'ok', text: lead(`${period}${src || '已確認'}`) }
    }
    case 'pending':
      return {
        tone: 'warn',
        text: lead(t.defaultAmount !== null ? `待確認 · 參考 ${formatMoney(t.defaultAmount)}` : '待確認'),
      }
    case 'carried':
      return { tone: 'warn', text: lead(`待確認（${monthLabel(line.periodYm!)}期延後）`) }
    case 'deferred':
      return { tone: 'muted', text: lead('本期延後') }
    case 'skipped':
      return { tone: 'muted', text: lead('本期未扣款') }
    case 'paid-other-month':
      return { tone: 'muted', text: lead(`已於 ${monthLabel(o!.actualYm!)}扣款`) }
    case 'irregular-none':
      return { tone: 'muted', text: lead('不定期 · 本月無') }
    case 'not-due': {
      const next = upcomingDueMonths(t, addMonths(ym, 1), 1)[0]
      return { tone: 'muted', text: lead(next ? `本月未到期 · 下次 ${nextLabel(next, ym)}` : `本月未到期 · ${cycleLabel(t.cycleMonths)}`) }
    }
  }
}

function nextLabel(next: string, ym: string): string {
  const a = parseYm(next)
  const b = parseYm(ym)
  return a.y === b.y ? `${a.m} 月` : `${a.y}/${a.m}`
}
