import type { FixedLine } from '../../domain/compute'
import { formatMoney } from '../../domain/money'
import { formatYmLabel } from '../../domain/ym'
import { Sheet } from '../../ui/Sheet'
import './sheets.css'

export function PendingFixedSheet({
  open, onClose, lines, notice, canContinue, onSelect, onNext,
}: {
  open: boolean
  onClose: () => void
  lines: readonly FixedLine[]
  notice: string | null
  canContinue: boolean
  onSelect: (line: FixedLine) => void
  onNext: () => void
}) {
  const done = lines.length === 0
  return (
    <Sheet
      open={open}
      onClose={onClose}
      immediateClose
      title={done ? '本月待確認已完成' : `待確認 ${lines.length} 項`}
      subtitle={done ? undefined : '選一項逐筆記錄'}
      footer={done
        ? <button type="button" className="btn btn-primary" onClick={onClose}>完成</button>
        : canContinue
          ? <button type="button" className="btn btn-primary" onClick={onNext}>下一項</button>
          : undefined}
    >
      {notice && <div className="pending-done-notice" role="status">{notice}</div>}
      {done ? (
        <p className="pending-complete">本月待確認項目都已處理。</p>
      ) : (
        <div className="pending-fixed-list">
          {lines.map((line) => (
            <button key={line.key} type="button" className="pending-fixed-row" onClick={() => onSelect(line)}>
              <span className="pending-fixed-name">{line.template.name}</span>
              <span className="pending-fixed-period">{line.periodYm ? `${formatYmLabel(line.periodYm)}期` : ''}{line.state === 'carried' ? ' · 延後' : ''}</span>
              {(line.occurrence?.amount ?? line.template.defaultAmount) !== null && <span className="pending-fixed-reference num">參考 {formatMoney((line.occurrence?.amount ?? line.template.defaultAmount)!)}</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
