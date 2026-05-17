import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/lib/use-debounced-value'

type RolesSearchBarProps = {
  initialName: string
  onSearch: (name: string) => void
}

/**
 * 角色搜尋輸入：只有 name 一欄，debounce 300ms 後通知父層寫入 URL state
 */
export const RolesSearchBar = ({
  initialName,
  onSearch,
}: RolesSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName)
  const debouncedName = useDebouncedValue(nameInput, 300)

  // mount 首次值等於 initialName（URL 現況），不需要再 push 一次
  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    onSearch(debouncedName)
  }, [debouncedName, onSearch])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-role-name" className="text-xs">
          搜尋名稱
        </Label>
        <Input
          id="search-role-name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="輸入角色名稱"
          className="w-56"
        />
      </div>
    </div>
  )
}
