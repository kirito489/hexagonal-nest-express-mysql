import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useIsFirstRun } from '@/lib/use-is-first-run';
import type { LockStatusFilter } from '../hooks/use-account-locks-url-state';

type AccountLocksSearchBarProps = {
  initialSearch: string;
  status: LockStatusFilter;
  onSearch: (search: string) => void;
  onStatusChange: (status: LockStatusFilter) => void;
};

export const AccountLocksSearchBar = ({
  initialSearch,
  status,
  onSearch,
  onStatusChange,
}: AccountLocksSearchBarProps) => {
  const [input, setInput] = useState(initialSearch);
  const debounced = useDebouncedValue(input, 300);

  const consumeFirstRun = useIsFirstRun();
  useEffect(() => {
    if (consumeFirstRun()) return;
    onSearch(debounced);
  }, [debounced, onSearch, consumeFirstRun]);

  const handleReset = () => {
    setInput('');
    onSearch('');
    onStatusChange('locked');
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search-lock-email" className="text-xs">
          搜尋 Email
        </Label>
        <Input
          id="search-lock-email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="輸入 Email（部分比對）"
          className="w-56"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-lock-status" className="text-xs">
          狀態
        </Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange(value as LockStatusFilter)}
        >
          <SelectTrigger id="filter-lock-status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="locked">鎖定中</SelectItem>
            <SelectItem value="expired">已到期</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleReset}
        disabled={input === '' && status === 'locked'}
        title="重置搜尋條件"
      >
        <RotateCcw />
        重置
      </Button>
    </div>
  );
};
