import { describe, expect, it } from 'vitest'
import type { FixedLine, FixedLineState } from '../src/domain/compute'
import { homeFixedLines, nextPendingLine, pendingFixedLines } from '../src/pages/home/fixedQueue'

const line = (key: string, state: FixedLineState): FixedLine => ({ key, state } as FixedLine)

describe('home fixed expenses', () => {
  it('groups pending, confirmed, not due, and other states while preserving configured order', () => {
    const input = [
      line('first-recorded', 'confirmed'), line('first-future', 'not-due'),
      line('first-pending', 'pending'), line('second-recorded', 'confirmed'),
      line('deferred', 'deferred'), line('old-pending', 'carried'),
      line('second-future', 'not-due'), line('skipped', 'skipped'),
    ]
    expect(homeFixedLines(input).map((x) => x.key)).toEqual([
      'first-pending', 'old-pending', 'first-recorded', 'second-recorded',
      'first-future', 'second-future', 'deferred', 'skipped',
    ])
    expect(pendingFixedLines(input).map((x) => x.key)).toEqual(['first-pending', 'old-pending'])
  })

  it('moves to the next outstanding item and wraps to the first', () => {
    const pending = [line('a', 'pending'), line('b', 'carried'), line('c', 'pending')]
    const keys = pending.map((x) => x.key)
    expect(nextPendingLine(pending.filter((x) => x.key !== 'b'), keys, 'b')?.key).toBe('c')
    expect(nextPendingLine(pending.filter((x) => x.key !== 'c'), keys, 'c')?.key).toBe('a')
    expect(nextPendingLine(pending.slice(0, 1), keys, 'c')?.key).toBe('a')
    expect(nextPendingLine([], keys, 'a')).toBeNull()
  })
})
