import { afterEach, describe, expect, it } from 'vitest'
import { HomeExpenseDB, newId } from '../src/db/db'

const dbs: HomeExpenseDB[] = []
function openDb(name: string) {
  const d = new HomeExpenseDB(name)
  dbs.push(d)
  return d
}

afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close()
    await d.delete()
  }
})

describe('IndexedDB schema', () => {
  it('卡片月總額：同一張卡同一個月只能有一筆（唯一鍵 [cardId+ym]）', async () => {
    const d = openDb('t-unique-cardmonth')
    const cardId = newId()
    await d.cardMonths.add({ id: newId(), cardId, ym: '2026-10', amount: 8000, note: '', updatedAt: 0 })
    await expect(
      d.cardMonths.add({ id: newId(), cardId, ym: '2026-10', amount: 1, note: '', updatedAt: 0 }),
    ).rejects.toThrow()
    expect(await d.cardMonths.count()).toBe(1)
  })

  it('固定支出同一期只能有一筆（唯一鍵 [templateId+periodKey]）', async () => {
    const d = openDb('t-unique-occ')
    const templateId = newId()
    const base = {
      templateId,
      periodKey: '2026-10',
      periodYm: '2026-10',
      status: 'confirmed' as const,
      actualDate: '2026-10-15',
      actualYm: '2026-10',
      amount: 2000,
      sourceId: null,
      inCardTotal: true,
      note: '',
      createdAt: 0,
      updatedAt: 0,
    }
    await d.occurrences.add({ id: newId(), ...base })
    await expect(d.occurrences.add({ id: newId(), ...base })).rejects.toThrow()
  })

  it('資料庫關閉後重新開啟，資料仍保留', async () => {
    const name = 't-reopen'
    const d1 = new HomeExpenseDB(name)
    const id = newId()
    await d1.monthNotes.put({ ym: '2026-10', note: '多行\n備註', updatedAt: 1 })
    await d1.extras.add({
      id,
      name: '銀行轉帳買家電',
      amount: 3000,
      date: '2026-10-21',
      ym: '2026-10',
      sourceId: null,
      note: '',
      createdAt: 1,
      updatedAt: 1,
    })
    d1.close()
    const d2 = openDb(name)
    expect((await d2.monthNotes.get('2026-10'))?.note).toBe('多行\n備註')
    expect((await d2.extras.get(id))?.amount).toBe(3000)
  })

  it('newId 產生 UUID v4 格式且不重複', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
