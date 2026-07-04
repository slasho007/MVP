import type { PrismaClient } from "@prisma/client";

export class WebhookEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Records a webhook delivery id. Returns false if it was already processed
   * (used for idempotent webhook handling).
   */
  async recordIfNew(webhookId: string, topic: string, shopId?: string): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { webhookId, topic, shopId: shopId ?? null },
      });
      return true;
    } catch (error: unknown) {
      // Unique constraint violation = already processed.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }
}
