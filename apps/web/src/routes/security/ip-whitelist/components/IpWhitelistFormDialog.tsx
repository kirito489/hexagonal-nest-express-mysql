import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  ipWhitelistFormSchema,
  type IpWhitelistForm,
} from '../lib/ip-whitelist-form-schema'

type IpWhitelistFormDialogProps = {
  open: boolean
  /** view = 唯讀檢視；edit = 改 description；create = IP + description 都可改 */
  mode: 'create' | 'edit' | 'view'
  initialValues?: Partial<IpWhitelistForm>
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (values: IpWhitelistForm) => Promise<void> | void
}

const DEFAULT_VALUES: IpWhitelistForm = {
  ip: '',
  description: '',
}

export const IpWhitelistFormDialog = ({
  open,
  mode,
  initialValues,
  isSubmitting,
  onClose,
  onSubmit,
}: IpWhitelistFormDialogProps) => {
  const isView = mode === 'view'
  const ipDisabled = isView || mode === 'edit'
  const descDisabled = isView

  const form = useForm<IpWhitelistForm>({
    resolver: standardSchemaResolver(ipWhitelistFormSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues },
  })

  useEffect(() => {
    if (open) form.reset({ ...DEFAULT_VALUES, ...initialValues })
  }, [open, initialValues, form])

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values)
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? '新增白名單'
              : mode === 'edit'
                ? '編輯白名單'
                : '檢視白名單'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '加入新的 IP 到白名單'
              : mode === 'edit'
                ? '更新備註說明（IP 不可變更，要改 IP 請刪除後重建）'
                : '檢視白名單紀錄（唯讀）'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="ip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP 位址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="192.168.1.1"
                      disabled={ipDisabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備註</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="例如：辦公室 IP"
                      disabled={descDisabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {isView ? '關閉' : '取消'}
              </Button>
              {!isView && (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? '儲存中…'
                    : mode === 'create'
                      ? '新增'
                      : '儲存'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
