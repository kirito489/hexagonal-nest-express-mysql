import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  StatusFilterSelect,
  type StatusFilterValue,
} from '@/components/StatusFilterSelect'
import { useDebouncedValue } from '@/lib/use-debounced-value'

type StatusFilter = 'true' | 'false' | undefined

type MembersSearchBarProps = {
  initialName: string
  initialEmail: string
  initialStatus: StatusFilter
  onSearch: (name: string, email: string) => void
  onStatusChange: (status: StatusFilter) => void
}

/**
 * name + email debounce 300ms + 狀態下拉（即時觸發）
 */
export const MembersSearchBar = ({
  initialName,
  initialEmail,
  initialStatus,
  onSearch,
  onStatusChange,
}: MembersSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName)
  const [emailInput, setEmailInput] = useState(initialEmail)

  const debouncedName = useDebouncedValue(nameInput, 300)
  const debouncedEmail = useDebouncedValue(emailInput, 300)

  // mount 首次的 debounced 值等於 initialName/Email（即 URL 現況），不需要再 push 一次
  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    onSearch(debouncedName, debouncedEmail)
  }, [debouncedName, debouncedEmail, onSearch])

  const statusValue: StatusFilterValue = initialStatus ?? 'all'
  const handleStatusChange = (v: StatusFilterValue) => {
    onStatusChange(v === 'all' ? undefined : v)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-name" className="text-xs">
          搜尋名稱
        </Label>
        <Input
          id="search-name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="輸入名稱"
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-email" className="text-xs">
          搜尋 Email
        </Label>
        <Input
          id="search-email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="輸入 Email"
          className="w-56"
        />
      </div>
      <StatusFilterSelect value={statusValue} onChange={handleStatusChange} />
    </div>
  )
}
