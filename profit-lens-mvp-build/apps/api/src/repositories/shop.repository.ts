import type { PrismaClient, Shop, SyncStatus } from "@prisma/client";

export interface UpsertShopInput {
  shopDomain: string;
  accessToken: string;
  scopes: string;
  currencyCode?: string;
}

export class ShopRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByDomain(shopDomain: string): Promise<Shop | null> {
    return this.prisma.shop.findUnique({ where: { shopDomain } });
  }

  findById(id: string): Promise<Shop | null> {
    return this.prisma.shop.findUnique({ where: { id } });
  }

  /** Installs or reinstalls a shop, reactivating it if previously uninstalled. */
  upsertOnInstall(input: UpsertShopInput): Promise<Shop> {
    return this.prisma.shop.upsert({
      where: { shopDomain: input.shopDomain },
      create: {
        shopDomain: input.shopDomain,
        accessToken: input.accessToken,
        scopes: input.scopes,
        currencyCode: input.currencyCode ?? "USD",
      },
      update: {
        accessToken: input.accessToken,
        scopes: input.scopes,
        isActive: true,
        uninstalledAt: null,
        ...(input.currencyCode ? { currencyCode: input.currencyCode } : {}),
      },
    });
  }

  markUninstalled(shopDomain: string): Promise<Shop> {
    return this.prisma.shop.update({
      where: { shopDomain },
      data: {
        isActive: false,
        uninstalledAt: new Date(),
        // Access token is invalidated by Shopify on uninstall; do not keep it.
        accessToken: "",
      },
    });
  }

  updateSyncStatus(shopId: string, syncStatus: SyncStatus, lastSyncAt?: Date): Promise<Shop> {
    return this.prisma.shop.update({
      where: { id: shopId },
      data: { syncStatus, ...(lastSyncAt ? { lastSyncAt } : {}) },
    });
  }
}
