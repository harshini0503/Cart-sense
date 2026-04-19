import React, { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import StorefrontIcon from "@mui/icons-material/Storefront";
import PlaylistAddCheckCircleIcon from "@mui/icons-material/PlaylistAddCheckCircle";
import { apiFetch } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { useAuth } from "../hooks/useAuth";

type Store = { id: number; name: string };
type ShoppingItem = {
  id: number;
  catalogItemId: number;
  itemName: string;
  category: string;
  storeId: number;
  storeName: string;
  quantity: number;
  quantityUnit: "count" | "weight" | "volume";
  unitLabel: string;
  status: string;
};

type CatalogItemOption = {
  id: number;
  name: string;
  category: string;
  preferredStoreId: number | null;
  preferredStoreName?: string | null;
};

type EditDraft = {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
  quantityUnit: "count" | "weight" | "volume";
  unitLabel: string;
  storeId: number;
};

type HouseholdMember = { id: number; name: string; email: string; role: string };

const CATEGORY_OPTIONS = ["carbs", "protein", "vegetables", "fruits", "dairy", "snacks", "other"];
const glassPanelSx = {
  borderRadius: 5,
  background: "rgba(8,18,33,0.74)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
  boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
};

function unitOptions(quantityUnit: "count" | "weight" | "volume") {
  if (quantityUnit === "count") return ["each", "bunch", "pack"];
  if (quantityUnit === "weight") return ["lb", "kg", "oz"];
  return ["ml", "L", "gal"];
}

function defaultUnitLabel(quantityUnit: "count" | "weight" | "volume") {
  return quantityUnit === "count" ? "each" : quantityUnit === "weight" ? "lb" : "ml";
}

export function ShoppingListPage({ householdId }: { householdId: number }) {
  const { token, user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [quantity, setQuantity] = useState<number>(1);
  const [quantityUnit, setQuantityUnit] = useState<"count" | "weight" | "volume">("count");
  const [unitLabel, setUnitLabel] = useState<string>("each");
  const [category, setCategory] = useState<string>("other");
  const [itemName, setItemName] = useState<string>("");

  const [searchText, setSearchText] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<CatalogItemOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [purchaserUserId, setPurchaserUserId] = useState<number>(user?.id || 0);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const it of items) {
      const key = it.storeName || `Store ${it.storeId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .map(([storeName, list]) => ({ storeName, list: list.slice().sort((a, b) => a.itemName.localeCompare(b.itemName)) }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName));
  }, [items]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const [storesRes, listRes, membersRes] = await Promise.all([
        apiFetch<{ stores: Store[] }>(`/api/catalog/stores?household_id=${householdId}`, { token }),
        apiFetch<{ items: ShoppingItem[] }>(`/api/shopping-list/active?household_id=${householdId}`, { token }),
        apiFetch<{ members: HouseholdMember[] }>(`/api/households/${householdId}/members`, { token }),
      ]);
      setStores(storesRes.stores || []);
      setItems(listRes.items || []);
      setMembers(membersRes.members || []);
      setStoreId((prev) => prev ?? (storesRes.stores?.[0]?.id ?? null));
      setPurchaserUserId((prev) => prev || user?.id || membersRes.members?.[0]?.id || 0);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load shopping list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [householdId, token, user?.id]);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(async () => {
      const q = searchText.trim();
      if (!q || q.length < 2) {
        setCatalogOptions([]);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await apiFetch<{ items: CatalogItemOption[] }>(
          `/api/catalog/items?household_id=${householdId}&query=${encodeURIComponent(q)}`,
          { token }
        );
        setCatalogOptions(res.items || []);
      } catch {
        setCatalogOptions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchText, householdId, token]);

  useEffect(() => {
    setUnitLabel(defaultUnitLabel(quantityUnit));
  }, [quantityUnit]);

  const selectedOption = useMemo(() => {
    if (!catalogOptions.length) return null;
    return catalogOptions.find((o) => o.name.toLowerCase() === itemName.trim().toLowerCase()) || null;
  }, [catalogOptions, itemName]);

  useEffect(() => {
    if (!selectedOption) return;
    setCategory(selectedOption.category || "other");
  }, [selectedOption]);

  function startEdit(it: ShoppingItem) {
    setErrorMsg(null);
    setEditDraft({
      id: it.id,
      itemName: it.itemName,
      category: it.category,
      quantity: Number(it.quantity),
      quantityUnit: it.quantityUnit,
      unitLabel: it.unitLabel || defaultUnitLabel(it.quantityUnit),
      storeId: it.storeId,
    });
  }

  async function saveEdit() {
    if (!token || !editDraft) return;
    setSaveBusy(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/shopping-list/items/${editDraft.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          item_name: editDraft.itemName.trim(),
          category: editDraft.category,
          quantity: editDraft.quantity,
          quantity_unit: editDraft.quantityUnit,
          unit_label: editDraft.unitLabel,
          store_id: editDraft.storeId,
        }),
      });
      setEditDraft(null);
      await refresh();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not update list item");
    } finally {
      setSaveBusy(false);
    }
  }

  async function addItem() {
    if (!token || !storeId || !itemName.trim()) return;
    setErrorMsg(null);
    try {
      await apiFetch(`/api/shopping-list/items`, {
        method: "POST",
        token,
        body: JSON.stringify({
          household_id: householdId,
          quantity,
          quantity_unit: quantityUnit,
          unit_label: unitLabel,
          store_id: storeId,
          catalog_item_id: selectedOption?.id ?? null,
          item_name: selectedOption?.id ? undefined : itemName.trim(),
          category,
        }),
      });
      setItemName("");
      setQuantity(1);
      setQuantityUnit("count");
      setUnitLabel("each");
      setCategory("other");
      setSearchText("");
      setCatalogOptions([]);
      await refresh();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not add item");
    }
  }

  async function checkoutList() {
    if (!token) return;
    setCheckoutLoading(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/shopping-list/checkout`, {
        method: "POST",
        token,
        body: JSON.stringify({ household_id: householdId, purchaser_user_id: purchaserUserId }),
      });
      setEditDraft(null);
      await refresh();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not checkout list");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ ...glassPanelSx, p: 2.25, overflow: "hidden", position: "relative" }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <PlaylistAddCheckCircleIcon fontSize="small" /> Shopping list
              </Typography>
              <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5, maxWidth: 760 }}>
                Add groceries fast, keep the list grouped by store, and choose who completed the trip when you checkout.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Paper sx={{ px: 1.5, py: 1, borderRadius: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Typography className="cs-muted" sx={{ fontSize: 11 }}>Pending items</Typography>
                <Typography sx={{ fontWeight: 1000, fontSize: 24 }}>{items.length}</Typography>
              </Paper>
              <Paper sx={{ px: 1.5, py: 1, borderRadius: 3, background: "rgba(76,174,255,0.1)", border: "1px solid rgba(76,174,255,0.16)" }}>
                <Typography className="cs-muted" sx={{ fontSize: 11 }}>Store groups</Typography>
                <Typography sx={{ fontWeight: 1000, fontSize: 24 }}>{grouped.length}</Typography>
              </Paper>
            </Stack>
          </Stack>

          <Stack direction={{ xs: "column", xl: "row" }} spacing={2}>
            <Paper sx={{ p: 1.6, flex: 1.25, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 900 }}>
                Quick add
              </Typography>
              <Stack spacing={1.2}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                  <TextField
                    type="number"
                    label="Quantity"
                    value={quantity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      setQuantity(quantityUnit === "count" ? Math.max(1, Math.round(v)) : Math.max(0.01, v));
                    }}
                    size="small"
                    sx={{ width: 140 }}
                    inputProps={{ step: quantityUnit === "count" ? 1 : 0.01, min: quantityUnit === "count" ? 1 : 0.01 }}
                  />
                  <TextField
                    select
                    label="Measure"
                    value={quantityUnit}
                    onChange={(e) => setQuantityUnit(e.target.value as "count" | "weight" | "volume")}
                    size="small"
                    sx={{ width: 160 }}
                  >
                    <MenuItem value="count">Count</MenuItem>
                    <MenuItem value="weight">Weight</MenuItem>
                    <MenuItem value="volume">Volume</MenuItem>
                  </TextField>
                  <TextField select label="Unit" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} size="small" sx={{ width: 120 }}>
                    {unitOptions(quantityUnit).map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} size="small" sx={{ minWidth: 180 }}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ xs: "stretch", md: "center" }}>
                  <TextField
                    select
                    label="Store"
                    value={storeId ?? ""}
                    onChange={(e) => setStoreId(Number(e.target.value))}
                    size="small"
                    sx={{ minWidth: 220 }}
                  >
                    {stores.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <Autocomplete
                    freeSolo
                    options={catalogOptions}
                    loading={searchLoading}
                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                    inputValue={itemName}
                    onInputChange={(_, v) => {
                      setItemName(v);
                      setSearchText(v);
                    }}
                    sx={{ flex: 1, minWidth: 260 }}
                    renderInput={(params) => <TextField {...params} label="Item name" size="small" />}
                  />

                  <Button
                    variant="contained"
                    color="primary"
                    sx={{ borderRadius: 999, fontWeight: 900, px: 2.25, minHeight: 40 }}
                    startIcon={<ShoppingCartIcon />}
                    disabled={!token || !storeId || !itemName.trim()}
                    onClick={addItem}
                  >
                    Add item
                  </Button>
                </Stack>
              </Stack>
            </Paper>

            <Paper sx={{ p: 1.6, minWidth: { xs: "100%", xl: 340 }, borderRadius: 4, background: "linear-gradient(135deg, rgba(76,174,255,0.12), rgba(124,255,178,0.08))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 900 }}>
                Checkout
              </Typography>
              <TextField
                select
                size="small"
                label="Purchased by"
                value={purchaserUserId || ""}
                onChange={(e) => setPurchaserUserId(Number(e.target.value))}
                sx={{ width: "100%", mb: 1 }}
              >
                {members.map((member) => (
                  <MenuItem key={member.id} value={member.id}>
                    {member.name}
                  </MenuItem>
                ))}
              </TextField>
              <Typography className="cs-muted" sx={{ fontSize: 12, mb: 1.2 }}>
                The selected household member will appear in purchase history for this checkout.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                disabled={loading || checkoutLoading || items.length === 0 || !purchaserUserId}
                onClick={checkoutList}
                sx={{ borderRadius: 999, fontWeight: 900, minHeight: 42 }}
              >
                {checkoutLoading ? <CircularProgress size={18} /> : `Checkout ${items.length ? `(${items.length} items)` : ""}`}
              </Button>
            </Paper>
          </Stack>

          {errorMsg ? <Typography color="error">{errorMsg}</Typography> : null}
        </Stack>
      </Paper>

      <Paper sx={{ ...glassPanelSx, p: 2.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 1000 }}>
            Store grouped list
          </Typography>
          <Typography className="cs-muted" sx={{ fontSize: 12 }}>
            Keep each trip focused on one store at a time.
          </Typography>
        </Stack>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography className="cs-muted">Your list is empty. Add a few essentials above.</Typography>
        ) : (
          <Stack spacing={2}>
            {grouped.map((group) => (
              <Paper
                key={group.storeName}
                sx={{
                  p: 1.6,
                  borderRadius: 4,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StorefrontIcon fontSize="small" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                      {group.storeName}
                    </Typography>
                  </Stack>
                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                    {group.list.length} item(s)
                  </Typography>
                </Stack>

                <Stack spacing={1.1}>
                  {group.list.map((it) => {
                    const isEditing = editDraft?.id === it.id;
                    return (
                      <Paper
                        key={it.id}
                        variant="outlined"
                        sx={{
                          p: 1.3,
                          borderRadius: 3,
                          borderColor: "rgba(255,255,255,0.08)",
                          background: "rgba(8,18,33,0.62)",
                        }}
                      >
                        {isEditing && editDraft ? (
                          <Stack spacing={1.2}>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                              <TextField
                                label="Item"
                                size="small"
                                value={editDraft.itemName}
                                onChange={(e) => setEditDraft({ ...editDraft, itemName: e.target.value })}
                                sx={{ flex: 1 }}
                              />
                              <TextField
                                type="number"
                                label="Qty"
                                size="small"
                                value={editDraft.quantity}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  if (Number.isNaN(next)) return;
                                  setEditDraft({
                                    ...editDraft,
                                    quantity: editDraft.quantityUnit === "count" ? Math.max(1, Math.round(next)) : Math.max(0.01, next),
                                  });
                                }}
                                sx={{ width: 110 }}
                              />
                              <TextField
                                select
                                label="Measure"
                                size="small"
                                value={editDraft.quantityUnit}
                                onChange={(e) => {
                                  const nextUnit = e.target.value as "count" | "weight" | "volume";
                                  setEditDraft({ ...editDraft, quantityUnit: nextUnit, unitLabel: defaultUnitLabel(nextUnit) });
                                }}
                                sx={{ width: 140 }}
                              >
                                <MenuItem value="count">Count</MenuItem>
                                <MenuItem value="weight">Weight</MenuItem>
                                <MenuItem value="volume">Volume</MenuItem>
                              </TextField>
                              <TextField
                                select
                                label="Unit"
                                size="small"
                                value={editDraft.unitLabel}
                                onChange={(e) => setEditDraft({ ...editDraft, unitLabel: e.target.value })}
                                sx={{ width: 120 }}
                              >
                                {unitOptions(editDraft.quantityUnit).map((option) => (
                                  <MenuItem key={option} value={option}>
                                    {option}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Stack>

                            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                              <TextField
                                select
                                label="Category"
                                size="small"
                                value={editDraft.category}
                                onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                                sx={{ minWidth: 180 }}
                              >
                                {CATEGORY_OPTIONS.map((c) => (
                                  <MenuItem key={c} value={c}>
                                    {c}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField
                                select
                                label="Store"
                                size="small"
                                value={editDraft.storeId}
                                onChange={(e) => setEditDraft({ ...editDraft, storeId: Number(e.target.value) })}
                                sx={{ minWidth: 220 }}
                              >
                                {stores.map((store) => (
                                  <MenuItem key={store.id} value={store.id}>
                                    {store.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <Box sx={{ flex: 1 }} />
                              <Stack direction="row" spacing={0.5}>
                                <IconButton size="small" disabled={saveBusy || !editDraft.itemName.trim()} onClick={saveEdit}>
                                  <SaveIcon />
                                </IconButton>
                                <IconButton size="small" onClick={() => setEditDraft(null)}>
                                  <CloseIcon />
                                </IconButton>
                              </Stack>
                            </Stack>
                          </Stack>
                        ) : (
                          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.2} alignItems={{ xs: "flex-start", md: "center" }}>
                            <Stack direction="row" spacing={1.2} alignItems="center">
                              <Box
                                sx={{
                                  minWidth: 82,
                                  px: 1.3,
                                  py: 0.9,
                                  borderRadius: 999,
                                  textAlign: "center",
                                  background: "rgba(124,255,178,0.12)",
                                  border: "1px solid rgba(124,255,178,0.16)",
                                }}
                              >
                                <Typography sx={{ fontWeight: 900 }}>{Number(it.quantity)} {it.unitLabel || defaultUnitLabel(it.quantityUnit)}</Typography>
                              </Box>
                              <Box>
                                <Typography sx={{ fontWeight: 900 }}>{it.itemName}</Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                                  <CategoryChip category={it.category} />
                                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                                    {it.category}
                                  </Typography>
                                </Stack>
                              </Box>
                            </Stack>

                            <Stack direction="row" spacing={0.5}>
                              <IconButton size="small" onClick={() => startEdit(it)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={async () => {
                                  if (!token) return;
                                  setErrorMsg(null);
                                  try {
                                    await apiFetch(`/api/shopping-list/items/${it.id}`, {
                                      method: "DELETE",
                                      token,
                                    });
                                    if (editDraft?.id === it.id) setEditDraft(null);
                                    await refresh();
                                  } catch (e: any) {
                                    setErrorMsg(e?.message || "Could not delete item");
                                  }
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                          </Stack>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
