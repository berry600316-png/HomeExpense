import { useEffect } from 'react'

/**
 * iOS Safari 開啟鍵盤時不會縮小 layout viewport，固定在底部的 Bottom Sheet 會被鍵盤蓋住。
 * 用 visualViewport 算出鍵盤高度，寫到 CSS 變數 --kb，Sheet 以此抬高。
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // 小於 80px 視為瀏覽器工具列變化，不是鍵盤
      root.style.setProperty('--kb', `${kb > 80 ? Math.round(kb) : 0}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb')
    }
  }, [])
}
