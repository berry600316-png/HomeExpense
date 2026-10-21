import { buildBackup, TABLE_NAMES, type BackupFile, type BackupTables } from '../domain/backup'
import { db as defaultDb, type HomeExpenseDB } from './db'

/** 讀出全部資料表，組成備份檔。 */
export async function exportAll(d: HomeExpenseDB = defaultDb, now = new Date()): Promise<BackupFile> {
  const tables = {} as BackupTables
  await d.transaction('r', TABLE_NAMES.map((n) => d.table(n)), async () => {
    for (const n of TABLE_NAMES) (tables as Record<string, unknown[]>)[n] = await d.table(n).toArray()
  })
  return buildBackup(tables, now)
}

/**
 * 完整取代本機資料。在單一交易中「清空 → 寫入」；任何一步失敗，整個交易回滾，原資料不變。
 * 呼叫前必須先通過 validateBackup。
 */
export async function restoreAll(backup: BackupFile, d: HomeExpenseDB = defaultDb): Promise<void> {
  await d.transaction('rw', TABLE_NAMES.map((n) => d.table(n)), async () => {
    for (const n of TABLE_NAMES) await d.table(n).clear()
    for (const n of TABLE_NAMES) {
      const rows = backup.data[n] as unknown[]
      if (rows.length) await d.table(n).bulkAdd(rows)
    }
  })
}
