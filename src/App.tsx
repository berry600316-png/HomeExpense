import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { IS_DEMO } from './db/db'
import { useKeyboardInset } from './hooks/useKeyboardInset'
import { HomePage } from './pages/home/HomePage'
import { BackupPage } from './pages/settings/BackupPage'
import { BeneficiariesPage } from './pages/settings/BeneficiariesPage'
import { CardEditPage } from './pages/settings/CardEditPage'
import { CardsPage } from './pages/settings/CardsPage'
import { FixedEditPage } from './pages/settings/FixedEditPage'
import { FixedListPage } from './pages/settings/FixedListPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { SourcesPage } from './pages/settings/SourcesPage'
import { ToastProvider } from './ui/Toast'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { todayYmd } from './domain/ym'

/**
 * 使用 HashRouter：GitHub Pages 等靜態主機沒有伺服器端改寫，
 * 用一般路徑在子頁重新整理會 404；hash 路由則一律回到 index.html。
 */
export function App() {
  useKeyboardInset()
  useEffect(() => {
    if (import.meta.env.DEV && IS_DEMO) void import('./db/demo').then((m) => m.seedDemo(todayYmd()))
  }, [])
  return (
    <ToastProvider>
      <HashRouter>
        <div className="app-shell">
          {import.meta.env.DEV && IS_DEMO && <div className="demo-ribbon">示範資料（開發模式，與正式資料隔離）</div>}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/cards" element={<CardsPage />} />
            <Route path="/settings/cards/:id" element={<CardEditPage />} />
            <Route path="/settings/fixed" element={<FixedListPage />} />
            <Route path="/settings/fixed/:id" element={<FixedEditPage />} />
            <Route path="/settings/sources" element={<SourcesPage />} />
            <Route path="/settings/beneficiaries" element={<BeneficiariesPage />} />
            <Route path="/settings/backup" element={<BackupPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
        <UpdatePrompt />
      </HashRouter>
    </ToastProvider>
  )
}
