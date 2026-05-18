export const IP_LIST_PORT = 'IP_LIST_PORT';

export interface ListIpParams {
  page: number;
  limit: number;
  /** IP 模糊（contains）；trim 後若空字串視為未提供 */
  search?: string;
}

export interface ListIpResult<T> {
  list: T[];
  total: number;
}

export interface IpListItem {
  id: string;
  ipAddress: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface IpBlacklistItem {
  id: string;
  ipAddress: string;
  reason?: string | null;
  isAutoBlock: boolean;
  createdBy?: string | null;
  createdAt: Date;
}

export interface IpListPort {
  /** 檢查 IP 是否在白名單中（middleware / guard 用） */
  isWhitelisted(ip: string): Promise<boolean>;

  /** 檢查 IP 是否在黑名單中（middleware / guard 用） */
  isBlacklisted(ip: string): Promise<boolean>;

  /**
   * 新增 IP 到白名單，回新建（或既有）紀錄的 id
   */
  addToWhitelist(
    ip: string,
    description?: string,
    createdBy?: string,
  ): Promise<{ id: string }>;

  /**
   * 新增 IP 到黑名單，回新建（或既有）紀錄的 id
   */
  addToBlacklist(
    ip: string,
    reason?: string,
    isAutoBlock?: boolean,
    createdBy?: string,
  ): Promise<{ id: string }>;

  /** 從白名單移除 IP（不存在時不報錯） */
  removeFromWhitelist(ip: string): Promise<void>;

  /** 從黑名單移除 IP（不存在時不報錯） */
  removeFromBlacklist(ip: string): Promise<void>;

  /** 分頁查詢白名單 + IP 模糊搜尋 */
  listWhitelist(params: ListIpParams): Promise<ListIpResult<IpListItem>>;

  /** 分頁查詢黑名單 + IP 模糊搜尋 */
  listBlacklist(params: ListIpParams): Promise<ListIpResult<IpBlacklistItem>>;
}
