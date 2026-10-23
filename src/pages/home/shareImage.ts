/**
 * 把 ShareSummary 畫成一張 PNG（版面 2「整行大字」，使用者 2026-10-21 選定）。
 * - 用 Canvas 2D 自己排版：不依賴 DOM 轉圖片的套件（iOS Safari 對 foreignObject 支援不穩）。
 * - 先量一次總高度，再依高度建立畫布實際繪製；項目再多都是同一張完整圖片。
 * - 預設 3 倍解析度；畫布超過 iOS 面積上限時自動降低倍率。
 */
import type { ShareRow, ShareSection, ShareSummary, ShareTone } from './shareSummary'

const W = 390
const MAX_AREA = 16_000_000
const MAX_SIDE = 16_000

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif'
const NUM = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif'

const C = {
  bg: '#f7f5f0',
  hero: '#1e2b4b',
  surface: '#ffffff',
  line: '#e8e4dc',
  t1: '#1c1d21',
  t2: '#44464d',
  t3: '#6b6d74',
  accent: '#1b2a4a',
  warn: '#9a5d06',
  danger: '#b3362f',
  quietBg: '#f3f1ec',
}

const STATUS: Record<ShareSummary['status']['tone'], { bg: string; fg: string }> = {
  ok: { bg: 'rgba(168,220,188,0.16)', fg: '#a8dcbc' },
  warn: { bg: 'rgba(240,183,90,0.18)', fg: '#ffd99a' },
  danger: { bg: 'rgba(255,180,171,0.18)', fg: '#ffb4ab' },
  info: { bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.9)' },
  muted: { bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.9)' },
}

type Ctx = CanvasRenderingContext2D

function font(ctx: Ctx, size: number, weight = 400, family = FONT) {
  ctx.font = `${weight} ${size}px ${family}`
}

/** 依字元換行（中文沒有空白可斷）。 */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  if (!text) return []
  const lines: string[] = []
  let cur = ''
  for (const ch of Array.from(text)) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur)
      cur = ch.trim() === '' ? '' : ch
    } else cur += ch
  }
  if (cur) lines.push(cur)
  return lines
}

/** 字太長放不下時縮小字級。 */
function fitSize(ctx: Ctx, text: string, size: number, weight: number, maxW: number, family = FONT): number {
  let s = size
  font(ctx, s, weight, family)
  while (s > 10 && ctx.measureText(text).width > maxW) {
    s -= 1
    font(ctx, s, weight, family)
  }
  return s
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function toneColor(t: ShareTone): string {
  if (t === 'warn') return C.warn
  if (t === 'danger') return C.danger
  if (t === 'muted') return C.t3
  return C.t1
}

/** 排版並（draw=true 時）繪製。回傳總高度。 */
function layout(ctx: Ctx, s: ShareSummary, draw: boolean): number {
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const text = (str: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
    if (!draw) return
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(str, x, y)
    ctx.textAlign = 'left'
  }

  // ── 深藍頁首 ──
  const PX = 22
  let y = 22
  const heroStart = 0
  // 先畫背景需要知道高度：先算，最後補畫（用 destination-over）
  font(ctx, 13, 600)
  text(s.brand, PX, y, 'rgba(255,255,255,0.6)')
  y += 20
  font(ctx, 24, 700)
  text(s.month, PX, y, '#fff')
  y += 34
  font(ctx, 16, 400)
  text('本月總花費', PX, y, 'rgba(255,255,255,0.85)')
  y += 24

  const numSize = fitSize(ctx, s.total, 54, 700, W - PX * 2 - 50, NUM)
  font(ctx, 21, 600, NUM)
  const ntW = ctx.measureText('NT$').width
  // 以基線對齊：大數字與 NT$ 同一條基線
  if (draw) {
    ctx.textBaseline = 'alphabetic'
    font(ctx, 21, 600, NUM)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText('NT$', PX, y + numSize * 0.95)
    font(ctx, numSize, 700, NUM)
    ctx.fillStyle = '#fff'
    ctx.fillText(s.total, PX + ntW + 6, y + numSize * 0.95)
    ctx.textBaseline = 'top'
  }
  y += numSize * 1.12 + 6

  // 狀態膠囊（太長時換行）
  font(ctx, 15, 600)
  const st = STATUS[s.status.tone]
  const pillLines = wrap(ctx, `● ${s.status.text}`, W - PX * 2 - 22)
  const pillW = Math.max(...pillLines.map((l) => ctx.measureText(l).width)) + 22
  const pillH = pillLines.length * 21 + 8
  if (draw) {
    ctx.fillStyle = st.bg
    roundRect(ctx, PX, y, pillW, pillH, Math.min(pillH / 2, 13))
    ctx.fill()
  }
  pillLines.forEach((l, i) => text(l, PX + 11, y + 5 + i * 21, st.fg))
  y += pillH + 16

  // 加法算式
  if (draw) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(PX, y, W - PX * 2, 1)
  }
  y += 13
  const innerW = W - PX * 2
  const opW = 22
  const colW = (innerW - opW * 2) / 3
  s.formula.forEach((f, i) => {
    const cx = PX + i * (colW + opW) + colW / 2
    font(ctx, 14, 400)
    text(f.label, cx, y, 'rgba(255,255,255,0.8)', 'center')
    const vs = fitSize(ctx, f.value, 20, 700, colW - 4, NUM)
    font(ctx, vs, 700, NUM)
    text(f.value, cx, y + 20 + (20 - vs) / 2, '#fff', 'center')
    if (i < 2) {
      font(ctx, 18, 400)
      text('+', PX + (i + 1) * colW + i * opW + opW / 2, y + 20, 'rgba(255,255,255,0.55)', 'center')
    }
  })
  y += 46 + 20
  const heroH = y - heroStart
  if (draw) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = C.hero
    ctx.fillRect(0, 0, W, heroH)
    ctx.globalCompositeOperation = 'source-over'
  }

  // ── 三張白卡 ──
  y += 12
  for (const sec of s.sections) {
    y = section(ctx, sec, y, draw, text) + 12
  }

  // ── 頁尾 ──
  y += 2
  font(ctx, 12.5, 400)
  text(s.footer, W / 2, y, C.t3, 'center')
  y += 18 + 18

  if (draw) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, y)
    ctx.globalCompositeOperation = 'source-over'
  }
  return Math.ceil(y)
}

type TextFn = (str: string, x: number, y: number, color: string, align?: CanvasTextAlign) => void

function section(ctx: Ctx, sec: ShareSection, top: number, draw: boolean, text: TextFn): number {
  const X = 12
  const CW = W - X * 2
  const PX = 15
  const left = X + PX
  const right = X + CW - PX
  const innerW = CW - PX * 2

  // 先量高度
  const rows = sec.rows.map((r) => measureRow(ctx, r, innerW))
  font(ctx, 13.5, 400)
  const quietLines = sec.quiet ? wrap(ctx, sec.quiet.names.join('、'), innerW - 22) : []
  const headH = 40
  let bodyH = rows.reduce((h, r) => h + r.h, 0)
  const showEmpty = rows.length === 0 && sec.emptyText !== ''
  if (showEmpty) bodyH += 42
  const quietH = sec.quiet ? 4 + 9 + 20 + quietLines.length * 20 + 9 + 4 : 0
  const h = 14 + headH + bodyH + quietH + 8

  if (draw) {
    ctx.save()
    ctx.shadowColor = 'rgba(28,29,33,0.07)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 3
    ctx.fillStyle = C.surface
    roundRect(ctx, X, top, CW, h, 18)
    ctx.fill()
    ctx.restore()
  }

  let y = top + 14
  font(ctx, 18, 700)
  text(sec.title, left, y + 4, C.t1)
  const ts = fitSize(ctx, sec.total, 22, 700, innerW - 100, NUM)
  font(ctx, ts, 700, NUM)
  text(sec.total, right, y + 2 + (22 - ts) / 2, C.accent, 'right')
  y += headH - 9
  if (draw) {
    ctx.fillStyle = C.line
    ctx.fillRect(left, y, innerW, 1)
  }
  y += 9

  if (showEmpty) {
    font(ctx, 15, 400)
    text(sec.emptyText, left, y + 11, C.t3)
    y += 42
  }
  rows.forEach((m, i) => {
    if (i > 0 && draw) {
      ctx.fillStyle = C.line
      ctx.fillRect(left, y, innerW, 1)
    }
    let ty = y + 10
    font(ctx, 17, 400)
    for (const l of m.nameLines) {
      text(l, left, ty, C.t1)
      ty += 23
    }
    font(ctx, 13.5, 400)
    for (const l of m.subLines) {
      text(l, left, ty + 1, m.row.tone === 'warn' ? C.warn : C.t3)
      ty += 19
    }
    font(ctx, m.amtSize, 700, NUM)
    text(m.row.amount, right, y + (m.h - m.amtSize * 1.2) / 2, toneColor(m.row.tone), 'right')
    y += m.h
  })

  if (sec.quiet) {
    y += 4
    const qh = 9 + 20 + quietLines.length * 20 + 9
    if (draw) {
      ctx.fillStyle = C.quietBg
      roundRect(ctx, left, y, innerW, qh, 10)
      ctx.fill()
    }
    font(ctx, 13.5, 700)
    text(sec.quiet.label, left + 11, y + 9, C.t2)
    font(ctx, 13.5, 400)
    quietLines.forEach((l, i) => text(l, left + 11, y + 9 + 20 + i * 20, C.t3))
    y += qh + 4
  }
  return top + h
}

interface RowMetrics {
  row: ShareRow
  nameLines: string[]
  subLines: string[]
  amtSize: number
  h: number
}

function measureRow(ctx: Ctx, row: ShareRow, innerW: number): RowMetrics {
  const isWord = row.tone === 'warn' || row.tone === 'muted'
  const amtSize = isWord && !row.amount.includes('$') ? 15 : 18
  font(ctx, amtSize, 700, NUM)
  const amtW = ctx.measureText(row.amount).width
  const textW = Math.max(80, innerW - amtW - 12)
  font(ctx, 17, 400)
  const nameLines = wrap(ctx, row.name, textW)
  font(ctx, 13.5, 400)
  const subLines = wrap(ctx, row.sub, textW)
  const h = 10 + nameLines.length * 23 + (subLines.length ? 1 + subLines.length * 19 : 0) + 10
  return { row, nameLines, subLines, amtSize, h }
}

/** 畫成 PNG。 */
export async function renderShareImage(s: ShareSummary): Promise<Blob> {
  try {
    await document.fonts?.ready
  } catch {
    /* 沒有 fonts API 也照畫 */
  }
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('這台裝置不支援產生圖片')
  const H = layout(probe, s, false)

  const scale = Math.max(1, Math.min(3, Math.sqrt(MAX_AREA / (W * H)), MAX_SIDE / H))
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(W * scale)
  canvas.height = Math.floor(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('這台裝置不支援產生圖片')
  ctx.scale(scale, scale)
  layout(ctx, s, true)

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片產生失敗'))), 'image/png')
  })
}
