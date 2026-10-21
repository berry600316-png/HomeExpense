/**
 * 「分享給家人」圖片的內容（docs/DECISIONS.md S1–S5）。只測要寫什麼，畫圖本身在瀏覽器實測。
 */
import { describe, expect, it } from 'vitest'
import { computeMonth, type MonthInput } from '../src/domain/compute'
import type { Labels } from '../src/pages/home/homeText'
import { buildShareSummary } from '../src/pages/home/shareSummary'
import { emptyInput, marked, month, october2026, paid, template } from './fixtures'

const TODAY = '2026-10-21'

function labelsFor(input: MonthInput, who: Record<string, string> = {}): Labels {
  return {
    who: (id) => who[id] ?? '',
    source: (id) => input.sources.find((s) => s.id === id)?.name ?? '',
  }
}

function build(input: MonthInput, currentYm = '2026-10', who: Record<string, string> = {}) {
  return buildShareSummary(computeMonth('2026-10', input, currentYm), labelsFor(input, who), TODAY)
}

const section = (s: ReturnType<typeof build>, title: string) => {
  const sec = s.sections.find((x) => x.title === title)
  if (!sec) throw new Error(`section ${title} missing`)
  return sec
}

describe('16,700 案例的分享圖片內容', () => {
  it('總額、算式、每一列都與首頁計算一致', () => {
    const { input, ins1 } = october2026()
    const s = build(input, '2026-10', { [ins1.id]: '爸爸' })

    expect(s.month).toBe('2026 年 10 月')
    expect(s.total).toBe('16,700')
    expect(s.formula).toEqual([
      { label: '信用卡', value: '9,280' },
      { label: '固定支出', value: '4,420' },
      { label: '額外消費', value: '3,000' },
    ])

    const cards = section(s, '信用卡')
    expect(cards.total).toBe('$9,280')
    expect(cards.rows.map((r) => [r.name, r.sub, r.amount, r.tone])).toEqual([
      ['台新信用卡', '刷卡 $8,000 · 已扣固定 2 筆', '$5,280', 'normal'],
      ['國泰信用卡', '刷卡 $5,000 · 已扣固定 1 筆', '$4,000', 'normal'],
    ])

    const fixed = section(s, '固定支出')
    expect(fixed.total).toBe('$4,420')
    expect(fixed.rows.map((r) => [r.name, r.sub, r.amount])).toEqual([
      ['保險 1', '爸爸 · 台新信用卡', '$2,000'],
      ['電話費', '台新信用卡', '$720'],
      ['保險 2', '國泰信用卡', '$1,000'],
      ['水費', '銀行轉帳', '$700'],
    ])
    expect(fixed.quiet).toBeNull()

    const extras = section(s, '額外消費')
    expect(extras.rows.map((r) => [r.name, r.sub, r.amount])).toEqual([['額外銀行轉帳購物', '10/21', '$3,000']])

    expect(s.footer).toBe('周家計帳簿 · 2026/10/21 產生')
    expect(s.fileName).toBe('周家計帳簿-2026-10.png')
  })
})

describe('待確認與本月沒有扣款的項目', () => {
  it('待確認照列並標「待確認」；未到期、本期未扣款收成一行只列名稱；都不改變總額', () => {
    const { input } = october2026()
    const power = template('電費', { defaultAmount: 1200 })
    const mgmt = template('管理費', { cycleMonths: 2, anchorYm: '2026-11' })
    const gym = template('健身房')
    input.templates.push(power, mgmt, gym)
    input.occurrences.push(marked(gym, '2026-10', 'skipped'))

    const s = build(input)
    expect(s.total).toBe('16,700')
    const fixed = section(s, '固定支出')
    const pending = fixed.rows.find((r) => r.name === '電費')
    expect(pending).toEqual({ name: '電費', sub: '參考 $1,200', amount: '待確認', tone: 'warn' })
    expect(fixed.rows.map((r) => r.name)).not.toContain('管理費')
    expect(fixed.quiet).toEqual({ label: '本月沒有扣款', names: ['管理費', '健身房'] })
    expect(s.status.text).toContain('1 項待確認')
  })

  it('延後到本月才扣的上期也列出，寫明是哪一期', () => {
    const { input } = october2026()
    const tax = template('牌照稅', { cycleMonths: 12, anchorYm: '2026-09' })
    input.templates.push(tax)
    input.occurrences.push(marked(tax, '2026-09', 'deferred'))
    const row = section(build(input), '固定支出').rows.find((r) => r.name === '牌照稅')
    expect(row).toEqual({ name: '牌照稅', sub: '9 月期延後', amount: '待確認', tone: 'warn' })
  })
})

describe('資料尚未完成時照實寫出', () => {
  it('沒輸入的卡寫「未輸入」，狀態寫明幾張卡未輸入（不讓家人以為是完整月份）', () => {
    const { input, cathay } = october2026()
    input.cardMonths = input.cardMonths.filter((m) => m.cardId !== cathay.id)
    const s = build(input, '2026-11')
    const row = section(s, '信用卡').rows.find((r) => r.name === '國泰信用卡')
    expect(row?.amount).toBe('未輸入')
    expect(row?.tone).toBe('warn')
    expect(s.status.text).toBe('資料尚未完成 · 1 張卡未輸入')
  })

  it('扣除大於刷卡總額：該卡標紅、狀態寫金額異常', () => {
    const { input, taishin } = october2026()
    input.cardMonths = input.cardMonths.map((m) => (m.cardId === taishin.id ? month(taishin, '2026-10', 1000) : m))
    const s = build(input)
    const row = section(s, '信用卡').rows.find((r) => r.name === '台新信用卡')
    expect(row?.amount).toBe('−$1,720')
    expect(row?.tone).toBe('danger')
    expect(s.status.tone).toBe('danger')
  })
})

describe('空白月份與隱私', () => {
  it('沒有任何資料：三區都顯示空白文字，總額 0', () => {
    const s = build(emptyInput())
    expect(s.total).toBe('0')
    expect(s.sections.map((x) => [x.rows.length, x.emptyText])).toEqual([
      [0, '沒有信用卡'],
      [0, '沒有固定支出'],
      [0, '本月沒有額外消費'],
    ])
    expect(s.status.text).toBe('還沒有資料，先從新增信用卡開始')
  })

  it('圖片內容不含任何備註文字', () => {
    const { input, phone, sTaishin, cathay } = october2026()
    input.occurrences = input.occurrences.map((o) => (o.templateId === phone.id ? paid(phone, '2026-10-05', 720, sTaishin, { note: '秘密備註A' }) : o))
    input.extras = input.extras.map((e) => ({ ...e, note: '秘密備註B' }))
    input.cardMonths = input.cardMonths.map((m) => (m.cardId === cathay.id ? { ...m, note: '秘密備註C' } : m))
    input.templates = input.templates.map((t) => ({ ...t, note: '秘密備註D' }))
    expect(JSON.stringify(build(input))).not.toContain('秘密')
  })
})
