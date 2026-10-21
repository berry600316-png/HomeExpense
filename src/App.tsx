import { HashRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { UpdatePrompt } from './ui/UpdatePrompt'

/**
 * 使用 HashRouter：GitHub Pages 等靜態主機沒有伺服器端改寫，
 * 用一般路徑在子頁重新整理會 404；hash 路由則一律回到 index.html。
 */
export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
      <UpdatePrompt />
    </HashRouter>
  )
}
