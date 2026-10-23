/**
 * App 版本號：設定頁顯示的版本必須與 package.json 一致，避免改版時只改一邊。
 */
import { describe, expect, it } from 'vitest'
import lockRaw from '../package-lock.json?raw'
import pkgRaw from '../package.json?raw'
import { APP_VERSION } from '../src/appInfo'

describe('App 版本號', () => {
  it('與 package.json、package-lock.json 的 version 相同，且為 x.y.z 格式', () => {
    const pkg = JSON.parse(pkgRaw) as { version: string }
    const lock = JSON.parse(lockRaw) as { version: string; packages: Record<string, { version?: string }> }
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.version).toBe(APP_VERSION)
    expect(lock.version).toBe(APP_VERSION)
    expect(lock.packages['']?.version).toBe(APP_VERSION)
  })
})
