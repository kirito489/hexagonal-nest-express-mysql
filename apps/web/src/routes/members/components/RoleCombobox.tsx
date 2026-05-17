import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { useRoleOptionsInfiniteQuery } from '../hooks/use-role-options-infinite-query'
import { useRoleOptionFallbackQuery } from '../hooks/use-role-option-fallback-query'

type RoleOption = {
  id: string
  name: string
  isDefault: boolean
}

type RoleComboboxProps = {
  /** 表單目前選的 roleId（uuid 字串；空字串表示未選） */
  value: string
  onChange: (next: string) => void
  /** 編輯模式時帶入既有 roleId，做 fallback fetch */
  editingRoleId?: string
  /** 表單 disabled 時整個 trigger disabled */
  disabled?: boolean
}

/**
 * 會員 dialog 的角色選擇 Combobox：cmdk + popover + useInfiniteQuery + IntersectionObserver
 *
 * 互動規格：
 * - 點 trigger 開啟 popover，內含搜尋輸入與可滾動清單
 * - 搜尋輸入 debounce 300ms 後寫入 queryKey 重抓
 * - 清單底端的 sentinel 進入視窗時自動 fetchNextPage
 * - isDefault === true 的選項顯示但 disabled，標示「（預設）」（與角色列表 badge 一致）
 * - 編輯模式若 value 不在第一頁，並列 fetch fallback option，合併進清單頂端
 */
export const RoleCombobox = ({
  value,
  onChange,
  editingRoleId,
  disabled,
}: RoleComboboxProps) => {
  const [open, setOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  const listQuery = useRoleOptionsInfiniteQuery(debouncedSearch)
  const fallbackQuery = useRoleOptionFallbackQuery(editingRoleId)

  // 合併分頁回的 list 與 fallback option（fallback 放頂端、依 id 去重）
  const options: RoleOption[] = useMemo(() => {
    const merged: RoleOption[] = []
    const seen = new Set<string>()
    const fb = fallbackQuery.data
    if (fb?.id && fb.name !== undefined && fb.isDefault !== undefined) {
      merged.push({ id: fb.id, name: fb.name, isDefault: fb.isDefault })
      seen.add(fb.id)
    }
    const pages = listQuery.data?.pages ?? []
    for (const page of pages) {
      for (const item of page?.list ?? []) {
        if (
          item.id &&
          !seen.has(item.id) &&
          item.name !== undefined &&
          item.isDefault !== undefined
        ) {
          merged.push({
            id: item.id,
            name: item.name,
            isDefault: item.isDefault,
          })
          seen.add(item.id)
        }
      }
    }
    return merged
  }, [listQuery.data, fallbackQuery.data])

  // 顯示「目前選中角色」名稱：先用 options 內找，找不到看 fallback 失敗 → 顯示 placeholder
  const selectedLabel = useMemo(() => {
    if (!value) return ''
    const found = options.find((o) => o.id === value)
    if (found) return found.name
    // value 存在但找不到對應角色（fallback 404 / 角色已停用）
    if (fallbackQuery.isError) return '（已停用 / 不可用）'
    return ''
  }, [value, options, fallbackQuery.isError])

  // sentinel + IntersectionObserver：在清單底端觸發 fetchNextPage
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasNextPage = listQuery.hasNextPage
  const isFetchingNextPage = listQuery.isFetchingNextPage
  const fetchNextPage = listQuery.fetchNextPage
  useEffect(() => {
    if (!open) return
    const target = sentinelRef.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          {selectedLabel || '請選擇角色'}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="搜尋角色名稱"
            value={searchInput}
            onValueChange={setSearchInput}
          />
          <CommandList>
            {listQuery.isLoading && options.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>找不到角色</CommandEmpty>
            ) : (
              <>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    disabled={opt.isDefault}
                    onSelect={() => {
                      if (opt.isDefault) return
                      onChange(opt.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        value === opt.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>{opt.name}</span>
                    {opt.isDefault ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        （預設）
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
                <div ref={sentinelRef} className="h-px" />
                {listQuery.isFetchingNextPage ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
