import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { swapCardOrder } from '../../db/repo'
import type { CreditCard } from '../../domain/types'
import { formatYmLabel } from '../../domain/ym'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

function remindShort(n: number): string {
  return n === 0 ? '當天提醒' : `${n} 天前提醒`
}

function cardSub(c: CreditCard): string {
  return [c.bank, c.dueDay ? `每月 ${c.dueDay} 日截止 · ${remindShort(c.remindDays)}` : '未設截止日', c.endYm ? `${formatYmLabel(c.endYm)}起停用` : null]
    .filter(Boolean)
    .join(' · ')
}

export function CardsPage() {
  const toast = useToast()
  const cards = useLiveQuery(() => db.cards.orderBy('order').toArray())
  // 「調整順序」模式：平常不顯示上移／下移按鈕，避免點卡片時誤觸（使用者 2026-10-23）
  const [sorting, setSorting] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!cards) return <Loading />
  const active = cards.filter((c) => c.endYm === null)
  const archived = cards.filter((c) => c.endYm !== null)

  const move = async (i: number, dir: -1 | 1) => {
    const a = active[i]
    const b = active[i + dir]
    if (!a || !b || busy) return
    setBusy(true)
    try {
      await swapCardOrder(a.id, b.id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const info = (c: CreditCard) => (
    <>
      <div className="title">
        {c.name}
        {c.tag && <span className="tag">{c.tag}</span>}
      </div>
      <div className="sub">{cardSub(c)}</div>
    </>
  )

  const linkRow = (c: CreditCard) => (
    <Link key={c.id} to={`/settings/cards/${c.id}`} className={`list-row${c.endYm ? ' is-archived' : ''}`}>
      <span className="grow">{info(c)}</span>
      <ChevronRight size={18} className="trail" />
    </Link>
  )

  const sortRow = (c: CreditCard, i: number) => (
    <div key={c.id} className="list-row">
      <span className="grow">{info(c)}</span>
      <span className="reorder-btns">
        <button type="button" className="reorder-btn" disabled={i === 0 || busy} onClick={() => void move(i, -1)} aria-label={`${c.name} 往上移`}>
          <ArrowUp size={18} />
          上移
        </button>
        <button
          type="button"
          className="reorder-btn"
          disabled={i === active.length - 1 || busy}
          onClick={() => void move(i, 1)}
          aria-label={`${c.name} 往下移`}
        >
          <ArrowDown size={18} />
          下移
        </button>
      </span>
    </div>
  )

  return (
    <main>
      <PageHeader
        title="信用卡管理"
        action={
          sorting ? undefined : (
            <Link to="/settings/cards/new" className="icon-btn" aria-label="新增信用卡" style={{ color: 'var(--c-accent)' }}>
              <Plus size={22} />
            </Link>
          )
        }
      />
      {sorting ? (
        <p className="page-lead">按「上移」「下移」調整順序，首頁、分享圖片與卡費提醒都會照這個順序排列。調好按「完成」。</p>
      ) : (
        <p className="page-lead">每個月在首頁點卡片輸入銀行 App 查到的當月消費總額。不需要也不會要求完整卡號。</p>
      )}
      {active.length >= 2 && (
        <div className="list-tools">
          <button type="button" className={`btn ${sorting ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSorting(!sorting)}>
            {sorting ? '完成' : '調整順序'}
          </button>
        </div>
      )}
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
        <div className="group">{active.map((c, i) => (sorting ? sortRow(c, i) : linkRow(c)))}</div>
      )}
      {archived.length > 0 && !sorting && (
        <>
          <h2 className="group-title">已停用（歷史資料保留）</h2>
          <div className="group">{archived.map(linkRow)}</div>
        </>
      )}
    </main>
  )
}
