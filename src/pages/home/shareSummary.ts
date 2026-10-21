/**
 * 「分享給家人」圖片的內容。只決定圖片上要寫什麼，不負責畫圖（畫圖在 shareImage.ts）。
 * 規則（docs/DECISIONS.md S1–S5）：
 * - 所有金額與首頁同一套計算結果，不另外計算。
 * - 資料尚未完成時照實寫出，避免家人以為是完整月份。
 * - 本月沒有花到錢的固定支出（未到期、未扣款、延後…）收成一行，只列名稱。
 * - 不放任何備註內容。
 */
import { APP_NAME } from '../../appInfo'
import type { MonthResult } from '../../domain/compute'
import { formatMoney } from '../../domain/money'
import type { YMD } from '../../domain/types'
import { formatYmdShort, formatYmLabel } from '../../domain/ym'
import { cardSub, fixedMeta, fixedSlot, isQuietLine, monthStatus, type Labels, type Tone } from './homeText'

export type ShareTone = Tone | 'normal'

export interface ShareRow {
  name: string
  sub: string
  amount: string
  tone: ShareTone
}

export interface ShareSection {
  title: string
  total: string
  rows: ShareRow[]
  /** 沒有任何列時顯示的文字。 */
  emptyText: string
  /** 收成一行的項目（例如「本月沒有扣款：管理費、長照險」）。 */
  quiet: { label: string; names: string[] } | null
}

export interface ShareSummary {
  brand: string
  month: string
  /** 總花費數字，不含 NT$；負數帶減號。 */
  total: string
  status: { tone: Tone; text: string }
  formula: { label: string; value: string }[]
  sections: ShareSection[]
  footer: string
  fileName: string
}

/** 8,580（不帶 $）；負數用真正的減號。 */
function plain(n: number): string {
  return formatMoney(n).replace('$', '')
}

export function buildShareSummary(r: MonthResult, labels: Labels, today: YMD): ShareSummary {
  const cardRows: ShareRow[] = r.cards.map((c) => ({
    name: c.card.name,
    sub: cardSub(c).text,
    amount: c.variable === null ? '未輸入' : formatMoney(c.variable),
    tone: c.variable === null ? 'warn' : c.variable < 0 || c.exceedsTotal ? 'danger' : 'normal',
  }))

  const fixedRows: ShareRow[] = []
  const quietNames: string[] = []
  for (const line of r.fixed) {
    if (isQuietLine(line)) {
      quietNames.push(line.template.name)
      continue
    }
    const slot = fixedSlot(line)
    fixedRows.push({ name: line.template.name, sub: fixedMeta(line, r.ym, labels).text, amount: slot.text, tone: slot.tone })
  }

  const extraRows: ShareRow[] = r.extras.map((e) => ({
    name: e.name,
    sub: formatYmdShort(e.date).slice(5),
    amount: formatMoney(e.amount),
    tone: 'normal',
  }))

  return {
    brand: APP_NAME,
    month: formatYmLabel(r.ym),
    total: plain(r.totals.total),
    status: monthStatus(r),
    formula: [
      { label: '信用卡', value: plain(r.totals.cardVariable) },
      { label: '固定支出', value: plain(r.totals.fixed) },
      { label: '額外消費', value: plain(r.totals.extra) },
    ],
    sections: [
      { title: '信用卡', total: formatMoney(r.totals.cardVariable), rows: cardRows, emptyText: '沒有信用卡', quiet: null },
      {
        title: '固定支出',
        total: formatMoney(r.totals.fixed),
        rows: fixedRows,
        // 全部都收進「本月沒有扣款」那一行時，不再另外寫空白文字（避免同一句出現兩次）
        emptyText: quietNames.length ? '' : '沒有固定支出',
        quiet: quietNames.length ? { label: '本月沒有扣款', names: quietNames } : null,
      },
      { title: '額外消費', total: formatMoney(r.totals.extra), rows: extraRows, emptyText: '本月沒有額外消費', quiet: null },
    ],
    footer: `${APP_NAME} · ${formatYmdShort(today)} 產生`,
    fileName: `${APP_NAME}-${r.ym}.png`,
  }
}
