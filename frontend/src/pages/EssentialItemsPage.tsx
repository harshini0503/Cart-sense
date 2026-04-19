import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import SaveIcon from "@mui/icons-material/Save";
import { apiFetch } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type InventoryRow = {
  catalogItemId: number;
  itemName: string;
  category: string;
  quantity: number;
  essentialThreshold: number | null;
  essentialEmailEnabled: boolean;
};

type EditDraft = {
  catalogItemId: number;
  thresholdQuantity: number;
  emailEnabled: boolean;
};

export function EssentialItemsPage({ householdId }: { householdId: number }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [search, setSearch] = useState("");

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ inventory: InventoryRow[] }>(`/api/inventory?household_id=${householdId}`, { token });
      setRows(res.inventory || []);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load essential items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [householdId, token]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesText = !search.trim() || row.itemName.toLowerCase().includes(search.trim().toLowerCase());
        const matchesCategory = filterCategory === "all" || row.category === filterCategory;
        const matchesTracked = !showOnlyTracked || (row.essentialThreshold ?? 0) > 0;
        return matchesText && matchesCategory && matchesTracked;
      }),
    [filterCategory, rows, search, showOnlyTracked]
  );

  const trackedCount = rows.filter((row) => (row.essentialThreshold ?? 0) > 0).length;
  const lowCount = rows.filter((row) => (row.essentialThreshold ?? 0) > 0 && row.quantity <= (row.essentialThreshold ?? 0)).length;

  async function saveDraft() {
    if (!token || !editDraft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/essentials/${editDraft.catalogItemId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          household_id: householdId,
          threshold_quantity: editDraft.thresholdQuantity,
          email_enabled: editDraft.thresholdQuantity > 0 ? editDraft.emailEnabled : false,
        }),
      });
      setEditDraft(null);
      await refresh();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not save essential item settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassPanel sx={{ p: 2.4 }}>
      <Stack spacing={2.2}>
        <SectionHeader
          eyebrow="Refill rules"
          title="Essential items and threshold alerts"
          subtitle="Choose the household items that should trigger reminders. When stock drops below the threshold, CartSense can notify the household and optionally send email too."
          action={
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricBadge label="Tracked" value={trackedCount} />
              <MetricBadge label="Below threshold" value={lowCount} />
            </Stack>
          }
        />

        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} alignItems={{ xs: "stretch", lg: "center" }}>
          <TextField label="Search item" size="small" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
          <TextField
            select
            label="Filter category"
            size="small"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All categories</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: { lg: 1 } }}>
            <Checkbox checked={showOnlyTracked} onChange={(e) => setShowOnlyTracked(e.target.checked)} />
            <Typography className="cs-muted" sx={{ fontSize: 12 }}>
              Show only tracked essentials
            </Typography>
          </Stack>
        </Stack>

        {errorMsg ? <Alert severity="error">{errorMsg}</Alert> : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : filteredRows.length === 0 ? (
          <Alert severity="info">No items match the current filters.</Alert>
        ) : (
          <Box className="cs-stagger" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.25 }}>
            {filteredRows.map((row) => {
              const isEditing = editDraft?.catalogItemId === row.catalogItemId;
              const isTracked = (row.essentialThreshold ?? 0) > 0;
              const isLow = isTracked && row.quantity <= (row.essentialThreshold ?? 0);
              return (
                <Box key={row.catalogItemId} sx={{ ...innerCardSx, p: 1.4, position: "relative" }}>
                  <Stack spacing={1.2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box>
                        <Typography sx={{ fontWeight: 900 }}>{row.itemName}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.7, flexWrap: "wrap" }}>
                          <CategoryChip category={row.category} />
                          {isLow ? (
                            <MetricBadge label="Status" value={<><NotificationsActiveIcon sx={{ fontSize: 14, mr: 0.4 }} />Low</>} />
                          ) : isTracked ? (
                            <MetricBadge label="Status" value="Tracked" />
                          ) : (
                            <MetricBadge label="Status" value="Not tracked" />
                          )}
                        </Stack>
                      </Box>

                      {isEditing && editDraft ? (
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" disabled={saving} onClick={saveDraft}>
                            <SaveIcon />
                          </IconButton>
                          <IconButton size="small" onClick={() => setEditDraft(null)}>
                            <CloseIcon />
                          </IconButton>
                        </Stack>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() =>
                            setEditDraft({
                              catalogItemId: row.catalogItemId,
                              thresholdQuantity: Number(row.essentialThreshold ?? 0),
                              emailEnabled: row.essentialEmailEnabled,
                            })
                          }
                        >
                          <EditIcon />
                        </IconButton>
                      )}
                    </Stack>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Box sx={{ ...innerCardSx, p: 1.1, flex: 1 }}>
                        <Typography className="cs-muted" sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                          Current quantity
                        </Typography>
                        <Typography sx={{ fontWeight: 900, mt: 0.4 }}>{row.quantity}</Typography>
                      </Box>
                      <Box sx={{ ...innerCardSx, p: 1.1, flex: 1 }}>
                        <Typography className="cs-muted" sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 }}>
                          Reminder threshold
                        </Typography>
                        {isEditing && editDraft ? (
                          <TextField
                            type="number"
                            size="small"
                            value={editDraft.thresholdQuantity}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setEditDraft({ ...editDraft, thresholdQuantity: Number.isNaN(next) ? 0 : Math.max(0, next) });
                            }}
                            sx={{ mt: 0.6, width: 140 }}
                          />
                        ) : (
                          <Typography sx={{ fontWeight: 900, mt: 0.4 }}>{isTracked ? row.essentialThreshold : "Off"}</Typography>
                        )}
                      </Box>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1}>
                      {isEditing && editDraft ? (
                        <Checkbox
                          checked={editDraft.emailEnabled && editDraft.thresholdQuantity > 0}
                          onChange={(e) => setEditDraft({ ...editDraft, emailEnabled: e.target.checked })}
                        />
                      ) : (
                        <Checkbox checked={row.essentialEmailEnabled} disabled />
                      )}
                      <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                        Email me when this item falls below the threshold.
                      </Typography>
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}
      </Stack>
    </GlassPanel>
  );
}
