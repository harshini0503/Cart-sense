import React, { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ShoppingCartCheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import { apiFetch } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type PurchaseHistoryItem = {
  itemName: string;
  category: string;
  quantity: number;
  storeName: string | null;
};

type PurchaseHistoryRow = {
  id: number;
  source: string;
  createdAt: string | null;
  createdByName?: string;
  purchasedByName?: string;
  recordedByName?: string;
  items: PurchaseHistoryItem[];
};

function formatDateTime(value: string | null) {
  if (!value) return "Unknown time";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export function PurchaseHistoryPage({ householdId }: { householdId: number }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiFetch<{ purchases: PurchaseHistoryRow[] }>(`/api/purchases/history?household_id=${householdId}`, { token });
        if (!cancelled) setRows(res.purchases || []);
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || "Could not load purchase history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, token]);

  return (
    <GlassPanel sx={{ p: 2.4 }}>
      <Stack spacing={2.2}>
        <SectionHeader
          eyebrow="Recent activity"
          title="Purchase history"
          subtitle="Every checkout and every receipt confirmation is recorded here so the household can see who bought what and when it was added."
          action={<MetricBadge label="Entries" value={rows.length} />}
        />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : errorMsg ? (
          <Alert severity="error">{errorMsg}</Alert>
        ) : rows.length === 0 ? (
          <Alert severity="info">No purchases yet.</Alert>
        ) : (
          <Stack spacing={1.2} className="cs-stagger">
            {rows.map((purchase) => {
              const purchaserName = purchase.purchasedByName || purchase.createdByName || "Unknown";
              const recordedByName = purchase.recordedByName || purchase.createdByName || purchaserName;
              const isReceipt = purchase.source === "receipt";
              return (
                <Box key={purchase.id} sx={{ ...innerCardSx, p: 1.5 }}>
                  <Stack spacing={1.25}>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2}>
                      <Box>
                        <Typography sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                          {isReceipt ? <ReceiptLongIcon fontSize="small" /> : <ShoppingCartCheckoutIcon fontSize="small" />}
                          {isReceipt ? "Receipt confirmation" : "Shopping list checkout"}
                        </Typography>
                        <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.45 }}>
                          Purchased by {purchaserName} on {formatDateTime(purchase.createdAt)}
                          {recordedByName !== purchaserName ? ` · recorded by ${recordedByName}` : ""}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <MetricBadge label="Items" value={purchase.items.length} />
                        <MetricBadge label="Source" value={purchase.source} />
                      </Stack>
                    </Stack>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1 }}>
                      {purchase.items.map((item, idx) => (
                        <Box key={`${purchase.id}-${idx}`} sx={{ ...innerCardSx, p: 1.1 }}>
                          <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between">
                            <Stack direction="row" spacing={1.1} alignItems="center">
                              <Box
                                sx={{
                                  minWidth: 48,
                                  height: 48,
                                  borderRadius: 3,
                                  display: "grid",
                                  placeItems: "center",
                                  background: "linear-gradient(135deg, rgba(76,174,255,0.18), rgba(124,255,178,0.14))",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }}
                              >
                                <HistoryIcon sx={{ fontSize: 18 }} />
                              </Box>
                              <Box>
                                <Typography sx={{ fontWeight: 900 }}>{item.itemName}</Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.45, flexWrap: "wrap" }}>
                                  <CategoryChip category={item.category} />
                                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                                    {item.storeName || "Unknown store"}
                                  </Typography>
                                </Stack>
                              </Box>
                            </Stack>
                            <Typography sx={{ fontWeight: 900 }}>{item.quantity}</Typography>
                          </Stack>
                        </Box>
                      ))}
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
    </GlassPanel>
  );
}
