import {
  Banner,
  BlockStack,
  Card,
  Layout,
  Page,
  SkeletonBodyText,
  Tabs,
  Text,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import LeakList from "../components/LeakList";
import SummaryCards from "../components/SummaryCards";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/format";
import type { DashboardSummary, Leak, LeakStatus, LeaksResponse } from "../types/api";

const TABS: Array<{ id: string; content: string; status: LeakStatus | undefined }> = [
  { id: "open", content: "Open", status: "OPEN" },
  { id: "resolved", content: "Resolved", status: "RESOLVED" },
  { id: "dismissed", content: "Dismissed", status: "DISMISSED" },
  { id: "all", content: "All", status: undefined },
];

export default function DashboardPage() {
  const { mutate } = useSWRConfig();
  const [selectedTab, setSelectedTab] = useState(0);
  const [updatingLeakId, setUpdatingLeakId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeTab = TABS[selectedTab] ?? TABS[0]!;
  const leaksKey = activeTab.status ? `/api/leaks?status=${activeTab.status}` : "/api/leaks";

  const summaryQuery = useSWR<DashboardSummary>("/api/dashboard");
  const leaksQuery = useSWR<LeaksResponse>(leaksKey);

  const refreshAll = useCallback(() => {
    void mutate("/api/dashboard");
    void mutate((key) => typeof key === "string" && key.startsWith("/api/leaks"));
  }, [mutate]);

  const handleUpdateStatus = useCallback(
    async (leakId: string, status: LeakStatus) => {
      setUpdatingLeakId(leakId);
      setActionError(null);
      try {
        await apiFetch<{ leak: Leak }>(`/api/leaks/${leakId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        refreshAll();
        window.shopify?.toast?.show(
          status === "OPEN" ? "Leak reopened" : `Leak marked ${status.toLowerCase()}`,
        );
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Failed to update leak");
      } finally {
        setUpdatingLeakId(null);
      }
    },
    [refreshAll],
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setActionError(null);
    try {
      await apiFetch<{ status: string }>("/api/sync", { method: "POST" });
      window.shopify?.toast?.show("Sync started. New data will appear shortly.");
      refreshAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to start sync");
    } finally {
      setSyncing(false);
    }
  }, [refreshAll]);

  const summary = summaryQuery.data;
  const isSyncing = summary?.shop.syncStatus === "SYNCING" || summary?.shop.syncStatus === "PENDING";

  return (
    <Page
      title="ProfitLens"
      subtitle={
        summary
          ? summary.shop.lastSyncAt
            ? `Last synced ${formatDate(summary.shop.lastSyncAt)}`
            : "Waiting for first sync"
          : undefined
      }
      primaryAction={{
        content: "Re-sync orders",
        onAction: () => void handleSync(),
        loading: syncing,
        disabled: isSyncing,
      }}
    >
      <Layout>
        {actionError && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setActionError(null)}>
              {actionError}
            </Banner>
          </Layout.Section>
        )}

        {summaryQuery.error && (
          <Layout.Section>
            <Banner tone="critical" title="Could not load dashboard">
              {summaryQuery.error instanceof Error
                ? summaryQuery.error.message
                : "An unexpected error occurred."}
            </Banner>
          </Layout.Section>
        )}

        {isSyncing && (
          <Layout.Section>
            <Banner tone="info" title="Order sync in progress">
              We are importing and analyzing your orders. Results will appear here automatically —
              check back in a few minutes.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {summary ? (
            <SummaryCards summary={summary} />
          ) : (
            <Card>
              <SkeletonBodyText lines={4} />
            </Card>
          )}
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Detected profit leaks
            </Text>
            <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} />
            {leaksQuery.data ? (
              <LeakList
                leaks={leaksQuery.data.leaks}
                updatingLeakId={updatingLeakId}
                onUpdateStatus={(id, status) => void handleUpdateStatus(id, status)}
              />
            ) : leaksQuery.error ? (
              <Banner tone="critical" title="Could not load leaks">
                {leaksQuery.error instanceof Error
                  ? leaksQuery.error.message
                  : "An unexpected error occurred."}
              </Banner>
            ) : (
              <Card>
                <SkeletonBodyText lines={6} />
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
