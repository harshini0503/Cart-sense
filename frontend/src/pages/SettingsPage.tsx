import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import EditRoadRoundedIcon from "@mui/icons-material/EditRoadRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import GroupRemoveRoundedIcon from "@mui/icons-material/GroupRemoveRounded";
import PersonRemoveAlt1RoundedIcon from "@mui/icons-material/PersonRemoveAlt1Rounded";
import { apiFetch } from "../api";
import { GlassPanel, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type Store = { id: number; name: string };
type HouseholdMember = { id: number; name: string; email: string; role: string };
type MappingItem = {
  id: number;
  name: string;
  category: string;
  preferredStoreId: number | null;
  preferredStoreName?: string | null;
  aliasCount: number;
};
type AliasItem = {
  id: number;
  aliasName: string;
  catalogItemId: number;
  itemName: string;
  category: string;
  preferredStoreId: number | null;
  preferredStoreName?: string | null;
};

const CATEGORY_OPTIONS = ["carbs", "protein", "vegetables", "fruits", "dairy", "nuts_dry_fruits", "snacks", "other"];

export function SettingsPage() {
  const { token, user, households, activeHouseholdId, createHousehold, inviteToHousehold } = useAuth();
  const [createName, setCreateName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [items, setItems] = useState<MappingItem[]>([]);
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [search, setSearch] = useState("");
  const [aliasSearch, setAliasSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeMembership = useMemo(
    () => households.find((household) => household.id === activeHouseholdId) || null,
    [activeHouseholdId, households]
  );
  const canManageMembers = activeMembership?.role === "owner";

  async function loadData() {
    if (!token || !activeHouseholdId) return;
    try {
      const [storeRes, mappingRes, membersRes] = await Promise.all([
        apiFetch<{ stores: Store[] }>(`/api/catalog/stores?household_id=${activeHouseholdId}`, { token }),
        apiFetch<{ items: MappingItem[]; aliases: AliasItem[] }>(`/api/mappings/overview?household_id=${activeHouseholdId}`, { token }),
        apiFetch<{ members: HouseholdMember[] }>(`/api/households/${activeHouseholdId}/members`, { token }),
      ]);
      setStores(storeRes.stores || []);
      setItems(mappingRes.items || []);
      setAliases(mappingRes.aliases || []);
      setMembers(membersRes.members || []);
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not load settings");
    }
  }

  useEffect(() => {
    loadData();
  }, [token, activeHouseholdId]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? items.filter((item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)) : items;
    return list.slice(0, 80);
  }, [items, search]);

  const filteredAliases = useMemo(() => {
    const q = aliasSearch.trim().toLowerCase();
    const list = q
      ? aliases.filter((alias) => alias.aliasName.toLowerCase().includes(q) || alias.itemName.toLowerCase().includes(q))
      : aliases;
    return list.slice(0, 80);
  }, [aliases, aliasSearch]);

  async function saveItem(item: MappingItem) {
    if (!token || !activeHouseholdId) return;
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      await apiFetch(`/api/catalog/items/${item.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          household_id: activeHouseholdId,
          name: item.name.trim(),
          category: item.category,
          preferred_store_id: item.preferredStoreId,
        }),
      });
      setMessage(`Saved mapping for ${item.name}.`);
      await loadData();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not update product mapping");
    } finally {
      setBusy(false);
    }
  }

  async function saveAlias(alias: AliasItem) {
    if (!token || !activeHouseholdId) return;
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      await apiFetch(`/api/receipt-aliases/${alias.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          household_id: activeHouseholdId,
          alias_name: alias.aliasName.trim(),
          item_name: alias.itemName.trim(),
          category: alias.category,
          preferred_store_id: alias.preferredStoreId,
        }),
      });
      setMessage(`Saved receipt mapping for ${alias.aliasName}.`);
      await loadData();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not update receipt mapping");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: HouseholdMember) {
    if (!token || !activeHouseholdId) return;
    const confirmed = window.confirm(`Remove ${member.name} from this household? They will lose access to shared lists, receipts, inventory, and insights.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMsg(null);
    setMessage(null);
    try {
      await apiFetch(`/api/households/${activeHouseholdId}/members/${member.id}`, {
        method: "DELETE",
        token,
      });
      setMessage(`Removed ${member.name} from the household.`);
      await loadData();
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not remove that member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <GlassPanel sx={{ p: 2.4 }}>
        <Stack spacing={2}>
          <SectionHeader
            eyebrow="Household configuration"
            title="Settings and manual mappings"
            subtitle="Categories can still be inferred automatically, but preferred stores stay under user control. Update product mappings, receipt aliases, and household access from here."
            action={<SettingsSuggestRoundedIcon />}
          />

          {message ? <Alert severity="success">{message}</Alert> : null}
          {errorMsg ? <Alert severity="error">{errorMsg}</Alert> : null}

          <Stack direction={{ xs: "column", xl: "row" }} spacing={2}>
            <Paper sx={{ ...innerCardSx, p: 1.8, flex: 1 }}>
              <Typography sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <Inventory2RoundedIcon fontSize="small" /> Create another household
              </Typography>
              <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5, mb: 1.2 }}>
                Keep separate dashboards if you want a different space for another home or roommate group.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ xs: "stretch", md: "flex-end" }}>
                <TextField label="Household name" value={createName} onChange={(e) => setCreateName(e.target.value)} fullWidth />
                <Button
                  variant="contained"
                  disabled={!createName.trim() || busy}
                  onClick={async () => {
                    setBusy(true);
                    setErrorMsg(null);
                    try {
                      await createHousehold(createName.trim());
                      setCreateName("");
                      setMessage("Created a new household.");
                    } catch (e: any) {
                      setErrorMsg(e?.message || "Could not create household");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  sx={{ borderRadius: 999, fontWeight: 900, minHeight: 42, px: 2.5 }}
                >
                  Create
                </Button>
              </Stack>
            </Paper>

            <Paper sx={{ ...innerCardSx, p: 1.8, flex: 1.15 }}>
              <Typography sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <LinkRoundedIcon fontSize="small" /> Invite to active household
              </Typography>
              <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5, mb: 1.2 }}>
                Generate a shareable invite link for the currently selected household.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ xs: "stretch", md: "flex-end" }}>
                <TextField label="Email to invite" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} fullWidth />
                <Button
                  variant="contained"
                  disabled={!activeHouseholdId || !inviteEmail.trim() || busy}
                  onClick={async () => {
                    if (!activeHouseholdId) return;
                    setBusy(true);
                    setErrorMsg(null);
                    try {
                      const inv = await inviteToHousehold(activeHouseholdId, inviteEmail.trim());
                      setInviteToken(inv.invite_token);
                      setInvitePath(inv.invitePath);
                      setMessage(`Invite ready for ${inv.inviteEmail}.`);
                    } catch (e: any) {
                      setErrorMsg(e?.message || "Could not generate invite");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  sx={{ borderRadius: 999, fontWeight: 900, minHeight: 42, px: 2.5 }}
                >
                  Generate invite
                </Button>
              </Stack>

              {inviteToken ? (
                <Box sx={{ mt: 1.4 }}>
                  <TextField
                    label="Invite link"
                    value={typeof window !== "undefined" ? `${window.location.origin}${invitePath || ""}` : invitePath || ""}
                    multiline
                    minRows={2}
                    fullWidth
                    InputProps={{ readOnly: true }}
                  />
                  <TextField label="Token" value={inviteToken} fullWidth multiline minRows={2} InputProps={{ readOnly: true }} sx={{ mt: 1 }} />
                </Box>
              ) : null}
            </Paper>
          </Stack>
        </Stack>
      </GlassPanel>

      <GlassPanel sx={{ p: 2.2 }}>
        <SectionHeader
          eyebrow="Household access"
          title="Members and household access"
          subtitle={canManageMembers ? "Remove members who no longer belong to this household." : "Only the household owner can remove members. You can still review everyone who currently has access."}
          action={<GroupRemoveRoundedIcon />}
        />
        <Stack spacing={1.1} sx={{ mt: 1.5 }}>
          {members.map((member) => (
            <Paper key={member.id} sx={{ ...innerCardSx, p: 1.35 }}>
              <Stack direction={{ xs: "column", lg: "row" }} spacing={1.2} justifyContent="space-between" alignItems={{ xs: "stretch", lg: "center" }}>
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>{member.name}</Typography>
                  <Typography className="cs-muted" sx={{ fontSize: 12 }}>{member.email}</Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                  <Typography className="cs-muted" sx={{ fontSize: 12, minWidth: 92 }}>
                    Role: {member.role}
                  </Typography>
                  {canManageMembers && member.role !== "owner" ? (
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<PersonRemoveAlt1RoundedIcon />}
                      disabled={busy || member.id === user?.id}
                      onClick={() => removeMember(member)}
                      sx={{ borderRadius: 999, fontWeight: 900 }}
                    >
                      Remove access
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </GlassPanel>

      <GlassPanel sx={{ p: 2.2 }}>
        <SectionHeader
          eyebrow="Product mappings"
          title="Canonical products and preferred stores"
          subtitle="Review the saved product list, update names or categories, and manually assign the preferred store when you want to change it."
          action={<EditRoadRoundedIcon />}
        />
        <TextField label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mt: 1.5, mb: 1.5, maxWidth: 420 }} />
        <Stack spacing={1.1}>
          {filteredItems.map((item) => (
            <Paper key={item.id} sx={{ ...innerCardSx, p: 1.4 }}>
              <Stack direction={{ xs: "column", xl: "row" }} spacing={1.2} alignItems={{ xs: "stretch", xl: "center" }}>
                <TextField
                  label="Product"
                  value={item.name}
                  onChange={(e) => setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))}
                  sx={{ minWidth: 230, flex: 1.2 }}
                  size="small"
                />
                <TextField
                  label="Category"
                  select
                  size="small"
                  value={item.category}
                  onChange={(e) => setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, category: e.target.value } : x)))}
                  sx={{ minWidth: 190 }}
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category === "nuts_dry_fruits" ? "nuts / dry fruits" : category}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Preferred store"
                  select
                  size="small"
                  value={item.preferredStoreId ?? ""}
                  onChange={(e) => setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, preferredStoreId: e.target.value ? Number(e.target.value) : null } : x)))}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">No preferred store</MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography className="cs-muted" sx={{ fontSize: 12, minWidth: 120 }}>
                  {item.aliasCount} receipt alias{item.aliasCount === 1 ? "" : "es"}
                </Typography>
                <Button variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }} disabled={busy || !item.name.trim()} onClick={() => saveItem(item)}>
                  Save
                </Button>
              </Stack>
            </Paper>
          ))}
          {filteredItems.length === 0 ? <Typography className="cs-muted">No products match that search.</Typography> : null}
        </Stack>
      </GlassPanel>

      <GlassPanel sx={{ p: 2.2 }}>
        <SectionHeader
          eyebrow="Receipt alias mappings"
          title="How receipt text maps to your products"
          subtitle="Use this list to keep raw receipt text like branded names mapped to the canonical item and preferred store you actually want saved."
        />
        <TextField label="Search receipt aliases" value={aliasSearch} onChange={(e) => setAliasSearch(e.target.value)} sx={{ mt: 1.5, mb: 1.5, maxWidth: 420 }} />
        <Stack spacing={1.1}>
          {filteredAliases.map((alias) => (
            <Paper key={alias.id} sx={{ ...innerCardSx, p: 1.4 }}>
              <Stack direction={{ xs: "column", xl: "row" }} spacing={1.2} alignItems={{ xs: "stretch", xl: "center" }}>
                <TextField
                  label="Receipt text"
                  value={alias.aliasName}
                  onChange={(e) => setAliases((cur) => cur.map((x) => (x.id === alias.id ? { ...x, aliasName: e.target.value } : x)))}
                  size="small"
                  sx={{ minWidth: 220, flex: 1.1 }}
                />
                <TextField
                  label="Canonical item"
                  value={alias.itemName}
                  onChange={(e) => setAliases((cur) => cur.map((x) => (x.id === alias.id ? { ...x, itemName: e.target.value } : x)))}
                  size="small"
                  sx={{ minWidth: 220, flex: 1.2 }}
                />
                <TextField
                  label="Category"
                  select
                  size="small"
                  value={alias.category}
                  onChange={(e) => setAliases((cur) => cur.map((x) => (x.id === alias.id ? { ...x, category: e.target.value } : x)))}
                  sx={{ minWidth: 190 }}
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category === "nuts_dry_fruits" ? "nuts / dry fruits" : category}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Preferred store"
                  select
                  size="small"
                  value={alias.preferredStoreId ?? ""}
                  onChange={(e) => setAliases((cur) => cur.map((x) => (x.id === alias.id ? { ...x, preferredStoreId: e.target.value ? Number(e.target.value) : null } : x)))}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">No preferred store</MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }} disabled={busy || !alias.aliasName.trim() || !alias.itemName.trim()} onClick={() => saveAlias(alias)}>
                  Save
                </Button>
              </Stack>
            </Paper>
          ))}
          {filteredAliases.length === 0 ? <Typography className="cs-muted">No receipt aliases match that search.</Typography> : null}
        </Stack>
      </GlassPanel>
    </Stack>
  );
}
