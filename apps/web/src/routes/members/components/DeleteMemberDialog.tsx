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
import type { MemberRow } from './MembersTable'

type DeleteMemberDialogProps = {
  member: MemberRow | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: (member: MemberRow) => void
}

export const DeleteMemberDialog = ({
  member,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteMemberDialogProps) => {
  return (
    <AlertDialog open={!!member} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認刪除會員</AlertDialogTitle>
          <AlertDialogDescription>
            即將刪除
            <span className="text-foreground font-medium">
              {' '}
              {member?.member ?? '—'}{' '}
            </span>
            ({member?.email ?? '—'})。後端為軟刪除，可由管理員恢復；確認繼續嗎？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={() => member && onConfirm(member)}
          >
            {isDeleting ? '刪除中…' : '確認刪除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
