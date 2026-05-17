import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { RoleRow } from './RolesTable'

type DeleteRoleDialogProps = {
  role: RoleRow | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: (role: RoleRow) => void
}

export const DeleteRoleDialog = ({
  role,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteRoleDialogProps) => {
  return (
    <AlertDialog open={!!role} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認刪除角色</AlertDialogTitle>
          <AlertDialogDescription>
            即將刪除
            <span className="text-foreground font-medium">
              {' '}
              {role?.name ?? '—'}{' '}
            </span>
            （目前使用人數：{role?.memberCount ?? 0}）。後端為軟刪除，可由管理員恢復；確認繼續嗎？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={() => role && onConfirm(role)}
          >
            {isDeleting ? '刪除中…' : '確認刪除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
