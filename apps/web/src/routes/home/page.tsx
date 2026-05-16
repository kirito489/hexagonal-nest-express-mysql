import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const HomePage = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>歡迎回來</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          管理後台骨架已建立完成，後續會接上會員、角色、權限等模組。
        </p>
      </CardContent>
    </Card>
  )
}
