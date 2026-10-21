import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { saveMonthNote } from '../../db/repo'
import { formatYmLabel } from '../../domain/ym'
import { TextArea } from '../../ui/fields'
import { Sheet } from '../../ui/Sheet'
import { errorMessage, useToast } from '../../ui/Toast'

export function MonthNoteSheet({ open, onClose, ym }: { open: boolean; onClose: () => void; ym: string }) {
  const note = useLiveQuery(() => db.monthNotes.get(ym), [ym])
  const [draft, setDraft] = useState('')
  const toast = useToast()
  useEffect(() => {
    if (open) setDraft(note?.note ?? '')
    // 只在打開時載入，避免輸入途中被覆寫
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ym, note === undefined])

  const save = async () => {
    try {
      await saveMonthNote(ym, draft)
      toast('已儲存月份備註')
      onClose()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="月份備註"
      subtitle={formatYmLabel(ym)}
      footer={
        <button type="button" className="btn btn-primary" onClick={save}>
          儲存
        </button>
      }
    >
      <TextArea value={draft} onChange={setDraft} rows={6} placeholder="這個月的特別狀況，例如：家電換新、出國旅行…" />
    </Sheet>
  )
}
