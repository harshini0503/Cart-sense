import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { apiFetch } from "../api";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type NotificationItem = {
  id: number;
  catalogItemId: number | null;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "Unknown time";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function labelForType(type: string) {
  if (type === "essential_threshold") return "Essential";
  if (type === "inventory_update") return "Inventory";
  if (type === "insight_balance") return "Insight";
  return type;
}

export function NotificationsPage({ householdId }: { householdId: number }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>(`/api/notifications?household_id=${householdId}`, { token });
      setRows(res.notifications || []);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [householdId, token]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.isRead).length, [rows]);

  async function markRead(notificationId: number) {
    if (!token) return;
    try {
      await apiFetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ household_id: householdId, is_read: true }),
      });
      setRows((current) => current.map((row) => (row.id === notificationId ? { ...row, isRead: true } : row)));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    if (!token) return;
    const unreadRows = rows.filter((row) => !row.isRead);
    await Promise.all(
      unreadRows.map((row) =>
        apiFetch(`/api/notifications/${row.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ household_id: householdId, is_read: true }),
        }).catch(() => undefined)
      )
    );
    setRows((current) => current.map((row) => ({ ...row, isRead: true })));
  }

  return (
    <GlassPanel sx={{ p: 2.4 }}>
      <Stack spacing={2.2}>
        <SectionHeader
          eyebrow="Household inbox"
          title="Notifications"
          subtitle="This tab collects the important reminders for the household, including low-stock essentials, inventory changes, and insight nudges."
          action={
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricBadge label="Unread" value={unreadCount} />
              <Button variant="outlined" onClick={markAllRead} disabled={unreadCount === 0} sx={{ borderRadius: 999, fontWeight: 900 }}>
                Mark all read
              </Button>
            </Stack>
          }
        />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : errorMsg ? (
          <Alert severity="error">{errorMsg}</Alert>
        ) : rows.length === 0 ? (
          <Alert severity="info">No notifications yet.</Alert>
        ) : (
          <Box className="cs-stagger" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.2 }}>
            {rows.map((row) => (
              <Box
                key={row.id}
                sx={{
                  ...innerCardSx,
                  p: 1.4,
                  borderColor: row.isRead ? "rgba(255,255,255,0.1)" : "rgba(124,255,178,0.32)",
                  background: row.isRead
                    ? "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))"
                    : "linear-gradient(135deg, rgba(124,255,178,0.08), rgba(255,255,255,0.03))",
                }}
              >
                <Stack spacing={1}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                      <MetricBadge label="Type" value={labelForType(row.type)} />
                      <MetricBadge label="State" value={row.isRead ? "Read" : "Unread"} />
                    </Stack>
                    {!row.isRead ? (
                      <Button size="small" variant="text" onClick={() => markRead(row.id)} sx={{ borderRadius: 999, fontWeight: 900 }}>
                        Mark read
                      </Button>
                    ) : null}
                  </Stack>
                  <Typography sx={{ fontWeight: row.isRead ? 600 : 900, display: "flex", gap: 1, alignItems: "flex-start" }}>
                    <NotificationsNoneIcon sx={{ fontSize: 18, mt: 0.1, opacity: 0.8 }} />
                    <span>{row.message}</span>
                  </Typography>
                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                    Updated {formatDateTime(row.updatedAt)}
                    {row.createdAt && row.createdAt !== row.updatedAt ? ` · created ${formatDateTime(row.createdAt)}` : ""}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Box>
        )}
      </Stack>
    </GlassPanel>
  );
}
