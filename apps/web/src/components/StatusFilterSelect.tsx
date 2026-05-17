import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * 列表頁狀態篩選下拉。三選一：全部 / 啟用 / 停用。
 *
 * shadcn `Select` value 必須是字串（不能 undefined），所以內部用 sentinel `'all'`
 * 代表「全部」；呼叫端負責 undefined ↔ 'all' 的轉換
 */
export type StatusFilterValue = 'all' | 'true' | 'false'

type StatusFilterSelectProps = {
  value: StatusFilterValue
  onChange: (next: StatusFilterValue) => void
  /** 預設「狀態」；列表頁可改成「會員狀態」「角色狀態」等 */
  label?: string
}

export const StatusFilterSelect = ({
  value,
  onChange,
  label = '狀態',
}: StatusFilterSelectProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" htmlFor="status-filter">
        {label}
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as StatusFilterValue)}
      >
        <SelectTrigger id="status-filter" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          <SelectItem value="true">啟用</SelectItem>
          <SelectItem value="false">停用</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
