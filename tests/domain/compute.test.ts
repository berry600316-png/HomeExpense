/**
 * 規格第十七章「核心計算及資料一致性」測試。每個 describe 標題標註對應的規格條目編號。
 */
import { describe, expect, it } from 'vitest'
import { computeMonth, type MonthInput } from '../../src/domain/compute'
import {
  card,
  cardSource,
  emptyInput,
  extra,
  marked,
  month,
  october2026,
  otherSource,
  paid,
  template,
} from '../fixtures'

const NOW = '2026-10'

function cardLine(r: ReturnType<typeof computeMonth>, id: string) {
  const c = r.cards.find((x) => x.card.id === id)
  if (!c) throw new Error('card line missing')
  return c
}

describe('核心驗收案例：2026 年 10 月總花費 NT$16,700', () => {
  it('各項數字完全符合規格 4.3', () => {
    const { input, taishin, cathay } = october2026()
    const r = computeMonth('2026-10', input, NOW)
    expect(cardLine(r, taishin.id).variable).toBe(5280)
    expect(cardLine(r, cathay.id).variable).toBe(4000)
    expect(r.totals.cardVariable).toBe(9280)
    expect(r.totals.fixed).toBe(4420)
    expect(r.totals.extra).toBe(3000)
    expect(r.totals.total).toBe(16700)
    expect(r.hasAnomaly).toBe(false)
  })
})

describe('#1 單張信用卡扣除固定支出', () => {
  it('台新 8,000 − 保險 1 2,000 − 電話費 720 = 5,280，扣除明細兩筆', () => {
    const { input, taishin } = october2026()
    const line = cardLine(computeMonth('2026-10', input, NOW), taishin.id)
    expect(line.raw).toBe(8000)
    expect(line.deductions.map((d) => [d.line.template.name, d.amount])).toEqual([
      ['保險 1', 2000],
      ['電話費', 720],
    ])
    expect(line.deductionTotal).toBe(2720)
    expect(line.variable).toBe(5280)
  })
})

describe('#2 多張信用卡各自扣除對應固定支出', () => {
  it('國泰只扣保險 2，不受台新的扣除影響', () => {
    const { input, cathay } = october2026()
    const line = cardLine(computeMonth('2026-10', input, NOW), cathay.id)
    expect(line.deductions.map((d) => d.line.template.name)).toEqual(['保險 2'])
    expect(line.variable).toBe(4000)
  })
})

describe('#3 固定支出由銀行直接付款', () => {
  it('水費 700 計入固定支出，但不從任何信用卡扣除', () => {
    const { input, water } = october2026()
    const r = computeMonth('2026-10', input, NOW)
    const w = r.fixed.find((l) => l.template.id === water.id)!
    expect(w.state).toBe('confirmed')
    expect(w.amount).toBe(700)
    expect(w.deductedFromCardId).toBeNull()
    for (const c of r.cards) expect(c.deductions.some((d) => d.line.template.id === water.id)).toBe(false)
  })
})

describe('#4 額外消費加入本月總花費', () => {
  it('每筆獨立列出，合計加入總花費；其他月份的額外消費不計入', () => {
    const { input } = october2026()
    input.extras.push(extra('現金購物', '2026-10-03', 500), extra('臨時支出', '2026-11-01', 800))
    const r = computeMonth('2026-10', input, NOW)
    expect(r.extras.map((e) => e.name)).toEqual(['現金購物', '額外銀行轉帳購物'])
    expect(r.totals.extra).toBe(3500)
    expect(r.totals.total).toBe(17200)
  })
})

describe('#5 當期金額與預設金額不同', () => {
  it('計算使用當期實際金額，不使用模板預設金額', () => {
    const { input, ins1, taishin } = october2026()
    const occ = input.occurrences.find((o) => o.templateId === ins1.id)!
    occ.amount = 2350
    const r = computeMonth('2026-10', input, NOW)
    expect(ins1.defaultAmount).toBe(2000)
    expect(r.fixed.find((l) => l.template.id === ins1.id)!.amount).toBe(2350)
    expect(cardLine(r, taishin.id).variable).toBe(8000 - 2350 - 720)
    expect(r.totals.total).toBe(16700) // 卡片總額不變 → 總花費不變（只是重新分配）
  })
})

describe('#6 每半年扣款的週期判定', () => {
  it('基準 2026-04 每半年 → 只有 4 月、10 月到期', () => {
    const t = template('富邦醫療險', { cycleMonths: 6, anchorYm: '2026-04', startYm: '2026-01' })
    const input: MonthInput = { ...emptyInput(), templates: [t] }
    const states = ['2026-03', '2026-04', '2026-05', '2026-09', '2026-10', '2026-11', '2027-04', '2027-10'].map(
      (ym) => [ym, computeMonth(ym, input, NOW).fixed[0]!.state],
    )
    expect(states).toEqual([
      ['2026-03', 'not-due'],
      ['2026-04', 'pending'],
      ['2026-05', 'not-due'],
      ['2026-09', 'not-due'],
      ['2026-10', 'pending'],
      ['2026-11', 'not-due'],
      ['2027-04', 'pending'],
      ['2027-10', 'pending'],
    ])
  })
})

describe('#7 非到期月份不計入固定支出', () => {
  it('未到期項目仍顯示（not-due），但金額為 null、不計入合計', () => {
    const { input, ins1 } = october2026()
    const r = computeMonth('2026-11', input, NOW)
    const line = r.fixed.find((l) => l.template.id === ins1.id)!
    expect(line.state).toBe('not-due')
    expect(line.amount).toBeNull()
    expect(r.totals.fixed).toBe(0)
  })
})

describe('#8 到期但未確認不計入支出', () => {
  it('待確認項目不計金額、不從卡片扣除，且月份標示為未完成', () => {
    const { input, ins1, taishin } = october2026()
    input.occurrences = input.occurrences.filter((o) => o.templateId !== ins1.id)
    const r = computeMonth('2026-10', input, NOW)
    expect(r.fixed.find((l) => l.template.id === ins1.id)!.state).toBe('pending')
    expect(r.totals.fixed).toBe(2420)
    expect(cardLine(r, taishin.id).variable).toBe(7280)
    expect(r.pendingFixed).toBe(1)
    expect(r.complete).toBe(false)
  })
})

describe('#9 同一筆固定支出不可重複扣除', () => {
  it('一期只有一個付款來源 → 只出現在一張卡的扣除明細，且只計入固定支出一次', () => {
    const { input, ins1 } = october2026()
    const r = computeMonth('2026-10', input, NOW)
    const appearances = r.cards.flatMap((c) => c.deductions).filter((d) => d.line.template.id === ins1.id)
    expect(appearances).toHaveLength(1)
    expect(r.fixed.filter((l) => l.template.id === ins1.id && l.amount !== null)).toHaveLength(1)
  })

  it('勾選「不在卡片總額內」時不扣除卡片，但仍計入固定支出', () => {
    const { input, ins1, taishin } = october2026()
    input.occurrences.find((o) => o.templateId === ins1.id)!.inCardTotal = false
    const r = computeMonth('2026-10', input, NOW)
    expect(cardLine(r, taishin.id).variable).toBe(7280)
    expect(r.totals.fixed).toBe(4420)
    expect(r.totals.total).toBe(18700)
  })
})

describe('#10 原始信用卡總額尚未填寫', () => {
  it('不當作 0：variable 為 null、狀態 missing、月份未完成；已確認的固定支出照常計入', () => {
    const { input, taishin } = october2026()
    input.cardMonths = input.cardMonths.filter((m) => m.cardId !== taishin.id)
    const r = computeMonth('2026-10', input, NOW)
    const line = cardLine(r, taishin.id)
    expect(line.status).toBe('missing')
    expect(line.raw).toBeNull()
    expect(line.variable).toBeNull()
    expect(line.deductionTotal).toBe(2720)
    expect(r.missingCards).toBe(1)
    expect(r.complete).toBe(false)
    expect(r.totals.cardVariable).toBe(4000)
    expect(r.totals.fixed).toBe(4420)
  })

  it('紀錄存在但金額為 null（只寫了備註）也視為未輸入', () => {
    const c = card('中信信用卡')
    const input: MonthInput = { ...emptyInput(), cards: [c], cardMonths: [month(c, '2026-10', null)] }
    const r = computeMonth('2026-10', input, NOW)
    expect(r.cards[0]!.status).toBe('missing')
    expect(r.missingCards).toBe(1)
  })
})

describe('#11 已確認零消費', () => {
  it('金額 0 → 狀態 zero，算已完成', () => {
    const c = card('中信信用卡')
    const input: MonthInput = { ...emptyInput(), cards: [c], cardMonths: [month(c, '2026-10', 0)] }
    const r = computeMonth('2026-10', input, NOW)
    expect(r.cards[0]!.status).toBe('zero')
    expect(r.cards[0]!.variable).toBe(0)
    expect(r.complete).toBe(true)
  })
})

describe('#12 固定支出超過信用卡總額', () => {
  it('顯示異常與明細，變動消費保留真實負數（不截斷為 0）', () => {
    const { input, taishin } = october2026()
    input.cardMonths.find((m) => m.cardId === taishin.id)!.amount = 2000
    const r = computeMonth('2026-10', input, NOW)
    const line = cardLine(r, taishin.id)
    expect(line.variable).toBe(-720)
    expect(line.exceedsTotal).toBe(true)
    expect(r.hasAnomaly).toBe(true)
    expect(r.issues.some((i) => i.kind === 'deduction-exceeds-total' && i.level === 'anomaly')).toBe(true)
  })

  it('原始總額為負數（退款大於消費）且沒有扣除：只標示需留意，不算異常', () => {
    const c = card('中信信用卡')
    const input: MonthInput = { ...emptyInput(), cards: [c], cardMonths: [month(c, '2026-10', -500)] }
    const r = computeMonth('2026-10', input, NOW)
    expect(r.cards[0]!.rawNegative).toBe(true)
    expect(r.hasAnomaly).toBe(false)
    expect(r.totals.total).toBe(-500)
  })
})

describe('#13 修改歷史繳費來源', () => {
  it('10 月保險 1 改用國泰付 → 10 月扣除改到國泰；其他月份不受影響', () => {
    const { input, ins1, taishin, cathay, sCathay } = october2026()
    const april = paid(ins1, '2026-04-15', 2000, input.sources[0]!)
    input.occurrences.push(april)
    input.cardMonths.push(month(taishin, '2026-04', 6000))
    const before = computeMonth('2026-04', input, NOW)

    input.occurrences.find((o) => o.templateId === ins1.id && o.periodYm === '2026-10')!.sourceId = sCathay.id
    const r = computeMonth('2026-10', input, NOW)
    expect(cardLine(r, taishin.id).variable).toBe(7280)
    expect(cardLine(r, cathay.id).variable).toBe(2000)
    expect(r.totals.total).toBe(16700)
    expect(computeMonth('2026-04', input, NOW)).toEqual(before)
  })

  it('改成銀行轉帳 → 不再從任何卡扣除', () => {
    const { input, ins1, taishin, sBank } = october2026()
    input.occurrences.find((o) => o.templateId === ins1.id)!.sourceId = sBank.id
    const r = computeMonth('2026-10', input, NOW)
    expect(cardLine(r, taishin.id).deductions.map((d) => d.line.template.name)).toEqual(['電話費'])
  })
})

describe('#14 修改保險主檔後歷史金額不變', () => {
  it('改名稱以外的預設金額、預設扣款來源、週期 → 已確認月份的金額與扣除不變', () => {
    const { input, ins1, sCathay } = october2026()
    const before = computeMonth('2026-10', input, NOW)
    ins1.defaultAmount = 9999
    ins1.defaultSourceId = sCathay.id
    ins1.amountMode = 'variable'
    const after = computeMonth('2026-10', input, NOW)
    expect(after.totals).toEqual(before.totals)
    expect(after.cards.map((c) => c.variable)).toEqual(before.cards.map((c) => c.variable))
  })
})

describe('#15 延後扣款不重複認列', () => {
  function deferredCase() {
    const c = card('台新信用卡')
    const s = cardSource(c)
    const t = template('富邦醫療險', { kind: 'insurance', cycleMonths: 6, anchorYm: '2026-04', startYm: '2026-04', defaultAmount: 6000 })
    const input: MonthInput = { ...emptyInput(), cards: [c], sources: [s], templates: [t] }
    return { c, s, t, input }
  }

  it('10 月標記延後：10 月不計、11 月顯示「待確認（10 月期）」', () => {
    const { t, input } = deferredCase()
    input.occurrences.push(marked(t, '2026-10', 'deferred'))
    const oct = computeMonth('2026-10', input, NOW)
    const nov = computeMonth('2026-11', input, NOW)
    expect(oct.fixed.map((l) => l.state)).toEqual(['deferred'])
    expect(oct.totals.fixed).toBe(0)
    expect(nov.fixed.map((l) => [l.state, l.periodYm])).toEqual([['carried', '2026-10']])
    expect(nov.pendingFixed).toBe(1)
    expect(nov.totals.fixed).toBe(0)
  })

  it('延後到 11 月確認：只計入 11 月一次；10 月顯示「實際在其他月份扣款」', () => {
    const { s, t, input } = deferredCase()
    input.occurrences.push(paid(t, '2026-11-05', 6000, s, { periodYm: '2026-10', periodKey: '2026-10' }))
    const results = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-04'].map((ym) => computeMonth(ym, input, NOW))
    const fixedTotals = results.map((r) => r.totals.fixed)
    expect(fixedTotals).toEqual([0, 0, 6000, 0, 0])
    expect(results[1]!.fixed.map((l) => l.state)).toEqual(['paid-other-month'])
    expect(results[2]!.fixed.map((l) => [l.state, l.periodYm])).toEqual([['confirmed', '2026-10']])
    expect(results[2]!.pendingFixed).toBe(0)
    // 延後不移動之後的週期：下一期仍是 2027-04
    expect(results[4]!.fixed.map((l) => l.state)).toEqual(['pending'])
  })

  it('每月項目延後：下個月同時出現「本月期」與「上月延後期」兩行，各自獨立', () => {
    const c = card('台新信用卡')
    const s = cardSource(c)
    const t = template('電話費', { cycleMonths: 1, startYm: '2026-09' })
    const input: MonthInput = {
      ...emptyInput(),
      cards: [c],
      sources: [s],
      templates: [t],
      occurrences: [marked(t, '2026-10', 'deferred')],
    }
    const nov = computeMonth('2026-11', input, NOW)
    expect(nov.fixed.map((l) => [l.state, l.periodYm])).toEqual([
      ['pending', '2026-11'],
      ['carried', '2026-10'],
    ])
    // 兩期都在 11 月確認 → 11 月計兩筆，各一次
    input.occurrences = [
      paid(t, '2026-11-03', 720, s, { periodYm: '2026-10', periodKey: '2026-10' }),
      paid(t, '2026-11-20', 699, s),
    ]
    const nov2 = computeMonth('2026-11', input, NOW)
    expect(nov2.fixed.filter((l) => l.state === 'confirmed').map((l) => l.amount)).toEqual([720, 699])
    expect(nov2.totals.fixed).toBe(1419)
    expect(computeMonth('2026-10', input, NOW).totals.fixed).toBe(0)
  })

  it('本期未扣款：永不計入，也不會帶到下個月', () => {
    const { t, input } = deferredCase()
    input.occurrences.push(marked(t, '2026-10', 'skipped'))
    expect(computeMonth('2026-10', input, NOW).fixed.map((l) => l.state)).toEqual(['skipped'])
    expect(computeMonth('2026-10', input, NOW).pendingFixed).toBe(0)
    expect(computeMonth('2026-11', input, NOW).fixed.map((l) => l.state)).toEqual(['not-due'])
  })
})

describe('#16 月份切換不遺失資料', () => {
  it('依序計算多個月份，輸入資料不被改動，同月份重算結果相同', () => {
    const { input } = october2026()
    const snapshot = structuredClone(input)
    const first = computeMonth('2026-10', input, NOW)
    for (const ym of ['2026-09', '2026-11', '2025-12', '2027-01']) computeMonth(ym, input, NOW)
    expect(input).toEqual(snapshot)
    expect(computeMonth('2026-10', input, NOW)).toEqual(first)
  })
})

describe('#20 停用項目後歷史資料仍可查詢', () => {
  it('卡片 11 月起停用：10 月照常顯示與計算；11 月起不再要求輸入', () => {
    const { input, taishin } = october2026()
    taishin.endYm = '2026-11'
    const oct = computeMonth('2026-10', input, NOW)
    expect(cardLine(oct, taishin.id).variable).toBe(5280)
    expect(oct.totals.total).toBe(16700)
    const nov = computeMonth('2026-11', input, NOW)
    expect(nov.cards.some((c) => c.card.id === taishin.id)).toBe(false)
  })

  it('固定支出停用：歷史期數照常計入，停用後的月份不再到期', () => {
    const { input, ins1 } = october2026()
    ins1.endYm = '2026-11'
    expect(computeMonth('2026-10', input, NOW).totals.fixed).toBe(4420)
    expect(computeMonth('2027-04', input, NOW).fixed.some((l) => l.template.id === ins1.id)).toBe(false)
  })

  it('已停用的卡在某月仍有固定支出扣款 → 該月仍顯示並要求輸入總額', () => {
    const { input, taishin } = october2026()
    taishin.endYm = '2026-10'
    input.cardMonths = input.cardMonths.filter((m) => m.cardId !== taishin.id)
    const r = computeMonth('2026-10', input, NOW)
    const line = cardLine(r, taishin.id)
    expect(line.required).toBe(true)
    expect(line.deductionTotal).toBe(2720)
    expect(r.missingCards).toBe(1)
  })
})

describe('生效區間與完整性（使用者決策 Q3／Q4）', () => {
  it('卡片起始月份之前不出現、不要求輸入', () => {
    const c = card('中信信用卡', { startYm: '2026-12' })
    const input: MonthInput = { ...emptyInput(), cards: [c] }
    const r = computeMonth('2026-10', input, NOW)
    expect(r.cards).toHaveLength(0)
    expect(r.complete).toBe(true)
  })

  it('固定支出追蹤起始月份之前，即使週期對齊也不算到期', () => {
    const t = template('保險', { cycleMonths: 6, anchorYm: '2020-04', startYm: '2026-10' })
    const input: MonthInput = { ...emptyInput(), templates: [t] }
    expect(computeMonth('2026-04', input, NOW).fixed).toHaveLength(0)
    expect(computeMonth('2026-10', input, NOW).fixed.map((l) => l.state)).toEqual(['pending'])
  })

  it('月份階段：過去／本月／未來', () => {
    const input = emptyInput()
    expect(computeMonth('2026-09', input, NOW).phase).toBe('past')
    expect(computeMonth('2026-10', input, NOW).phase).toBe('current')
    expect(computeMonth('2026-11', input, NOW).phase).toBe('future')
  })

  it('沒有任何資料：總花費 0、已完成、無異常', () => {
    const r = computeMonth('2026-10', emptyInput(), NOW)
    expect(r.totals.total).toBe(0)
    expect(r.complete).toBe(true)
    expect(r.cards).toEqual([])
    expect(r.fixed).toEqual([])
  })

  it('不定期項目：本月無紀錄時顯示 irregular-none，不影響完整性；有紀錄時計入', () => {
    const t = template('汽車保養', { cycleMonths: null })
    const s = otherSource('現金', 'cash')
    const input: MonthInput = { ...emptyInput(), templates: [t], sources: [s] }
    const r1 = computeMonth('2026-10', input, NOW)
    expect(r1.fixed.map((l) => l.state)).toEqual(['irregular-none'])
    expect(r1.complete).toBe(true)
    input.occurrences.push(paid(t, '2026-10-08', 3200, s))
    input.occurrences.push(paid(t, '2026-10-28', 800, s))
    const r2 = computeMonth('2026-10', input, NOW)
    expect(r2.fixed.map((l) => [l.state, l.amount])).toEqual([
      ['confirmed', 3200],
      ['confirmed', 800],
    ])
    expect(r2.totals.fixed).toBe(4000)
  })

  it('10 筆以上固定支出全部列出，不截斷', () => {
    const templates = Array.from({ length: 14 }, (_, i) => template(`項目 ${i + 1}`))
    const r = computeMonth('2026-10', { ...emptyInput(), templates }, NOW)
    expect(r.fixed).toHaveLength(14)
  })

  it('三張保單即使都是保險，也各自獨立成行', () => {
    const ts = ['保險 1', '保險 2', '保險 3'].map((n) => template(n, { kind: 'insurance' }))
    const r = computeMonth('2026-10', { ...emptyInput(), templates: ts }, NOW)
    expect(r.fixed.map((l) => l.template.name)).toEqual(['保險 1', '保險 2', '保險 3'])
  })

  it('已確認但缺金額或日期的毀損資料：不計入', () => {
    const t = template('電話費')
    const s = otherSource('銀行')
    const o = paid(t, '2026-10-05', 720, s)
    o.amount = null
    const r = computeMonth('2026-10', { ...emptyInput(), templates: [t], sources: [s], occurrences: [o] }, NOW)
    expect(r.totals.fixed).toBe(0)
  })
})
