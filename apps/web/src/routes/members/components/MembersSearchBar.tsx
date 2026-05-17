import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/lib/use-debounced-value'

type MembersSearchBarProps = {
  initialName: string
  initialEmail: string
  onSearch: (name: string, email: string) => void
}

/**
 * name + email 兩個搜尋輸入，debounce 300ms 後通知父層寫入 URL state
 */
export const MembersSearchBar = ({
  initialName,
  initialEmail,
  onSearch,
}: MembersSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName)
  const [emailInput, setEmailInput] = useState(initialEmail)

  const debouncedName = useDebouncedValue(nameInput, 300)
  const debouncedEmail = useDebouncedValue(emailInput, 300)

  // mount 首次的 debounced 值等於 initialName/Email（即 URL 現況），不需要再 push 一次
  // 否則會多走 setSearchParams replace + 連帶 url 上不需要的回呼
  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    onSearch(debouncedName, debouncedEmail)
  }, [debouncedName, debouncedEmail, onSearch])

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
    </div>
  )
}
