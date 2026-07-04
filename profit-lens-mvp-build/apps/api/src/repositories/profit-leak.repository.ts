import type { LeakSeverity, LeakStatus, LeakType, PrismaClient, ProfitLeak } from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface UpsertLeakInput {
  type: LeakType;
  severity: LeakSeverity;
  title: string;
  description: string;
  estimatedLossAmount: string;
  currencyCode: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export class ProfitLeakRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Upserts a leak keyed on (shopId, type, dedupeKey).
   * Re-detection refreshes amounts without resetting a DISMISSED status.
   */
  upsert(shopId: string, input: UpsertLeakInput): Promise<ProfitLeak> {
    const amount = new Prisma.Decimal(input.estimatedLossAmount);
    return this.prisma.profitLeak.upsert({
      where: {
        shopId_type_dedupeKey: { shopId, type: input.type, dedupeKey: input.dedupeKey },
      },
      create: {
        shopId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        description: input.description,
        estimatedLossAmount: amount,
        currencyCode: input.currencyCode,
        dedupeKey: input.dedupeKey,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        severity: input.severity,
        title: input.title,
        description: input.description,
        estimatedLossAmount: amount,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        detectedAt: new Date(),
      },
    });
  }

  findManyByShop(
    shopId: string,
    opts: { status?: LeakStatus; type?: LeakType } = {},
  ): Promise<ProfitLeak[]> {
    return this.prisma.profitLeak.findMany({
      where: {
        shopId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.type ? { type: opts.type } : {}),
      },
      orderBy: [{ estimatedLossAmount: "desc" }, { detectedAt: "desc" }],
    });
  }

  findByIdForShop(id: string, shopId: string): Promise<ProfitLeak | null> {
    return this.prisma.profitLeak.findFirst({ where: { id, shopId } });
  }

  updateStatus(id: string, shopId: string, status: LeakStatus): Promise<ProfitLeak> {
    return this.prisma.profitLeak.update({
      where: { id, shopId },
      data: { status },
    });
  }

  async totalEstimatedLoss(shopId: string): Promise<string> {
    const result = await this.prisma.profitLeak.aggregate({
      where: { shopId, status: "OPEN" },
      _sum: { estimatedLossAmount: true },
    });
    return (result._sum.estimatedLossAmount ?? new Prisma.Decimal(0)).toFixed(2);
  }
}
