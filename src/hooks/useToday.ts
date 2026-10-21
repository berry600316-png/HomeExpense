import { useEffect, useState } from 'react'
import { todayYmd } from '../domain/ym'

/**
 * 今天（本地日期）。主畫面 PWA 會長時間留在背景，回到前景、或跨過午夜時要更新，
 * 否則月份與卡費提醒會停在舊的一天。
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayYmd())
  useEffect(() => {
    const refresh = () => setToday(todayYmd())
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      window.clearInterval(timer)
    }
  }, [])
  return today
}
