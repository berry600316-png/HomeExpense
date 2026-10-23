import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight, ChevronUp, CreditCard, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../db/db'
import { createSource, deleteSource, isSourceUsed, swapCardOrder, swapSourceOrder, updateSource } from '../../db/repo'
import type { PaymentSource, SourceKind } from '../../domain/types'
import { Field, Segmented, TextArea, useFieldId } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'
import { Loading, PageHeader } from './common'

type OtherKind = Exclude<SourceKind, 'card'>
const KIND_LABEL: Record<SourceKind, string> = { card: '信用卡', bank: '銀行帳戶', cash: '現金', other: '其他' }

/**
 * 扣款來源。兩組各自可用 ︿﹀ 調整順序（樣式同固定支出頁，使用者 2026-10-23）：
 * - 銀行／現金／其他：調整來源自己的順序（扣款下拉選單依此排列）。
 * - 信用卡：調整的是卡片本身的順序，首頁、分享圖片、信用卡管理、下拉選單都跟著變（卡費提醒依截止日排序，不受影響）。
 * 停用的項目不參加排序。
 */
export function SourcesPage() {
  const toast = useToast()
  const sources = useLiveQuery(() => db.sources.orderBy('order').toArray())
  const cards = useLiveQuery(() => db.cards.toArray())
  const [editing, setEditing] = useState<PaymentSource | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  if (!sources || !cards) return <Loading />
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const cardName = (s: PaymentSource) => (s.cardId ? cardById.get(s.cardId)?.name : undefined) ?? s.name
  const cardOrder = (s: PaymentSource) => (s.cardId ? (cardById.get(s.cardId)?.order ?? s.order) : s.order)
  const cardSrc = sources.filter((s) => s.kind === 'card').sort((a, b) => cardOrder(a) - cardOrder(b))
  const activeCardSrc = cardSrc.filter((s) => !s.archived)
  const archivedCardSrc = cardSrc.filter((s) => s.archived)
  const others = sources.filter((s) => s.kind !== 'card')
  const activeOthers = others.filter((s) => !s.archived)
  const archivedOthers = others.filter((s) => s.archived)

  const move = async (list: PaymentSource[], i: number, dir: -1 | 1) => {
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b || busy) return
    setBusy(true)
    try {
      if (a.kind === 'card') await swapCardOrder(a.cardId!, b.cardId!)
      else await swapSourceOrder(a.id, b.id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const orderBtns = (list: PaymentSource[], i: number) => (
    <span className="order-btns">
      <button type="button" aria-label="往上移" disabled={i === 0 || busy} onClick={() => void move(list, i, -1)}>
        <ChevronUp size={18} />
      </button>
      <button type="button" aria-label="往下移" disabled={i === list.length - 1 || busy} onClick={() => void move(list, i, 1)}>
        <ChevronDown size={18} />
      </button>
    </span>
  )

  const otherRow = (s: PaymentSource, i: number, list: PaymentSource[] | null) => (
    <div key={s.id} className={`list-row${s.archived ? ' is-archived' : ''}`}>
      <button type="button" className="grow row-open" onClick={() => setEditing(s)}>
        <div className="title">{s.name}</div>
        <div className="sub">
          {KIND_LABEL[s.kind]}
          {s.archived ? ' · 已停用' : ''}
        </div>
      </button>
      {list ? orderBtns(list, i) : <ChevronRight size={18} className="trail" />}
    </div>
  )

  const cardRow = (s: PaymentSource, i: number, list: PaymentSource[] | null) => (
    <div key={s.id} className={`list-row${s.archived ? ' is-archived' : ''}`}>
      <Link to={`/settings/cards/${s.cardId}`} className="grow row-open">
        <div className="title">
          <CreditCard size={15} className="row-icon" />
          {cardName(s)}
        </div>
        <div className="sub">{s.archived ? '已停用' : '在信用卡管理修改'}</div>
      </Link>
      {list ? orderBtns(list, i) : <ChevronRight size={18} className="trail" />}
    </div>
  )

  return (
    <main>
      <PageHeader
        title="扣款來源"
        action={
          <button type="button" className="icon-btn" aria-label="新增扣款來源" style={{ color: 'var(--c-accent)' }} onClick={() => setEditing('new')}>
            <Plus size={22} />
          </button>
        }
      />
      <p className="page-lead">
        「信用卡」來源會從該卡月總額扣除；「銀行、現金、其他」只計入支出、不從任何卡扣除。銀行帳戶只需要名稱，不連線銀行、不記餘額。
      </p>

      <h2 className="group-title">銀行／現金／其他</h2>
      <div className="group">
        {others.length === 0 && (
          <div className="empty">
            <p>還沒有，例如「銀行轉帳」「現金」</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')}>
              新增
            </button>
          </div>
        )}
        {activeOthers.map((s, i) => otherRow(s, i, activeOthers))}
        {archivedOthers.map((s, i) => otherRow(s, i, null))}
      </div>

      <h2 className="group-title">信用卡（新增卡片時自動建立；這裡的順序也是首頁的卡片順序）</h2>
      <div className="group">
        {cardSrc.length === 0 && <div className="empty"><p>沒有信用卡</p></div>}
        {activeCardSrc.map((s, i) => cardRow(s, i, activeCardSrc))}
        {archivedCardSrc.map((s, i) => cardRow(s, i, null))}
      </div>

      <SourceSheet editing={editing} onClose={() => setEditing(null)} />
    </main>
  )
}

function SourceSheet({ editing, onClose }: { editing: PaymentSource | 'new' | null; onClose: () => void }) {
  const toast = useToast()
  const ids = { name: useFieldId(), note: useFieldId() }
  const isNew = editing === 'new'
  const src = editing && editing !== 'new' ? editing : null
  const [kind, setKind] = useState<OtherKind>('bank')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const used = useLiveQuery(() => (src ? isSourceUsed(src.id) : false), [src?.id])

  useEffect(() => {
    if (!editing) return
    setKind(src ? (src.kind as OtherKind) : 'bank')
    setName(src?.name ?? '')
    setNote(src?.note ?? '')
  }, [editing, src])

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
      title={isNew ? '新增扣款來源' : '編輯扣款來源'}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void run(() => (isNew ? createSource(kind, name, note) : updateSource(src!.id, { name, note, kind })), isNew ? '已新增' : '已儲存')}
        >
          {isNew ? '新增' : '儲存'}
        </button>
      }
    >
      <div className="form">
        <Field label="種類">
          <Segmented
            label="種類"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bank', label: '銀行帳戶' },
              { value: 'cash', label: '現金' },
              { value: 'other', label: '其他' },
            ]}
          />
        </Field>
        <Field label="名稱" htmlFor={ids.name}>
          <input id={ids.name} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="例如：郵局轉帳" />
        </Field>
        <Field label="備註（選填）" htmlFor={ids.note}>
          <TextArea id={ids.note} value={note} onChange={setNote} rows={2} />
        </Field>
        {src && (
          <div className="danger-zone" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => void run(() => updateSource(src.id, { archived: !src.archived }), src.archived ? '已重新啟用' : '已停用')}>
              {src.archived ? '重新啟用' : '停用（歷史紀錄保留）'}
            </button>
            {used === false && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (window.confirm(`刪除「${src.name}」？`)) void run(() => deleteSource(src.id), '已刪除')
                }}
              >
                刪除（沒有任何紀錄）
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
