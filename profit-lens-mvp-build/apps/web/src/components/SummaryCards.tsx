import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";
import { formatMoney } from "../lib/format";
import type { DashboardSummary } from "../types/api";

interface SummaryCardsProps {
  summary: DashboardSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const { totals, shop, openLeakCount, windowDays } = summary;

  const cards: Array<{ label: string; value: string; tone?: "critical" }> = [
    {
      label: `Estimated profit leak`,
      value: formatMoney(totals.estimatedTotalLeak, shop.currencyCode),
      tone: "critical",
    },
    {
      label: `Open leaks`,
      value: String(openLeakCount),
    },
    {
      label: `Revenue (${windowDays}d)`,
      value: formatMoney(totals.totalRevenue, shop.currencyCode),
    },
    {
      label: `Orders (${windowDays}d)`,
      value: String(totals.orderCount),
    },
    {
      label: `Discounts given (${windowDays}d)`,
      value: formatMoney(totals.totalDiscounts, shop.currencyCode),
    },
    {
      label: `Refunded (${windowDays}d)`,
      value: formatMoney(totals.totalRefunded, shop.currencyCode),
    },
  ];

  return (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
      {cards.map((card) => (
        <Card key={card.label}>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm" tone="subdued">
              {card.label}
            </Text>
            <Text as="p" variant="headingLg" tone={card.tone}>
              {card.value}
            </Text>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}
