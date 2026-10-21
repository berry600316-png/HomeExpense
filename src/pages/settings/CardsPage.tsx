import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { updateCard } from '../../db/repo'
import type { CreditCard } from '../../domain/types'
import { formatYmLabel, todayYmd } from '../../domain/ym'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

export function CardsPage() {
  const toast = useToast()
  const cards = useLiveQuery(() => db.cards.orderBy('order').toArray())
  if (!cards) return <Loading />
  const active = cards.filter((c) => c.endYm === null)
  const archived = cards.filter((c) => c.endYm !== null)

  const move = async (list: CreditCard[], i: number, dir: -1 | 1) => {
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b) return
    try {
      const today = todayYmd()
      await updateCard(a.id, { order: b.order }, today)
      await updateCard(b.id, { order: a.order }, today)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const row = (c: CreditCard, i: number, list: CreditCard[], sortable: boolean) => (
    <div key={c.id} className={`list-row${c.endYm ? ' is-archived' : ''}`}>
      <Link to={`/settings/cards/${c.id}`} className="grow" style={{ display: 'block' }}>
        <div className="title">
          {c.name}
          {c.tag && <span className="tag">{c.tag}</span>}
        </div>
        <div className="sub">
          {[c.bank, c.dueDay ? `每月 ${c.dueDay} 日截止` : '未設截止日', c.endYm ? `${formatYmLabel(c.endYm)}起停用` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </Link>
      {sortable ? (
        <span className="order-btns">
          <button type="button" aria-label="往上移" disabled={i === 0} onClick={() => void move(list, i, -1)}>
            <ChevronUp size={18} />
          </button>
          <button type="button" aria-label="往下移" disabled={i === list.length - 1} onClick={() => void move(list, i, 1)}>
            <ChevronDown size={18} />
          </button>
        </span>
      ) : (
        <ChevronRight size={18} className="trail" />
      )}
    </div>
  )

  return (
    <main>
      <PageHeader
        title="信用卡管理"
        action={
          <Link to="/settings/cards/new" className="icon-btn" aria-label="新增信用卡" style={{ color: 'var(--c-accent)' }}>
            <Plus size={22} />
          </Link>
        }
      />
      <p className="page-lead">每個月在首頁點卡片輸入銀行 App 查到的當月消費總額。不需要也不會要求完整卡號。</p>
      {active.length === 0 ? (
        <div className="group">
          <div className="empty">
            <p>還沒有信用卡</p>
            <Link to="/settings/cards/new" className="btn btn-primary btn-sm">
              新增第一張信用卡
            </Link>
          </div>
        </div>
      ) : (
        <div className="group">{active.map((c, i) => row(c, i, active, true))}</div>
      )}
      {archived.length > 0 && (
        <>
          <h2 className="group-title">已停用（歷史資料保留）</h2>
          <div className="group">{archived.map((c, i) => row(c, i, archived, false))}</div>
        </>
      )}
    </main>
  )
}
