import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixedLine, MonthResult } from '../src/domain/compute'
import { HomePage } from '../src/pages/home/HomePage'

const fixed = (key: string, name: string, periodYm = '2026-11', state: FixedLine['state'] = 'pending'): FixedLine => ({
  key, state, periodYm, occurrence: null, amount: null, deductedFromCardId: null,
  template: { id: key, name, order: key.charCodeAt(0), defaultAmount: 100, cycleMonths: 1, anchorDay: 1, defaultSourceId: null },
} as FixedLine)

const makeResult = (): MonthResult => ({
  ym: '2026-11', phase: 'current', cards: [], fixed: [fixed('a', '甲'), fixed('b', '乙', '2026-10', 'carried'), fixed('c', '丙')], extras: [],
  totals: { cardVariable: 0, fixed: 0, extra: 0, total: 0 }, missingCards: 0, pendingFixed: 3, complete: false, hasAnomaly: false, issues: [],
})
let result = makeResult()
beforeEach(() => { result = makeResult() })
afterEach(cleanup)

vi.mock('../src/hooks/useToday', () => ({ useToday: () => '2026-11-08' }))
vi.mock('../src/hooks/useData', () => ({
  useAllData: () => ({ cards: [], cardMonths: [], sources: [], templates: [], occurrences: [], extras: [], insurance: [], beneficiaries: [], cardBills: [], monthNotes: [] }),
  useLookups: () => ({ insuranceByTemplate: new Map(), beneficiaryById: new Map(), sourceById: new Map(), monthNoteByYm: new Map(), cardBillByKey: new Map() }),
  useMonthResult: () => result,
  sourceLabel: () => '',
}))
vi.mock('../src/pages/home/ReminderBanner', () => ({ ReminderBanner: () => null }))
vi.mock('../src/pages/home/BackupHint', () => ({ BackupHint: () => null }))
vi.mock('../src/pages/sheets/CardMonthSheet', () => ({ CardMonthSheet: () => null }))
vi.mock('../src/pages/sheets/ExtraSheet', () => ({ ExtraSheet: () => null }))
vi.mock('../src/pages/sheets/MonthNoteSheet', () => ({ MonthNoteSheet: () => null }))
vi.mock('../src/pages/sheets/MonthPickerSheet', () => ({ MonthPickerSheet: () => null }))
vi.mock('../src/pages/sheets/ShareSheet', () => ({ ShareSheet: () => null }))
vi.mock('../src/pages/sheets/FixedLineSheet', () => ({
  FixedLineSheet: ({ open, line, onHandled, onClose }: { open: boolean; line: FixedLine | null; onHandled?: (line: FixedLine, action: 'confirmed' | 'skipped') => void; onClose: () => void }) =>
    open && line ? <div data-testid="fixed-form">
      <span>{line.template.name}</span>
      <button onClick={() => onHandled?.(line, 'confirmed')}>確認</button>
      <button onClick={() => onHandled?.(line, 'skipped')}>未扣款</button>
      <button onClick={onClose}>返回</button>
    </div> : null,
}))

describe('pending fixed expense flow', () => {
  it('reopens with only the items still pending in the latest month result', () => {
    const view = render(<MemoryRouter><HomePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '待確認 3 項' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '待確認 3 項' })).getByRole('button', { name: /甲/ }))
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    result = { ...result, fixed: result.fixed.filter((line) => line.key !== 'a'), pendingFixed: 2 }
    view.rerender(<MemoryRouter><HomePage /></MemoryRouter>)
    fireEvent.click(within(screen.getByRole('dialog', { name: '待確認 2 項' })).getByRole('button', { name: '關閉' }))
    fireEvent.click(screen.getByRole('button', { name: '待確認 2 項' }))
    const list = screen.getByRole('dialog', { name: '待確認 2 項' })
    expect(within(list).queryByRole('button', { name: /甲/ })).toBeNull()
    expect(within(list).getByRole('button', { name: /乙/ })).toBeTruthy()
  })

  it('lists due periods, returns after confirmation, wraps to the next item, and completes', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '待確認 3 項' }))
    const list = screen.getByRole('dialog', { name: '待確認 3 項' })
    expect(within(list).getByText('2026 年 10 月期 · 延後')).toBeTruthy()
    fireEvent.click(within(list).getByRole('button', { name: /丙/ }))
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    expect(screen.getByRole('dialog', { name: '待確認 2 項' })).toBeTruthy()
    expect(screen.getByText('已記錄丙')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下一項' }))
    expect(within(screen.getByTestId('fixed-form')).getByText('甲')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '未扣款' }))
    expect(within(screen.getByTestId('fixed-form')).getByText('乙')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    expect(screen.getByRole('dialog', { name: '本月待確認已完成' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.queryByRole('dialog', { name: '本月待確認已完成' })).toBeNull()
  })
})
