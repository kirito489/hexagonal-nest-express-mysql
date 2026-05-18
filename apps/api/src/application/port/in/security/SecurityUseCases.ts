/**
 * Security 模組的 7 個 use case port 與對應 token。
 * 聚合在單一檔內：每個 use case 介面都極窄（一個 method），個別檔過於碎片化。
 */
import { IpBlacklistItem, IpListItem } from '../../out/security/IpListPort';

/** 列表 use case 收的 query（page/limit 可選，service 內套預設） */
export interface ListIpListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListIpListResult<T> {
  list: T[];
  meta: PaginationMeta;
}

// ── IP 白名單 ────────────────────────────────

export const LIST_IP_WHITELIST_USE_CASE = 'LIST_IP_WHITELIST_USE_CASE';
export interface ListIpWhitelistUseCase {
  execute(query: ListIpListQuery): Promise<ListIpListResult<IpListItem>>;
}

export const ADD_IP_WHITELIST_USE_CASE = 'ADD_IP_WHITELIST_USE_CASE';
export interface AddIpWhitelistCommand {
  ip: string;
  description?: string;
  createdBy?: string;
}
export interface AddIpWhitelistUseCase {
  execute(command: AddIpWhitelistCommand): Promise<{ id: string }>;
}

export const REMOVE_IP_WHITELIST_USE_CASE = 'REMOVE_IP_WHITELIST_USE_CASE';
export interface RemoveIpWhitelistUseCase {
  execute(ip: string): Promise<void>;
}

// ── IP 黑名單 ────────────────────────────────

export const LIST_IP_BLACKLIST_USE_CASE = 'LIST_IP_BLACKLIST_USE_CASE';
export interface ListIpBlacklistUseCase {
  execute(query: ListIpListQuery): Promise<ListIpListResult<IpBlacklistItem>>;
}

export const ADD_IP_BLACKLIST_USE_CASE = 'ADD_IP_BLACKLIST_USE_CASE';
export interface AddIpBlacklistCommand {
  ip: string;
  reason?: string;
  createdBy?: string;
}
export interface AddIpBlacklistUseCase {
  execute(command: AddIpBlacklistCommand): Promise<{ id: string }>;
}

export const REMOVE_IP_BLACKLIST_USE_CASE = 'REMOVE_IP_BLACKLIST_USE_CASE';
export interface RemoveIpBlacklistUseCase {
  execute(ip: string): Promise<void>;
}

// ── 帳號解鎖 ─────────────────────────────────

export const UNLOCK_ACCOUNT_USE_CASE = 'UNLOCK_ACCOUNT_USE_CASE';
export interface UnlockAccountUseCase {
  /**
   * @throws EmailNotFoundException - email 對應的會員不存在
   * @throws AccountNotLockedException - 帳號未處於鎖定狀態
   */
  execute(email: string): Promise<void>;
}
