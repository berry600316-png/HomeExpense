import type { FixedLine } from '../../domain/compute'

const priority = (line: FixedLine): number => {
  if (line.state === 'pending' || line.state === 'carried') return 0
  if (line.state === 'confirmed' || line.state === 'automatic') return 1
  if (line.state === 'not-due') return 2
  return 3
}

/** Keep the configured item order within each status group. */
export function homeFixedLines(lines: readonly FixedLine[]): FixedLine[] {
  return [...lines].sort((a, b) => priority(a) - priority(b))
}

export function pendingFixedLines(lines: readonly FixedLine[]): FixedLine[] {
  return homeFixedLines(lines).filter((line) => priority(line) === 0)
}

/** Continue after the handled item, even though it is no longer in the live pending list. */
export function nextPendingLine(lines: readonly FixedLine[], originalKeys: readonly string[], afterKey: string): FixedLine | null {
  if (lines.length === 0) return null
  const available = new Map(lines.map((line) => [line.key, line]))
  const order = [...originalKeys, ...lines.map((line) => line.key).filter((key) => !originalKeys.includes(key))]
  const start = order.indexOf(afterKey)
  for (let step = 1; step <= order.length; step++) {
    const key = order[(start + step) % order.length]
    const line = key ? available.get(key) : undefined
    if (line) return line
  }
  return null
}
