import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { makeYm, parseYm } from '../../domain/ym'
import { Sheet } from '../../ui/Sheet'
import './sheets.css'

export function MonthPickerSheet({
  open,
  onClose,
  value,
  currentYm,
  onPick,
}: {
  open: boolean
  onClose: () => void
  value: string
  currentYm: string
  onPick: (ym: string) => void
}) {
  const [year, setYear] = useState(() => parseYm(value).y)
  useEffect(() => {
    if (open) setYear(parseYm(value).y)
  }, [open, value])

  return (
    <Sheet open={open} onClose={onClose} title="選擇月份">
      <div className="mp-year">
        <button type="button" className="icon-btn" onClick={() => setYear(year - 1)} aria-label="前一年">
          <ChevronLeft size={20} />
        </button>
        <span className="num">{year} 年</span>
        <button type="button" className="icon-btn" onClick={() => setYear(year + 1)} aria-label="後一年">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="mp-grid">
        {Array.from({ length: 12 }, (_, i) => {
          const ym = makeYm(year, i + 1)
          return (
            <button
              key={ym}
              type="button"
              className={`mp-cell${ym === value ? ' is-selected' : ''}${ym === currentYm ? ' is-current' : ''}`}
              onClick={() => onPick(ym)}
            >
              {i + 1} 月
            </button>
          )
        })}
      </div>
      {value !== currentYm && (
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => onPick(currentYm)}>
          回到本月
        </button>
      )}
    </Sheet>
  )
}
