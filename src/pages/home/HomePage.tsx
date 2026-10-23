import { ChevronLeft, ChevronRight, CreditCard, NotebookPen, Plus, Settings, Share } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { FixedLine } from '../../domain/compute'
import { formatMoney } from '../../domain/money'
import { addMonths, formatYmdShort, isValidYm, parseYm, ymOf } from '../../domain/ym'
import { useAllData, useLookups, useMonthResult } from '../../hooks/useData'
import { useToday } from '../../hooks/useToday'
import { BackupHint } from './BackupHint'
import { CardMonthSheet } from '../sheets/CardMonthSheet'
import { ExtraSheet } from '../sheets/ExtraSheet'
import { FixedLineSheet } from '../sheets/FixedLineSheet'
import { MonthNoteSheet } from '../sheets/MonthNoteSheet'
import { MonthPickerSheet } from '../sheets/MonthPickerSheet'
import { ShareSheet } from '../sheets/ShareSheet'
import { ReminderBanner } from './ReminderBanner'
import { cardSub, extraCaption, fixedCaption, fixedMeta, fixedSlot, isQuietLine, makeLabels, monthStatus } from './homeText'
import { buildShareSummary } from './shareSummary'
import './home.css'

import { APP_NAME } from '../../appInfo'

/** 依金額字串長度給字級 class（CSS 無法依內容自動縮字）。 */
function numSizeClass(text: string, normalMax: number, longMax: number): string {
  if (text.length <= normalMax) return ''
  return text.length <= longMax ? ' is-long' : ' is-xlong'
}

type SheetState =
  | { kind: 'none' }
  | { kind: 'month' }
  | { kind: 'note' }
  | { kind: 'share' }
  | { kind: 'card'; cardId: string }
  | { kind: 'fixed'; line: FixedLine }
  | { kind: 'extra'; id: string | null }

export function HomePage() {
  const today = useToday()
  const currentYm = ymOf(today)
  const [params, setParams] = useSearchParams()
  const qm = params.get('m')
  const ym = qm && isValidYm(qm) ? qm : currentYm
  const setYm = useCallback(
    (next: string) => setParams(next === currentYm ? {} : { m: next }, { replace: true }),
    [setParams, currentYm],
  )

  const data = useAllData()
  const lk = useLookups(data)
  const labels = useMemo(() => (data && lk ? makeLabels(data, lk) : null), [data, lk])
  const r = useMonthResult(data, ym, currentYm)
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' })
  const close = useCallback(() => setSheet({ kind: 'none' }), [])
  const summary = useMemo(() => (r && labels ? buildShareSummary(r, labels, today) : null), [r, labels, today])

  const { y, m } = parseYm(ym)
  const status = r ? monthStatus(r) : null
  const note = lk?.monthNoteByYm.get(ym)?.note.trim() ?? ''
  const heroNum = r ? new Intl.NumberFormat('en-US').format(Math.abs(r.totals.total)) : '—'

  return (
    <main className="home">
      <header className="home-top">
        <span className="home-app">{APP_NAME}</span>
        <Link to="/settings" className="icon-btn home-gear" aria-label="設定">
          <Settings size={20} strokeWidth={1.8} />
        </Link>
      </header>

      {data && <ReminderBanner data={data} today={today} />}
      {data && <BackupHint />}

      <section className="hero" aria-label="本月總花費">
        <div className="hero-month">
          <button type="button" className="hero-arrow" onClick={() => setYm(addMonths(ym, -1))} aria-label="上個月">
            <ChevronLeft size={24} />
          </button>
          <button type="button" className="hero-month-label" onClick={() => setSheet({ kind: 'month' })}>
            {y} 年 {m} 月
          </button>
          <button type="button" className="hero-arrow" onClick={() => setYm(addMonths(ym, 1))} aria-label="下個月">
            <ChevronRight size={24} />
          </button>
        </div>
        <div className="hero-cap">本月總花費</div>
        <div className={`hero-total num${numSizeClass(heroNum, 7, 10)}`}>
          <small>NT$</small>
          {heroNum}
          {r && r.totals.total < 0 && <span className="hero-neg">（負數）</span>}
        </div>
        {status && <div className={`hero-status tone-${status.tone}`}>{status.text}</div>}
        <div className="hero-foot">
          {ym !== currentYm && (
            <button type="button" className="hero-pill" onClick={() => setYm(currentYm)}>
              回到本月
            </button>
          )}
          {summary && (
            <button type="button" className="hero-pill" onClick={() => setSheet({ kind: 'share' })}>
              <Share size={15} />
              分享給家人
            </button>
          )}
        </div>
      </section>

      {r && data && lk && labels && (
        <>
          <section className="panel" aria-label="信用卡變動消費">
            <h2 className="panel-title">信用卡變動消費</h2>
            {r.cards.length === 0 ? (
              <div className="empty">
                <CreditCard size={24} strokeWidth={1.6} />
                <p>還沒有信用卡</p>
                <Link to="/settings/cards" className="btn btn-secondary btn-sm">
                  新增信用卡
                </Link>
              </div>
            ) : (
              r.cards.map((c) => {
                const sub = cardSub(c)
                return (
                  <button key={c.card.id} type="button" className="card-row" onClick={() => setSheet({ kind: 'card', cardId: c.card.id })}>
                    <span className="card-row-main">
                      <span className="card-row-name">{c.card.name}</span>
                      <span className={`card-row-sub tone-${sub.tone}`}>{sub.text}</span>
                    </span>
                    <span className={`card-row-amt num${c.variable !== null && c.variable < 0 ? ' t-danger' : ''}`}>
                      {c.variable === null ? <span className="t-muted">未輸入</span> : formatMoney(c.variable)}
                    </span>
                    <ChevronRight className="chev" size={18} />
                  </button>
                )
              })
            )}
            {r.cards.length > 0 && (
              <div className="panel-foot">
                <span>合計{r.missingCards > 0 ? `（${r.missingCards} 張未輸入）` : ''}</span>
                <span className="num">{formatMoney(r.totals.cardVariable)}</span>
              </div>
            )}
          </section>

          {/* 下方兩欄：等高，小計放在標題下方（使用者 2026-10-21 選定 A1） */}
          <div className="split">
            <section className="panel panel-half" aria-label="固定支出">
              <div className="half-head">
                <h2 className="half-title">固定支出</h2>
                <div className={`half-total num${numSizeClass(formatMoney(r.totals.fixed), 8, 11)}`}>{formatMoney(r.totals.fixed)}</div>
                <div className="half-cap">
                  {fixedCaption(r).map((p, i) => (
                    <span key={i} className={`tone-${p.tone}`}>
                      {i > 0 && ' · '}
                      {p.text}
                    </span>
                  ))}
                </div>
              </div>
              {r.fixed.length === 0 ? (
                <div className="empty empty-sm">
                  <p>尚無項目</p>
                  <Link to="/settings/fixed" className="btn btn-secondary btn-sm">
                    新增
                  </Link>
                </div>
              ) : (
                r.fixed.map((line) => {
                  const meta = fixedMeta(line, ym, labels)
                  const slot = fixedSlot(line)
                  return (
                    <button
                      key={line.key}
                      type="button"
                      className={`mini-row${isQuietLine(line) ? ' is-quiet' : ''}`}
                      onClick={() => setSheet({ kind: 'fixed', line })}
                    >
                      <span className="mini-line">
                        <span className="mini-name">{line.template.name}</span>
                        <span className={`mini-amt num tone-${slot.tone}`}>{slot.text}</span>
                      </span>
                      {meta.text && <span className={`mini-meta tone-${meta.tone}`}>{meta.text}</span>}
                    </button>
                  )
                })
              )}
            </section>

            <section className="panel panel-half" aria-label="額外消費">
              <div className="half-head">
                <h2 className="half-title">額外消費</h2>
                <div className={`half-total num${numSizeClass(formatMoney(r.totals.extra), 8, 11)}`}>{formatMoney(r.totals.extra)}</div>
                <div className="half-cap tone-muted">{extraCaption(r)}</div>
              </div>
              {r.extras.map((e) => (
                <button key={e.id} type="button" className="mini-row" onClick={() => setSheet({ kind: 'extra', id: e.id })}>
                  <span className="mini-line">
                    <span className="mini-name">{e.name}</span>
                    <span className="mini-amt num">{formatMoney(e.amount)}</span>
                  </span>
                  <span className="mini-meta tone-muted">{formatYmdShort(e.date).slice(5)}</span>
                </button>
              ))}
              <div className="half-spacer" />
              <button type="button" className="add-extra" onClick={() => setSheet({ kind: 'extra', id: null })}>
                <Plus size={18} strokeWidth={2.2} />
                新增額外消費
              </button>
            </section>
          </div>

          <button type="button" className={`note-row${note ? ' has-note' : ''}`} onClick={() => setSheet({ kind: 'note' })}>
            <NotebookPen size={18} />
            <span className="note-row-text">{note ? note.split('\n')[0] : '寫本月備註'}</span>
            <ChevronRight className="chev" size={18} />
          </button>
        </>
      )}

      <MonthPickerSheet open={sheet.kind === 'month'} onClose={close} value={ym} currentYm={currentYm} onPick={(v) => { setYm(v); close() }} />
      <MonthNoteSheet open={sheet.kind === 'note'} onClose={close} ym={ym} />
      <ShareSheet open={sheet.kind === 'share'} onClose={close} summary={summary} />
      {data && lk && r && (
        <>
          <CardMonthSheet
            open={sheet.kind === 'card'}
            onClose={close}
            ym={ym}
            line={sheet.kind === 'card' ? (r.cards.find((c) => c.card.id === sheet.cardId) ?? null) : null}
            data={data}
            lk={lk}
          />
          <FixedLineSheet
            open={sheet.kind === 'fixed'}
            onClose={close}
            ym={ym}
            today={today}
            line={sheet.kind === 'fixed' ? sheet.line : null}
            data={data}
            lk={lk}
          />
          <ExtraSheet
            open={sheet.kind === 'extra'}
            onClose={close}
            ym={ym}
            today={today}
            extra={sheet.kind === 'extra' && sheet.id ? (data.extras.find((e) => e.id === sheet.id) ?? null) : null}
            data={data}
          />
        </>
      )}
    </main>
  )
}
