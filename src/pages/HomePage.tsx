import { Link } from 'react-router-dom'

/** Phase 1 骨架；Phase 3 依使用者選定的視覺方案實作。 */
export function HomePage() {
  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
        <h1 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>HomeExpense</h1>
        <Link to="/settings">設定</Link>
      </header>
      <p style={{ color: 'var(--c-text-2)' }}>首頁建置中。</p>
    </main>
  )
}
