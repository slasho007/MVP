import type { LeakStatus, ProfitLeak, Shop } from "@prisma/client";
import type { OrderRepository } from "../repositories/order.repository.js";
import type { ProfitLeakRepository } from "../repositories/profit-leak.repository.js";

const SUMMARY_WINDOW_DAYS = 90;

export interface DashboardSummary {
  shop: {
    shopDomain: string;
    currencyCode: string;
    syncStatus: string;
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

export interface LeakDto {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  estimatedLossAmount: string;
  currencyCode: string;
  detectedAt: string;
}

/** Read-side aggregation for the merchant dashboard. */
export class DashboardService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly leakRepo: ProfitLeakRepository,
  ) {}

  async getSummary(shop: Shop): Promise<DashboardSummary> {
    const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [aggregates, estimatedTotalLeak, openLeaks] = await Promise.all([
      this.orderRepo.aggregatesForShop(shop.id, since),
      this.leakRepo.totalEstimatedLoss(shop.id),
      this.leakRepo.findManyByShop(shop.id, { status: "OPEN" }),
    ]);

    return {
      shop: {
        shopDomain: shop.shopDomain,
        currencyCode: shop.currencyCode,
        syncStatus: shop.syncStatus,
        lastSyncAt: shop.lastSyncAt?.toISOString() ?? null,
      },
      totals: {
        orderCount: aggregates.orderCount,
        totalRevenue: aggregates.totalRevenue,
        totalDiscounts: aggregates.totalDiscounts,
        totalRefunded: aggregates.totalRefunded,
        estimatedTotalLeak: estimatedTotalLeak,
      },
      openLeakCount: openLeaks.length,
      windowDays: SUMMARY_WINDOW_DAYS,
    };
  }

  async listLeaks(shopId: string, status?: LeakStatus): Promise<LeakDto[]> {
    const leaks = await this.leakRepo.findManyByShop(shopId, { status });
    return leaks.map(toLeakDto);
  }

  async updateLeakStatus(shopId: string, leakId: string, status: LeakStatus): Promise<LeakDto | null> {
    const existing = await this.leakRepo.findByIdForShop(leakId, shopId);
    if (!existing) return null;
    const updated = await this.leakRepo.updateStatus(leakId, shopId, status);
    return toLeakDto(updated);
  }
}

function toLeakDto(leak: ProfitLeak): LeakDto {
  return {
    id: leak.id,
    type: leak.type,
    severity: leak.severity,
    status: leak.status,
    title: leak.title,
    description: leak.description,
    estimatedLossAmount: leak.estimatedLossAmount.toFixed(2),
    currencyCode: leak.currencyCode,
    detectedAt: leak.detectedAt.toISOString(),
  };
}
