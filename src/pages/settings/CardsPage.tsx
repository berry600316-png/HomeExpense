import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import type { CreditCard } from '../../domain/types'
import { formatYmLabel } from '../../domain/ym'
import { Loading, PageHeader } from './common'

function remindShort(n: number): string {
  return n === 0 ? '當天提醒' : `${n} 天前提醒`
}

function cardSub(c: CreditCard): string {
  return [c.bank, c.dueDay ? `每月 ${c.dueDay} 日截止 · ${remindShort(c.remindDays)}` : '未設截止日', c.endYm ? `${formatYmLabel(c.endYm)}起停用` : null]
    .filter(Boolean)
    .join(' · ')
}

/** 信用卡清單。卡片順序在「扣款來源」頁調整（使用者 2026-10-23），這裡只依順序顯示。 */
export function CardsPage() {
  const cards = useLiveQuery(() => db.cards.orderBy('order').toArray())
  if (!cards) return <Loading />
  const active = cards.filter((c) => c.endYm === null)
  const archived = cards.filter((c) => c.endYm !== null)

  const row = (c: CreditCard) => (
    <Link key={c.id} to={`/settings/cards/${c.id}`} className={`list-row${c.endYm ? ' is-archived' : ''}`}>
      <span className="grow">
        <div className="title">
          {c.name}
          {c.tag && <span className="tag">{c.tag}</span>}
        </div>
        <div className="sub">{cardSub(c)}</div>
      </span>
      <ChevronRight size={18} className="trail" />
    </Link>
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
      <p className="page-lead">每個月在首頁點卡片輸入銀行 App 查到的當月消費總額。不需要也不會要求完整卡號。卡片的先後順序在「扣款來源」調整。</p>
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
        <div className="group">{active.map(row)}</div>
      )}
      {archived.length > 0 && (
        <>
          <h2 className="group-title">已停用（歷史資料保留）</h2>
          <div className="group">{archived.map(row)}</div>
        </>
      )}
    </main>
  )
}
