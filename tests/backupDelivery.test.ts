import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverFile } from '../src/pages/settings/BackupPage'

afterEach(() => vi.unstubAllGlobals())

describe('backup file delivery', () => {
  it('shares only the JSON file so Save to Files does not create a text file', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const file = new File(['{}'], 'homeexpense-backup-20261108-1548.json', { type: 'application/json' })

    await expect(deliverFile(file)).resolves.toBe(true)
    expect(share).toHaveBeenCalledExactlyOnceWith({ files: [file] })
  })
})
