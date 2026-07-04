/** Mirrors the DTOs returned by @profitlens/api. */

export type SyncStatus = "PENDING" | "SYNCING" | "COMPLETED" | "FAILED";
export type LeakType =
  | "DISCOUNT_OVERUSE"
  | "HIGH_REFUND_PRODUCT"
  | "UNPROFITABLE_ORDER"
  | "FREE_SHIPPING_LOSS";
export type LeakSeverity = "LOW" | "MEDIUM" | "HIGH";
export type LeakStatus = "OPEN" | "DISMISSED" | "RESOLVED";

export interface DashboardSummary {
  shop: {
    shopDomain: string;
    currencyCode: string;
    syncStatus: SyncStatus;
    lastSyncAt: string | null;
  };
  totals: {
    orderCount: number;
    totalRevenue: string;
    totalDiscounts: string;
    totalRefunded: string;
    estimatedTotalLeak: string;
  };
  openLeakCount: number;
  windowDays: number;
}

export interface Leak {
  id: string;
  type: LeakType;
  severity: LeakSeverity;
  status: LeakStatus;
  title: string;
  description: string;
  estimatedLossAmount: string;
  currencyCode: string;
  detectedAt: string;
}

export interface LeaksResponse {
  leaks: Leak[];
}
