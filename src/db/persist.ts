/**
 * 向瀏覽器申請「不要自動清掉本機資料」。
 * 這只能降低被系統清除的機率，不保證資料永遠不會遺失（使用者清除網站資料、換手機仍會遺失），
 * 所以備份與還原仍是必要功能。
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}
