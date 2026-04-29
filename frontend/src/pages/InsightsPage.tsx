import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import BalanceIcon from "@mui/icons-material/Balance";
import LocalMallIcon from "@mui/icons-material/LocalMall";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type InsightCategoryBreakdown = { category: string; quantity: number };
type CategoryAnalysis = { category: string; quantity: number; share: number; status: string; message: string };
type SwapSuggestion = {
  fromCategory: string;
  toCategory: string;
  title: string;
  reason: string;
  exampleItems?: string[];
};
type BalanceSummary = { tone: string; message: string };
type RefillReminder = {
  catalogItemId: number;
  itemName: string;
  category: string;
  currentQuantity: number;
  recentPurchasedQuantity: number;
  preferredStoreName: string | null;
  thresholdQuantity: number;
  reason: string;
};
type InsightNotification = { id: number; message: string; isRead: boolean; updatedAt: string | null };

type InsightData = {
  categoryBreakdown: InsightCategoryBreakdown[];
  categoryAnalysis: CategoryAnalysis[];
  swaps: SwapSuggestion[];
  balanceSummary: BalanceSummary;
  dominantCategory: string | null;
  refillReminders: RefillReminder[];
  notifications: InsightNotification[];
  analytics: {
    topItems: { itemName: string; quantity: number }[];
    frequentlyPurchasedItems: { itemName: string; quantity: number }[];
    mostVisitedStores: { storeName: string; quantity?: number; visits?: number }[];
  };
};

const RANGE_OPTIONS = [7, 14, 30];

function prettyCategory(value?: string) {
  return (value || "groceries").replace(/_/g, " ");
}

function normalizeSwapForDisplay(swap: SwapSuggestion): SwapSuggestion {
  const looksLegacy = /\sto\s/i.test(swap.title || "") || /Consider swapping some/i.test(swap.reason || "");
  if (!looksLegacy) return swap;
  const toCategory = swap.toCategory || "groceries";
  const fromCategory = swap.fromCategory || "other";
  return {
    ...swap,
    title: `Add more ${prettyCategory(toCategory)} next trip`,
    reason: `Recent purchases are heavier on ${prettyCategory(fromCategory)}. Instead of replacing specific items one-for-one, round out the basket by adding a few ${prettyCategory(toCategory)} staples on the next trip.`,
  };
}

function toneStyles(tone?: string) {
  if (tone === "good") return { border: "rgba(124,255,178,0.24)", bg: "linear-gradient(135deg, rgba(124,255,178,0.12), rgba(255,255,255,0.03))" };
  if (tone === "watch" || tone === "nudge") return { border: "rgba(255,208,109,0.24)", bg: "linear-gradient(135deg, rgba(255,208,109,0.12), rgba(255,255,255,0.03))" };
  return { border: "rgba(76,174,255,0.24)", bg: "linear-gradient(135deg, rgba(76,174,255,0.12), rgba(255,255,255,0.03))" };
}

export function InsightsPage({ householdId }: { householdId: number }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(7);
  const [data, setData] = useState<InsightData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await apiFetch<InsightData>(`/api/households/${householdId}/insights?rangeDays=${rangeDays}`, { token });
        if (!cancelled) setData(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, rangeDays, token]);

  const chartData = useMemo(() => data?.categoryBreakdown?.map((b) => ({ category: b.category, quantity: b.quantity })) || [], [data]);
  const totalQty = useMemo(() => chartData.reduce((sum, row) => sum + Number(row.quantity || 0), 0), [chartData]);
  const tone = toneStyles(data?.balanceSummary?.tone);

  return (
    <GlassPanel sx={{ p: 2.4 }}>
      <Stack spacing={2.2}>
        <SectionHeader
          eyebrow="Household nutrition"
          title="Balance summary, category mix, and smarter swap ideas"
          subtitle="CartSense reads your confirmed purchases, groups them by category, and nudges the household toward a more balanced basket."
          action={
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {RANGE_OPTIONS.map((days) => (
                <Button
                  key={days}
                  variant={rangeDays === days ? "contained" : "outlined"}
                  size="small"
                  onClick={() => setRangeDays(days)}
                  sx={{ borderRadius: 999, fontWeight: 900 }}
                >
                  {days}d
                </Button>
              ))}
            </Stack>
          }
        />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !data ? (
          <Alert severity="info">No insights yet. Confirm a receipt or checkout a list.</Alert>
        ) : (
          <>
            <Box sx={{ ...innerCardSx, p: 2, borderColor: tone.border, background: tone.bg }} className="cs-sheen">
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                    <BalanceIcon fontSize="small" /> Balance summary
                  </Typography>
                  <Typography sx={{ mt: 0.7, color: "rgba(255,255,255,0.74)" }}>{data.balanceSummary?.message}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <MetricBadge label="Window" value={`${rangeDays} days`} />
                  <MetricBadge label="Dominant" value={data.dominantCategory || "None"} />
                  <MetricBadge label="Basket qty" value={totalQty.toFixed(1)} />
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.25fr 0.75fr" }, gap: 1.4 }}>
              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.2, display: "flex", alignItems: "center", gap: 1 }}>
                  <AutoGraphIcon fontSize="small" /> Category purchases in the last {rangeDays} days
                </Typography>
                <Box sx={{ height: 290 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                      <XAxis dataKey="category" stroke="rgba(255,255,255,0.62)" tickLine={false} axisLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.62)" tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        contentStyle={{ background: "#0f1b2d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: "#fff", boxShadow: "0 12px 36px rgba(0,0,0,0.32)" }}
                        labelStyle={{ color: "#fff", fontWeight: 800 }}
                        itemStyle={{ color: "#fff" }}
                        formatter={(value: number) => [`${value}`, "Quantity"]}
                      />
                      <Bar dataKey="quantity" fill="rgba(124,255,178,0.78)" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>

              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.2, display: "flex", alignItems: "center", gap: 1 }}>
                  <LightbulbIcon fontSize="small" /> Swap suggestions
                </Typography>
                <Stack spacing={1}>
                  {data.swaps?.length ? (
                    data.swaps.slice(0, 4).map((rawSwap, idx) => {
                      const swap = normalizeSwapForDisplay(rawSwap);
                      return (
                        <Box key={idx} sx={{ ...innerCardSx, p: 1.15 }}>
                          <Typography sx={{ fontWeight: 900 }}>{swap.title}</Typography>
                          <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.35 }}>{swap.reason}</Typography>
                          {swap.exampleItems?.length ? (
                            <Typography sx={{ fontSize: 12, mt: 0.75, fontWeight: 700 }}>
                              Try: {swap.exampleItems.join(", ")}
                            </Typography>
                          ) : null}
                          <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap" }}>
                            <CategoryChip category={swap.fromCategory} />
                            <CategoryChip category={swap.toCategory} />
                          </Stack>
                        </Box>
                      );
                    })
                  ) : (
                    <Alert severity="success">Your basket looks fairly balanced right now, so no swaps are needed.</Alert>
                  )}
                </Stack>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.4 }}>
              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.1 }}>Category analysis</Typography>
                <Box className="cs-stagger" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                  {data.categoryAnalysis?.map((entry) => (
                    <Box key={entry.category} sx={{ ...innerCardSx, p: 1.1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <CategoryChip category={entry.category} />
                        <Typography sx={{ fontWeight: 900 }}>{(entry.share * 100).toFixed(0)}%</Typography>
                      </Stack>
                      <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.8 }}>{entry.message}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.1 }}>Essential refill reminders</Typography>
                <Stack spacing={1}>
                  {data.refillReminders?.length ? (
                    data.refillReminders.map((item) => (
                      <Box key={item.catalogItemId} sx={{ ...innerCardSx, p: 1.1 }}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                          <Box>
                            <Typography sx={{ fontWeight: 900 }}>{item.itemName}</Typography>
                            <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.35 }}>
                              {item.reason}{item.preferredStoreName ? ` Preferred store: ${item.preferredStoreName}.` : ""}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <MetricBadge label="Now" value={item.currentQuantity} />
                            <MetricBadge label="Threshold" value={item.thresholdQuantity} />
                          </Stack>
                        </Stack>
                      </Box>
                    ))
                  ) : (
                    <Alert severity="info">No refill reminders right now.</Alert>
                  )}
                </Stack>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "0.9fr 1.1fr" }, gap: 1.4 }}>
              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.1 }}>Active notifications</Typography>
                <Stack spacing={1}>
                  {data.notifications?.length ? (
                    data.notifications.map((note) => (
                      <Box key={note.id} sx={{ ...innerCardSx, p: 1.1 }}>
                        <Typography sx={{ fontWeight: note.isRead ? 600 : 900 }}>{note.message}</Typography>
                        {note.updatedAt ? (
                          <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.35 }}>
                            Updated {new Date(note.updatedAt).toLocaleString()}
                          </Typography>
                        ) : null}
                      </Box>
                    ))
                  ) : (
                    <Alert severity="success">No active insight-related notifications.</Alert>
                  )}
                </Stack>
              </Box>

              <Box sx={{ ...innerCardSx, p: 1.6 }}>
                <Typography sx={{ fontWeight: 1000, mb: 1.1, display: "flex", alignItems: "center", gap: 1 }}>
                  <LocalMallIcon fontSize="small" /> Household analytics
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                  <Box sx={{ ...innerCardSx, p: 1.1 }}>
                    <Typography sx={{ fontWeight: 900, mb: 0.8 }}>Top purchased items</Typography>
                    <Stack spacing={0.8}>
                      {data.analytics?.topItems?.length ? data.analytics.topItems.map((item) => (
                        <Stack key={item.itemName} direction="row" justifyContent="space-between" spacing={1}>
                          <Typography>{item.itemName}</Typography>
                          <Typography sx={{ fontWeight: 900 }}>{item.quantity}</Typography>
                        </Stack>
                      )) : <Typography className="cs-muted">No purchases yet.</Typography>}
                    </Stack>
                  </Box>
                  <Box sx={{ ...innerCardSx, p: 1.1 }}>
                    <Typography sx={{ fontWeight: 900, mb: 0.8 }}>Most visited stores</Typography>
                    <Stack spacing={0.8}>
                      {data.analytics?.mostVisitedStores?.length ? data.analytics.mostVisitedStores.map((store) => (
                        <Stack key={store.storeName} direction="row" justifyContent="space-between" spacing={1}>
                          <Typography>{store.storeName}</Typography>
                          <Typography sx={{ fontWeight: 900 }}>{store.visits ?? store.quantity ?? 0}</Typography>
                        </Stack>
                      )) : <Typography className="cs-muted">No store visits yet.</Typography>}
                    </Stack>
                  </Box>
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </GlassPanel>
  );
}
