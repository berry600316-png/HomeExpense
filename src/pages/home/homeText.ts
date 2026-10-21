/** 首頁與分享圖片共用的顯示文字。集中在這裡，方便測試與統一用詞。 */
import type { CardLine, FixedLine, MonthResult } from '../../domain/compute'
import { formatMoney } from '../../domain/money'
import { cycleLabel, upcomingDueMonths } from '../../domain/schedule'
import type { ID } from '../../domain/types'
import { addMonths, parseYm } from '../../domain/ym'
import { sourceLabel, type AllData, type Lookups } from '../../hooks/useData'

export type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'info'

/** 文字需要查的名稱（歸屬對象、扣款來源）。抽成介面，測試時不需要整個資料庫。 */
export interface Labels {
  /** 保險的歸屬對象名稱；不是保險或沒有設定時回傳空字串。 */
  who(templateId: ID): string
  /** 扣款來源顯示名稱。 */
  source(sourceId: ID | null): string
}

export function makeLabels(data: AllData, lk: Lookups): Labels {
  return {
    who(templateId) {
      const ins = lk.insuranceByTemplate.get(templateId)
      return ins?.beneficiaryId ? (lk.beneficiaryById.get(ins.beneficiaryId)?.name ?? '') : ''
    },
    source: (sourceId) => sourceLabel(data, sourceId),
  }
}

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
      ? { tone: 'warn', text: `尚未輸入本月總額 · 已有 ${c.deductions.length} 筆固定支出` }
      : { tone: 'warn', text: '尚未輸入本月總額' }
  }
  if (c.status === 'zero')
    return { tone: 'muted', text: c.deductions.length ? `刷卡 $0 · 已扣固定 ${c.deductions.length} 筆` : '本月無消費' }
  const base = `刷卡 ${formatMoney(c.raw ?? 0)}`
  if (c.rawNegative) return { tone: 'warn', text: `${base} · 負數需留意` }
  return { tone: 'muted', text: c.deductions.length ? `${base} · 已扣固定 ${c.deductions.length} 筆` : base }
}

/** 固定支出列右側（金額欄）：已確認顯示金額，其他狀態顯示簡短狀態字。 */
export function fixedSlot(line: FixedLine): { tone: Tone | 'normal'; text: string } {
  switch (line.state) {
    case 'confirmed':
      return { tone: 'normal', text: formatMoney(line.amount ?? 0) }
    case 'pending':
    case 'carried':
      return { tone: 'warn', text: '待確認' }
    case 'deferred':
      return { tone: 'muted', text: '延後' }
    case 'skipped':
      return { tone: 'muted', text: '未扣款' }
    case 'paid-other-month':
      return { tone: 'muted', text: '—' }
    case 'not-due':
      return { tone: 'muted', text: '未到期' }
    case 'irregular-none':
      return { tone: 'muted', text: '本月無' }
  }
}

/** 本月沒有花到錢、也不用處理的狀態（首頁淡色顯示；分享圖片收成一行）。 */
export function isQuietLine(line: FixedLine): boolean {
  return line.state !== 'confirmed' && line.state !== 'pending' && line.state !== 'carried'
}

/** 固定支出列的小字：歸屬對象（保險）＋扣款來源或補充說明。狀態本身已寫在右側金額欄，這裡不重複。 */
export function fixedMeta(line: FixedLine, ym: string, labels: Labels): { tone: Tone; text: string } {
  const t = line.template
  const who = labels.who(t.id)
  const o = line.occurrence
  const lead = (s: string) => [who, s].filter(Boolean).join(' · ')
  switch (line.state) {
    case 'confirmed': {
      const period = line.periodYm && line.periodYm !== ym ? `${monthLabel(line.periodYm)}期 · ` : ''
      return { tone: 'muted', text: lead(`${period}${labels.source(o?.sourceId ?? null)}`) }
    }
    case 'pending':
      return { tone: 'warn', text: lead(t.defaultAmount !== null ? `參考 ${formatMoney(t.defaultAmount)}` : '') }
    case 'carried':
      return { tone: 'warn', text: lead(`${monthLabel(line.periodYm!)}期延後`) }
    case 'deferred':
      return { tone: 'muted', text: lead('之後月份再扣') }
    case 'skipped':
      return { tone: 'muted', text: lead('') }
    case 'paid-other-month':
      return { tone: 'muted', text: lead(`已於 ${monthLabel(o!.actualYm!)}扣款`) }
    case 'irregular-none':
      return { tone: 'muted', text: lead('不定期') }
    case 'not-due': {
      const next = upcomingDueMonths(t, addMonths(ym, 1), 1)[0]
      return { tone: 'muted', text: lead(next ? `下次 ${nextLabel(next, ym)}` : cycleLabel(t.cycleMonths)) }
    }
  }
}

/** 固定支出卡標題下的一行：「已扣 4 項 · 待確認 1 項」。 */
export function fixedCaption(r: MonthResult): { tone: Tone; text: string }[] {
  const paid = r.fixed.filter((l) => l.state === 'confirmed').length
  const parts: { tone: Tone; text: string }[] = []
  if (paid > 0) parts.push({ tone: 'muted', text: `已扣 ${paid} 項` })
  if (r.pendingFixed > 0) parts.push({ tone: 'warn', text: `待確認 ${r.pendingFixed} 項` })
  if (parts.length === 0) parts.push({ tone: 'muted', text: '本月沒有扣款' })
  return parts
}

export function extraCaption(r: MonthResult): string {
  return r.extras.length > 0 ? `共 ${r.extras.length} 筆` : '本月沒有'
}

function nextLabel(next: string, ym: string): string {
  const a = parseYm(next)
  const b = parseYm(ym)
  return a.y === b.y ? `${a.m} 月` : `${a.y}/${a.m}`
}
