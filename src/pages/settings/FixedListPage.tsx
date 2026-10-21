import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { updateTemplate } from '../../db/repo'
import { formatMoney } from '../../domain/money'
import { cycleLabel } from '../../domain/schedule'
import type { FixedTemplate } from '../../domain/types'
import { formatYmLabel } from '../../domain/ym'
import { sourceLabel, useAllData, useLookups } from '../../hooks/useData'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

type Filter = { kind: 'all' } | { kind: 'general' } | { kind: 'insurance' } | { kind: 'ben'; id: string | null }

export function FixedListPage() {
  const data = useAllData()
  const lk = useLookups(data)
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  if (!data || !lk) return <Loading />

  const sorted = [...data.templates].sort((a, b) => a.order - b.order)
  const match = (t: FixedTemplate) => {
    if (filter.kind === 'all') return true
    if (filter.kind === 'general') return t.kind === 'general'
    if (filter.kind === 'insurance') return t.kind === 'insurance'
    return t.kind === 'insurance' && (lk.insuranceByTemplate.get(t.id)?.beneficiaryId ?? null) === filter.id
  }
  const active = sorted.filter((t) => t.endYm === null && match(t))
  const archived = sorted.filter((t) => t.endYm !== null && match(t))
  const bens = data.beneficiaries.filter((b) => !b.archived).sort((a, b) => a.order - b.order)
  const hasUnassigned = data.templates.some((t) => t.kind === 'insurance' && !lk.insuranceByTemplate.get(t.id)?.beneficiaryId)
  const isOn = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter)

  const move = async (list: FixedTemplate[], i: number, dir: -1 | 1) => {
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b) return
    try {
      await updateTemplate(a.id, { order: b.order }, undefined)
      await updateTemplate(b.id, { order: a.order }, undefined)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const row = (t: FixedTemplate, i: number, list: FixedTemplate[], sortable: boolean) => {
    const ins = lk.insuranceByTemplate.get(t.id)
    const who = ins?.beneficiaryId ? lk.beneficiaryById.get(ins.beneficiaryId)?.name : null
    const sub = [
      who,
      cycleLabel(t.cycleMonths),
      t.defaultAmount !== null ? `${t.amountMode === 'fixed' ? '' : '約 '}${formatMoney(t.defaultAmount)}` : t.amountMode === 'variable' ? '每期金額不同' : null,
      sourceLabel(data, t.defaultSourceId) || null,
      t.endYm ? `${formatYmLabel(t.endYm)}起停用` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <div key={t.id} className={`list-row${t.endYm ? ' is-archived' : ''}`}>
        <Link to={`/settings/fixed/${t.id}`} className="grow" style={{ display: 'block' }}>
          <div className="title">
            {t.name}
            {t.kind === 'insurance' && <span className="tag tag-ins">保險</span>}
          </div>
          <div className="sub">{sub}</div>
        </Link>
        {sortable && filter.kind === 'all' && (
          <span className="order-btns">
            <button type="button" aria-label="往上移" disabled={i === 0} onClick={() => void move(list, i, -1)}>
              <ChevronUp size={18} />
            </button>
            <button type="button" aria-label="往下移" disabled={i === list.length - 1} onClick={() => void move(list, i, 1)}>
              <ChevronDown size={18} />
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <main>
      <PageHeader title="固定支出與保險" />
      <div className="inline-actions" style={{ marginBottom: 12 }}>
        <Link to="/settings/fixed/new" className="btn btn-secondary btn-sm">
          <Plus size={16} /> 固定支出
        </Link>
        <Link to="/settings/fixed/new?kind=insurance" className="btn btn-secondary btn-sm">
          <Plus size={16} /> 保險
        </Link>
      </div>
      <div className="filter-row" role="group" aria-label="篩選">
        <button type="button" aria-pressed={isOn({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })}>
          全部
        </button>
        <button type="button" aria-pressed={isOn({ kind: 'general' })} onClick={() => setFilter({ kind: 'general' })}>
          一般
        </button>
        <button type="button" aria-pressed={isOn({ kind: 'insurance' })} onClick={() => setFilter({ kind: 'insurance' })}>
          所有保險
        </button>
        {bens.map((b) => (
          <button key={b.id} type="button" aria-pressed={isOn({ kind: 'ben', id: b.id })} onClick={() => setFilter({ kind: 'ben', id: b.id })}>
            {b.name}的保險
          </button>
        ))}
        {hasUnassigned && (
          <button type="button" aria-pressed={isOn({ kind: 'ben', id: null })} onClick={() => setFilter({ kind: 'ben', id: null })}>
            未指定對象
          </button>
        )}
      </div>
      {active.length === 0 ? (
        <div className="group">
          <div className="empty">
            <p>{filter.kind === 'all' ? '還沒有固定支出，例如保險、電話費、水電費' : '沒有符合的項目'}</p>
          </div>
        </div>
      ) : (
        <div className="group">{active.map((t, i) => row(t, i, active, true))}</div>
      )}
      {archived.length > 0 && (
        <>
          <h2 className="group-title">已停用（歷史紀錄保留）</h2>
          <div className="group">{archived.map((t, i) => row(t, i, archived, false))}</div>
        </>
      )}
    </main>
  )
}
