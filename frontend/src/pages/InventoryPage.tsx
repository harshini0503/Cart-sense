import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CategoryIcon from "@mui/icons-material/Category";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import { apiFetch } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { useAuth } from "../hooks/useAuth";

type Store = { id: number; name: string };
type InventoryRow = {
  catalogItemId: number;
  itemName: string;
  category: string;
  quantity: number;
  preferredStoreId: number | null;
  preferredStoreName: string | null;
  lastPurchaseStoreName: string | null;
  essentialThreshold: number | null;
  essentialEmailEnabled: boolean;
};

type EditDraft = {
  catalogItemId: number;
  quantity: number;
  preferredStoreId: number | null;
};

type GroupMode = "category" | "store";

const glassPanelSx = {
  borderRadius: 5,
  background: "rgba(8,18,33,0.74)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
};

export function InventoryPage({ householdId }: { householdId: number }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("category");
  const [filterStore, setFilterStore] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const [inventoryRes, storesRes] = await Promise.all([
        apiFetch<{ inventory: InventoryRow[] }>(`/api/inventory?household_id=${householdId}`, { token }),
        apiFetch<{ stores: Store[] }>(`/api/catalog/stores?household_id=${householdId}`, { token }),
      ]);
      setRows(inventoryRes.inventory || []);
      setStores(storesRes.stores || []);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [householdId, token]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = !search.trim() || row.itemName.toLowerCase().includes(search.trim().toLowerCase());
      const matchesStore =
        filterStore === "all" ||
        row.preferredStoreName === filterStore ||
        row.lastPurchaseStoreName === filterStore;
      const matchesCategory = filterCategory === "all" || row.category === filterCategory;
      return matchesSearch && matchesStore && matchesCategory;
    });
  }, [filterCategory, filterStore, rows, search]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, InventoryRow[]>();
    for (const row of filteredRows) {
      const key = groupMode === "store" ? row.preferredStoreName || row.lastPurchaseStoreName || "No preferred store" : row.category || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, list]) => ({
        label,
        items: list.slice().sort((a, b) => a.itemName.localeCompare(b.itemName)),
      }));
  }, [filteredRows, groupMode]);

  const categoryOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.category))).sort(), [rows]);
  const storeOptions = useMemo(() => {
    const names = new Set<string>();
    stores.forEach((store) => names.add(store.name));
    rows.forEach((row) => {
      if (row.preferredStoreName) names.add(row.preferredStoreName);
      if (row.lastPurchaseStoreName) names.add(row.lastPurchaseStoreName);
    });
    return Array.from(names).sort();
  }, [rows, stores]);

  async function saveRow() {
    if (!token || !editDraft) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/inventory/${editDraft.catalogItemId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          household_id: householdId,
          quantity: editDraft.quantity,
          preferred_store_id: editDraft.preferredStoreId,
        }),
      });
      setEditDraft(null);
      await refresh();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not update inventory");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper sx={{ ...glassPanelSx, p: 2.25, overflow: "hidden", position: "relative" }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
              <Inventory2Icon fontSize="small" /> Current inventory
            </Typography>
            <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
              Adjust quantities manually and keep preferred stores stable. Group the pantry by category or by store.
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            color="primary"
            value={groupMode}
            exclusive
            onChange={(_, value) => value && setGroupMode(value)}
            sx={{
              alignSelf: { xs: "stretch", lg: "flex-start" },
              "& .MuiToggleButton-root": {
                borderRadius: 999,
                px: 2,
                textTransform: "none",
                fontWeight: 800,
                border: "1px solid rgba(255,255,255,0.1)",
              },
            }}
          >
            <ToggleButton value="category">
              <CategoryIcon sx={{ mr: 0.8 }} fontSize="small" /> View by category
            </ToggleButton>
            <ToggleButton value="store">
              <StorefrontIcon sx={{ mr: 0.8 }} fontSize="small" /> View by store
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2}>
          <TextField
            label="Search inventory"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            select
            label="Filter category"
            size="small"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="all">All categories</MenuItem>
            {categoryOptions.map((category) => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Filter store"
            size="small"
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="all">All stores</MenuItem>
            {storeOptions.map((storeName) => (
              <MenuItem key={storeName} value={storeName}>
                {storeName}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {errorMsg ? <Typography color="error">{errorMsg}</Typography> : null}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredRows.length === 0 ? (
          <Typography className="cs-muted">No inventory yet. Checkout a shopping list or confirm a receipt.</Typography>
        ) : (
          <Stack spacing={2}>
            {groupedRows.map((group) => (
              <Paper
                key={group.label}
                sx={{
                  p: 1.5,
                  borderRadius: 4,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.2 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {groupMode === "category" ? <CategoryChip category={group.label} /> : <StorefrontIcon fontSize="small" />}
                    <Typography sx={{ fontWeight: 900 }}>{group.label}</Typography>
                  </Stack>
                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                    {group.items.length} item(s)
                  </Typography>
                </Stack>

                <Stack spacing={1}>
                  {group.items.map((row) => {
                    const isEditing = editDraft?.catalogItemId === row.catalogItemId;
                    return (
                      <Paper
                        key={row.catalogItemId}
                        variant="outlined"
                        sx={{
                          p: 1.4,
                          borderRadius: 3,
                          borderColor: "rgba(255,255,255,0.08)",
                          background: "rgba(8,18,33,0.6)",
                        }}
                      >
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }}>
                          <Box sx={{ minWidth: 220 }}>
                            <Typography sx={{ fontWeight: 900 }}>{row.itemName}</Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                              <CategoryChip category={row.category} />
                              <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                                Preferred: {row.preferredStoreName || "Not set"}
                              </Typography>
                              <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                                Last purchase: {row.lastPurchaseStoreName || "-"}
                              </Typography>
                            </Stack>
                          </Box>

                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} sx={{ width: { xs: "100%", md: "auto" } }}>
                            {isEditing && editDraft ? (
                              <>
                                <TextField
                                  type="number"
                                  label="Quantity"
                                  size="small"
                                  value={editDraft.quantity}
                                  onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (Number.isNaN(next)) return;
                                    setEditDraft({ ...editDraft, quantity: Math.max(0, next) });
                                  }}
                                  sx={{ width: 120 }}
                                />
                                <TextField
                                  select
                                  label="Preferred store"
                                  size="small"
                                  value={editDraft.preferredStoreId ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, preferredStoreId: Number(e.target.value) || null })}
                                  sx={{ minWidth: 200 }}
                                >
                                  {stores.map((store) => (
                                    <MenuItem key={store.id} value={store.id}>
                                      {store.name}
                                    </MenuItem>
                                  ))}
                                </TextField>
                                <Stack direction="row" spacing={0.5}>
                                  <IconButton size="small" disabled={saving} onClick={saveRow}>
                                    <SaveIcon />
                                  </IconButton>
                                  <IconButton size="small" onClick={() => setEditDraft(null)}>
                                    <CloseIcon />
                                  </IconButton>
                                </Stack>
                              </>
                            ) : (
                              <>
                                <Box
                                  sx={{
                                    px: 1.5,
                                    py: 0.9,
                                    borderRadius: 999,
                                    background: "rgba(76,174,255,0.12)",
                                    border: "1px solid rgba(76,174,255,0.16)",
                                  }}
                                >
                                  <Typography sx={{ fontWeight: 900 }}>Qty {row.quantity}</Typography>
                                </Box>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setEditDraft({
                                      catalogItemId: row.catalogItemId,
                                      quantity: Number(row.quantity),
                                      preferredStoreId: row.preferredStoreId,
                                    })
                                  }
                                >
                                  <EditIcon />
                                </IconButton>
                              </>
                            )}
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
