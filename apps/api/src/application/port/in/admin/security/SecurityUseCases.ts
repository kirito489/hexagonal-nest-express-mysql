/**
 * Security 模組的 7 個 use case port 與對應 token。
 * 聚合在單一檔內：每個 use case 介面都極窄（一個 method），個別檔過於碎片化。
 */
import { IpBlacklistItem, IpListItem } from '../../../out/security/IpListPort';
import type {
  AccountLockFilter,
  LockedAccountItem,
} from '../../../out/auth/AccountLockPort';

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
  execute(id: string): Promise<void>;
}

export const GET_IP_WHITELIST_USE_CASE = 'GET_IP_WHITELIST_USE_CASE';
export interface GetIpWhitelistUseCase {
  /** @throws IpListNotFoundException - id 不存在 */
  execute(id: string): Promise<IpListItem>;
}

export const UPDATE_IP_WHITELIST_USE_CASE = 'UPDATE_IP_WHITELIST_USE_CASE';
export interface UpdateIpWhitelistCommand {
  id: string;
  description?: string;
}
export interface UpdateIpWhitelistUseCase {
  /** @throws IpListNotFoundException - id 不存在 */
  execute(command: UpdateIpWhitelistCommand): Promise<void>;
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
  execute(id: string): Promise<void>;
}

export const GET_IP_BLACKLIST_USE_CASE = 'GET_IP_BLACKLIST_USE_CASE';
export interface GetIpBlacklistUseCase {
  /** @throws IpListNotFoundException - id 不存在 */
  execute(id: string): Promise<IpBlacklistItem>;
}

export const UPDATE_IP_BLACKLIST_USE_CASE = 'UPDATE_IP_BLACKLIST_USE_CASE';
export interface UpdateIpBlacklistCommand {
  id: string;
  reason?: string;
}
export interface UpdateIpBlacklistUseCase {
  /** @throws IpListNotFoundException - id 不存在 */
  execute(command: UpdateIpBlacklistCommand): Promise<void>;
}

// ── 帳號鎖定列表 ──────────────────────────────

export const LIST_ACCOUNT_LOCKS_USE_CASE = 'LIST_ACCOUNT_LOCKS_USE_CASE';

export interface ListAccountLocksQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: AccountLockFilter;
}

export interface ListAccountLocksResult extends ListIpListResult<LockedAccountItem> {
  /**
   * 帳號鎖定功能是否啟用。
   *
   * **沒有它，呼叫端分不出「沒有人被鎖」與「根本不會鎖」**，而那兩件事意義相反：
   * `APPLICATION_ACCOUNT_LOCK_ENABLED` 預設 false，關閉時登入路徑不寫入 `lockedAt`，
   * 清單於是永遠是空的。
   */
  lockEnabled: boolean;
}

export interface ListAccountLocksUseCase {
  execute(query: ListAccountLocksQuery): Promise<ListAccountLocksResult>;
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
