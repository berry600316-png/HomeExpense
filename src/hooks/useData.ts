import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { loadAll } from '../db/repo'
import { computeMonth, type MonthResult } from '../domain/compute'
import type { Beneficiary, CardBill, ID, InsuranceInfo, MonthNote, PaymentSource } from '../domain/types'

/** 全部資料（live：資料庫一變動就重新讀取，畫面即時重算）。undefined = 讀取中。 */
export function useAllData() {
  return useLiveQuery(async () => {
    const [base, insurance, beneficiaries, cardBills, monthNotes] = await Promise.all([
      loadAll(db),
      db.insurance.toArray(),
      db.beneficiaries.toArray(),
      db.cardBills.toArray(),
      db.monthNotes.toArray(),
    ])
    return { ...base, insurance, beneficiaries, cardBills, monthNotes }
  }, [])
}

export type AllData = NonNullable<ReturnType<typeof useAllData>>

export interface Lookups {
  sourceById: Map<ID, PaymentSource>
  insuranceByTemplate: Map<ID, InsuranceInfo>
  beneficiaryById: Map<ID, Beneficiary>
  cardBillByKey: Map<string, CardBill>
  monthNoteByYm: Map<string, MonthNote>
}

export function useLookups(data: AllData | undefined): Lookups | undefined {
  return useMemo(() => {
    if (!data) return undefined
    return {
      sourceById: new Map(data.sources.map((s) => [s.id, s])),
      insuranceByTemplate: new Map(data.insurance.map((i) => [i.templateId, i])),
      beneficiaryById: new Map(data.beneficiaries.map((b) => [b.id, b])),
      cardBillByKey: new Map(data.cardBills.map((b) => [`${b.cardId}|${b.dueYm}`, b])),
      monthNoteByYm: new Map(data.monthNotes.map((n) => [n.ym, n])),
    }
  }, [data])
}

export function useMonthResult(data: AllData | undefined, ym: string, currentYm: string): MonthResult | undefined {
  return useMemo(() => (data ? computeMonth(ym, data, currentYm) : undefined), [data, ym, currentYm])
}

/** 付款來源顯示名稱：信用卡以卡片目前名稱為準。 */
export function sourceLabel(data: AllData, sourceId: ID | null): string {
  if (!sourceId) return ''
  const s = data.sources.find((x) => x.id === sourceId)
  if (!s) return '（已刪除的來源）'
  if (s.kind === 'card' && s.cardId) return data.cards.find((c) => c.id === s.cardId)?.name ?? s.name
  return s.name
}
