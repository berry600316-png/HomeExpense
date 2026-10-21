import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { createBeneficiary, deleteBeneficiary, updateBeneficiary } from '../../db/repo'
import type { Beneficiary } from '../../domain/types'
import { Field, useFieldId } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

export function BeneficiariesPage() {
  const bens = useLiveQuery(() => db.beneficiaries.orderBy('order').toArray())
  const insurance = useLiveQuery(() => db.insurance.toArray())
  const [editing, setEditing] = useState<Beneficiary | 'new' | null>(null)
  if (!bens || !insurance) return <Loading />
  const countOf = (id: string) => insurance.filter((i) => i.beneficiaryId === id).length

  return (
    <main>
      <PageHeader
        title="保險歸屬對象"
        action={
          <button type="button" className="icon-btn" aria-label="新增歸屬對象" style={{ color: 'var(--c-accent)' }} onClick={() => setEditing('new')}>
            <Plus size={22} />
          </button>
        }
      />
      <p className="page-lead">標示每張保單屬於誰（例如爸爸、媽媽、自己）。只用來分類查詢，不影響金額計算。</p>
      <div className="group">
        {bens.length === 0 && (
          <div className="empty">
            <p>還沒有歸屬對象</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
              新增
            </button>
          </div>
        )}
        {bens.map((b) => (
          <button key={b.id} type="button" className={`list-row${b.archived ? ' is-archived' : ''}`} onClick={() => setEditing(b)}>
            <span className="grow">
              <div className="title">{b.name}</div>
              <div className="sub">
                {countOf(b.id)} 張保單{b.archived ? ' · 已停用' : ''}
              </div>
            </span>
            <ChevronRight size={18} className="trail" />
          </button>
        ))}
      </div>
      <p className="page-lead" style={{ marginTop: 12 }}>
        要查看某人的所有保單，請到 <Link to="/settings/fixed">固定支出與保險</Link> 用上方篩選。
      </p>
      <BenSheet editing={editing} count={editing && editing !== 'new' ? countOf(editing.id) : 0} onClose={() => setEditing(null)} />
    </main>
  )
}

function BenSheet({ editing, count, onClose }: { editing: Beneficiary | 'new' | null; count: number; onClose: () => void }) {
  const toast = useToast()
  const nameId = useFieldId()
  const b = editing && editing !== 'new' ? editing : null
  const [name, setName] = useState('')
  useEffect(() => {
    if (editing) setName(b?.name ?? '')
  }, [editing, b])

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      toast(msg)
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <Sheet
      open={editing !== null}
      onClose={onClose}
      title={b ? '編輯歸屬對象' : '新增歸屬對象'}
      footer={
        <button type="button" className="btn btn-primary" onClick={() => void run(() => (b ? updateBeneficiary(b.id, { name }) : createBeneficiary(name)), b ? '已儲存' : '已新增')}>
          {b ? '儲存' : '新增'}
        </button>
      }
    >
      <div className="form">
        <Field label="名稱" htmlFor={nameId}>
          <input id={nameId} className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="例如：爸爸" />
        </Field>
        {b && (
          <div className="danger-zone" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => void run(() => updateBeneficiary(b.id, { archived: !b.archived }), b.archived ? '已重新啟用' : '已停用')}>
              {b.archived ? '重新啟用' : '停用'}
            </button>
            {count === 0 && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`刪除「${b.name}」？`)) void run(() => deleteBeneficiary(b.id), '已刪除')
                }}
              >
                刪除（沒有任何保單）
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
