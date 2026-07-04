import type { Order, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface UpsertOrderInput {
  shopifyOrderId: string;
  orderNumber: string;
  totalPrice: string;
  subtotalPrice: string;
  totalDiscounts: string;
  totalShipping: string;
  totalRefunded: string;
  totalTax: string;
  discountCodes: string[];
  financialStatus: string;
  currencyCode: string;
  processedAt: Date;
  lineItems: Array<{
    shopifyProductId: string | null;
    title: string;
    quantity: number;
    price: string;
    totalDiscount: string;
  }>;
}

export interface OrderAggregates {
  orderCount: number;
  totalRevenue: string;
  totalDiscounts: string;
  totalRefunded: string;
  totalShipping: string;
}

export class OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Idempotent upsert keyed on (shopId, shopifyOrderId). Replaces line items. */
  async upsert(shopId: string, input: UpsertOrderInput): Promise<Order> {
    const data = {
      orderNumber: input.orderNumber,
      totalPrice: new Prisma.Decimal(input.totalPrice),
      subtotalPrice: new Prisma.Decimal(input.subtotalPrice),
      totalDiscounts: new Prisma.Decimal(input.totalDiscounts),
      totalShipping: new Prisma.Decimal(input.totalShipping),
      totalRefunded: new Prisma.Decimal(input.totalRefunded),
      totalTax: new Prisma.Decimal(input.totalTax),
      discountCodes: input.discountCodes,
      financialStatus: input.financialStatus,
      currencyCode: input.currencyCode,
      processedAt: input.processedAt,
    };

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.upsert({
        where: {
          shopId_shopifyOrderId: { shopId, shopifyOrderId: input.shopifyOrderId },
        },
        create: { shopId, shopifyOrderId: input.shopifyOrderId, ...data },
        update: data,
      });

      await tx.orderLineItem.deleteMany({ where: { orderId: order.id } });
      if (input.lineItems.length > 0) {
        await tx.orderLineItem.createMany({
          data: input.lineItems.map((item) => ({
            orderId: order.id,
            shopifyProductId: item.shopifyProductId,
            title: item.title,
            quantity: item.quantity,
            price: new Prisma.Decimal(item.price),
            totalDiscount: new Prisma.Decimal(item.totalDiscount),
          })),
        });
      }

      return order;
    });
  }

  findManyByShop(shopId: string, opts: { since?: Date; take?: number } = {}) {
    return this.prisma.order.findMany({
      where: {
        shopId,
        ...(opts.since ? { processedAt: { gte: opts.since } } : {}),
      },
      include: { lineItems: true },
      orderBy: { processedAt: "desc" },
      ...(opts.take ? { take: opts.take } : {}),
    });
  }

  async aggregatesForShop(shopId: string, since?: Date): Promise<OrderAggregates> {
    const result = await this.prisma.order.aggregate({
      where: {
        shopId,
        ...(since ? { processedAt: { gte: since } } : {}),
      },
      _count: { id: true },
      _sum: {
        totalPrice: true,
        totalDiscounts: true,
        totalRefunded: true,
        totalShipping: true,
      },
    });

    return {
      orderCount: result._count.id,
      totalRevenue: (result._sum.totalPrice ?? new Prisma.Decimal(0)).toFixed(2),
      totalDiscounts: (result._sum.totalDiscounts ?? new Prisma.Decimal(0)).toFixed(2),
      totalRefunded: (result._sum.totalRefunded ?? new Prisma.Decimal(0)).toFixed(2),
      totalShipping: (result._sum.totalShipping ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
