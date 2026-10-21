import { Link } from 'react-router-dom'

/** Phase 1 骨架；Phase 7 實作。 */
export function SettingsPage() {
  return (
    <main>
      <header style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
        <Link to="/">‹ 返回</Link>
      </header>
      <h1 style={{ fontSize: 'var(--fs-xl)' }}>設定</h1>
    </main>
  )
}
