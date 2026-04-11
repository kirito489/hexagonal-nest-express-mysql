/** 角色名稱常數（對應 roles 表的 name 欄位） */
export const RoleName = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];

/** @deprecated 使用 RoleName */
export const RoleCode = RoleName;
export type RoleCode = RoleName;

/** Permission code 常數（對應 permissions 表的 permission_code 欄位）
 *  格式：{PLATFORM}:{MODULE}[:{SUB_MODULE}]:{ACTION}
 */
export const PermissionCode = {
  // 後台 - 帳號管理
  BACKEND_ACCOUNT_VIEW: 'BACKEND:ACCOUNT:VIEW',
  BACKEND_ACCOUNT_EDIT: 'BACKEND:ACCOUNT:EDIT',

  // 後台 - 角色與權限管理
  BACKEND_ROLE_VIEW: 'BACKEND:ROLE:VIEW',
  BACKEND_ROLE_EDIT: 'BACKEND:ROLE:EDIT',
} as const;

export type PermissionCode =
  (typeof PermissionCode)[keyof typeof PermissionCode];
