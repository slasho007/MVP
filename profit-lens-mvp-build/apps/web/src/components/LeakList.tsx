import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { Fragment } from "react";
import { formatDate, formatMoney } from "../lib/format";
import type { Leak, LeakSeverity, LeakStatus, LeakType } from "../types/api";

const SEVERITY_TONE: Record<LeakSeverity, "critical" | "warning" | "info"> = {
  HIGH: "critical",
  MEDIUM: "warning",
  LOW: "info",
};

const TYPE_LABEL: Record<LeakType, string> = {
  DISCOUNT_OVERUSE: "Discount overuse",
  HIGH_REFUND_PRODUCT: "High refunds",
  UNPROFITABLE_ORDER: "Unprofitable orders",
  FREE_SHIPPING_LOSS: "Free shipping loss",
};

interface LeakListProps {
  leaks: Leak[];
  updatingLeakId: string | null;
  onUpdateStatus: (leakId: string, status: LeakStatus) => void;
}

export default function LeakList({ leaks, updatingLeakId, onUpdateStatus }: LeakListProps) {
  if (leaks.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No profit leaks here"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>
            Nothing detected in this view. Leaks appear automatically as your orders are analyzed.
          </p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card padding="0">
      {leaks.map((leak, index) => (
        <Fragment key={leak.id}>
          {index > 0 && <Divider />}
          <Box padding="400">
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Badge tone={SEVERITY_TONE[leak.severity]}>{leak.severity}</Badge>
                <Badge>{TYPE_LABEL[leak.type]}</Badge>
                <Text as="span" variant="bodySm" tone="subdued">
                  Detected {formatDate(leak.detectedAt)}
                </Text>
              </InlineStack>

              <InlineStack gap="400" align="space-between" blockAlign="start" wrap>
                <BlockStack gap="100">
                  <Text as="h3" variant="headingMd">
                    {leak.title}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {leak.description}
                  </Text>
                </BlockStack>
                <Text as="p" variant="headingMd" tone="critical">
                  {formatMoney(leak.estimatedLossAmount, leak.currencyCode)}
                </Text>
              </InlineStack>

              <InlineStack gap="200">
                {leak.status === "OPEN" ? (
                  <>
                    <Button
                      size="slim"
                      loading={updatingLeakId === leak.id}
                      onClick={() => onUpdateStatus(leak.id, "RESOLVED")}
                    >
                      Mark resolved
                    </Button>
                    <Button
                      size="slim"
                      variant="tertiary"
                      loading={updatingLeakId === leak.id}
                      onClick={() => onUpdateStatus(leak.id, "DISMISSED")}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <Button
                    size="slim"
                    variant="tertiary"
                    loading={updatingLeakId === leak.id}
                    onClick={() => onUpdateStatus(leak.id, "OPEN")}
                  >
                    Reopen
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </Fragment>
      ))}
    </Card>
  );
}
