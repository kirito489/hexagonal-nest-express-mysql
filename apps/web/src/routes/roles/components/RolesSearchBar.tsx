import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  StatusFilterSelect,
  type StatusFilterValue,
} from '@/components/StatusFilterSelect'
import { useDebouncedValue } from '@/lib/use-debounced-value'

type StatusFilter = 'true' | 'false' | undefined

type RolesSearchBarProps = {
  initialName: string
  initialStatus: StatusFilter
  onSearch: (name: string) => void
  onStatusChange: (status: StatusFilter) => void
}

/**
 * 角色搜尋：name debounce 300ms + 狀態下拉（即時觸發）
 */
export const RolesSearchBar = ({
  initialName,
  initialStatus,
  onSearch,
  onStatusChange,
}: RolesSearchBarProps) => {
  const [nameInput, setNameInput] = useState(initialName)
  const debouncedName = useDebouncedValue(nameInput, 300)

  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    onSearch(debouncedName)
  }, [debouncedName, onSearch])

  const statusValue: StatusFilterValue = initialStatus ?? 'all'
  const handleStatusChange = (v: StatusFilterValue) => {
    onStatusChange(v === 'all' ? undefined : v)
  }

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
      <StatusFilterSelect value={statusValue} onChange={handleStatusChange} />
    </div>
  )
}
