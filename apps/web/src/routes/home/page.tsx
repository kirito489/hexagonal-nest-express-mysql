import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentMember } from '@/lib/use-current-member';

/**
 * 首頁。
 *
 * **刻意不列功能捷徑**：Sidebar 常駐且不可收起，已經是完整的導覽——
 * 再列一次是純粹的重複，而重複的清單會各自漂移（新增模組時只有一邊被更新）。
 * 首頁只放 Sidebar 給不了的東西。
 *
 * **也不放描述開發進度的文字**。原本這裡寫著「後續會接上會員、角色、權限等模組」，
 * 而那些模組全部接完之後它仍在那裡——登入後的第一個畫面，
 * 講的是一個早就不存在的狀態，而沒有任何測試會失敗。
 */
export const HomePage = () => {
  const { member, permissions, isLoading } = useCurrentMember();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="首頁"
        description={member ? `${member.member}，歡迎回來` : '歡迎回來'}
      />

      <Card>
        <CardHeader>
          <CardTitle>個人資料</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-muted-foreground text-sm">載入中…</p>
          )}
          {member && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">名稱</dt>
              <dd>{member.member}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{member.email}</dd>
              <dt className="text-muted-foreground">角色</dt>
              <dd>{member.roleName}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>可用功能</CardTitle>
        </CardHeader>
        <CardContent>
          {/*
            這裡回答的是「我這個帳號能做什麼」——那是 Sidebar 答不了的：
            它只顯示看得到的項目，不會告訴你「這就是全部了」。
            列的是權限碼而非頁面名：使用者拿得到碼，才說得出自己要跟管理員要什麼
          */}
          {permissions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              此帳號目前沒有任何功能權限，請聯絡管理員開通。
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((code) => (
                <code
                  key={code}
                  className="text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs"
                >
                  {code}
                </code>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
