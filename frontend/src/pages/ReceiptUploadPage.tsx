import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { apiFetch, API_BASE_URL } from "../api";
import { CategoryChip } from "../components/CategoryChip";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";

type Store = { id: number; name: string };
type HouseholdMember = { id: number; name: string; email: string; role: string };

type ParsedItem = {
  catalogItemId: number | null;
  rawName: string;
  itemName: string;
  category: string;
  quantityGuess: number;
  quantity: number;
  needsMapping: boolean;
  matchedBy: string;
};

const CATEGORY_OPTIONS = ["carbs", "protein", "vegetables", "fruits", "dairy", "snacks", "other"];

export function ReceiptUploadPage({ householdId }: { householdId: number }) {
  const { token, user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parseMethod, setParseMethod] = useState<string | null>(null);
  const [receiptStoreId, setReceiptStoreId] = useState<number>(0);
  const [purchaserUserId, setPurchaserUserId] = useState<number>(user?.id || 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      try {
        const [storeRes, membersRes] = await Promise.all([
          apiFetch<{ stores: Store[] }>(`/api/catalog/stores?household_id=${householdId}`, { token }),
          apiFetch<{ members: HouseholdMember[] }>(`/api/households/${householdId}/members`, { token }),
        ]);
        if (cancelled) return;
        setStores(storeRes.stores || []);
        setMembers(membersRes.members || []);
        setReceiptStoreId((current) => current || storeRes.stores?.[0]?.id || 0);
        setPurchaserUserId((current) => current || user?.id || membersRes.members?.[0]?.id || 0);
      } catch {
        // ignore initial picker load failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, token, user?.id]);

  const canUpload = !!token && !!file && !!householdId;
  const isConfirmStep = receiptId != null;
  const unresolvedCount = useMemo(() => parsedItems.filter((p) => p.catalogItemId == null || p.needsMapping).length, [parsedItems]);

  async function uploadReceipt() {
    if (!token || !file) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("household_id", String(householdId));
      fd.append("file", file);

      const res = await fetch(`${API_BASE_URL}/api/receipts/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Receipt upload failed");

      setReceiptId(payload.receiptId);
      setParseMethod(payload.parseMethod || null);
      setReceiptStoreId(Number(payload.receiptStoreId || 0));
      setParsedItems(
        (payload.parsedItems || []).map((p: any) => ({
          catalogItemId: p.catalogItemId ?? null,
          rawName: p.rawName || p.itemName || "",
          itemName: p.itemName || "",
          category: p.category || "other",
          quantityGuess: Number(p.quantityGuess ?? 1),
          quantity: Number(p.quantityGuess ?? 1),
          needsMapping: Boolean(p.needsMapping),
          matchedBy: p.matchedBy || "unmapped",
        }))
      );
    } catch (e: any) {
      setErrorMsg(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function addManualItem() {
    setParsedItems((cur) => [
      ...cur,
      {
        catalogItemId: null,
        rawName: "",
        itemName: "",
        category: "other",
        quantityGuess: 1,
        quantity: 1,
        needsMapping: true,
        matchedBy: "manual",
      },
    ]);
  }

  async function confirmReceipt() {
    if (!token || !receiptId) return;
    const cleanItems = parsedItems
      .filter((p) => p.quantity > 0 && p.itemName.trim())
      .map((p) => ({
        catalog_item_id: p.catalogItemId ?? null,
        raw_name: p.rawName?.trim() || p.itemName.trim(),
        item_name: p.itemName.trim(),
        category: p.category,
        quantity: p.quantity,
      }));

    if (cleanItems.length === 0) {
      setErrorMsg("Add at least one purchased item before confirming.");
      return;
    }
    if (!receiptStoreId) {
      setErrorMsg("Choose the receipt store before confirming.");
      return;
    }

    setErrorMsg(null);
    setBusy(true);
    try {
      await apiFetch(`/api/receipts/${receiptId}/confirm`, {
        method: "POST",
        token,
        body: JSON.stringify({ items: cleanItems, store_id: receiptStoreId, purchaser_user_id: purchaserUserId }),
      });

      setReceiptId(null);
      setParsedItems([]);
      setFile(null);
      setParseMethod(null);
    } catch (e: any) {
      setErrorMsg(e?.message || "Confirmation failed");
    } finally {
      setBusy(false);
    }
  }

  const helperMessage = useMemo(() => {
    if (parseMethod === "image_ocr") return "Parsed using OCR. Review the canonical item names before confirming.";
    if (parseMethod === "filename_fallback") return "The file content was not readable, so switch to manual confirmation below.";
    return "Review each parsed line before inventory is updated.";
  }, [parseMethod]);

  const receiptStoreName = stores.find((s) => s.id === receiptStoreId)?.name || "";

  return (
    <GlassPanel sx={{ p: 2.4 }}>
      <Stack spacing={2.2}>
        <SectionHeader
          eyebrow="Receipt flow"
          title="Upload a receipt and confirm the basket"
          subtitle="CartSense parses the receipt, asks you to review the mapping, then updates inventory only after the household confirms it."
          action={
            isConfirmStep ? (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <MetricBadge label="Parsed items" value={parsedItems.length} />
                <MetricBadge label="Need mapping" value={unresolvedCount} />
              </Stack>
            ) : null
          }
        />

        {!isConfirmStep ? (
          <Box sx={{ ...innerCardSx, p: 1.75 }} className="cs-sheen">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "flex-end" }}>
              <Box sx={{ flex: 1, minWidth: 320 }}>
                <InputLabel sx={{ mb: 0.5 }}>Receipt file</InputLabel>
                <Button variant="outlined" component="label" sx={{ borderRadius: 999 }} disabled={busy}>
                  Choose JPG, PNG, or PDF
                  <input type="file" hidden accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </Button>
                <FormHelperText>
                  JPG, PNG, or PDF. If parsing misses an item, you can add it manually in the confirmation step.
                </FormHelperText>
                {file ? <Typography sx={{ mt: 1 }} className="cs-muted">{file.name}</Typography> : null}
              </Box>

              <Button variant="contained" disabled={!canUpload || busy} onClick={uploadReceipt} sx={{ borderRadius: 999, fontWeight: 900, minHeight: 42 }}>
                {busy ? <CircularProgress size={18} /> : "Upload and parse"}
              </Button>
            </Stack>
          </Box>
        ) : (
          <>
            {parseMethod ? <Alert severity="info">Parsed using: <strong>{parseMethod}</strong>. {helperMessage}</Alert> : null}
            {unresolvedCount > 0 ? (
              <Alert severity="warning">
                {unresolvedCount} item{unresolvedCount === 1 ? "" : "s"} need mapping. Update the canonical item name and category CartSense should remember for future receipts.
              </Alert>
            ) : null}
            {errorMsg ? <Alert severity="error">{errorMsg}</Alert> : null}

            <Box sx={{ ...innerCardSx, p: 1.65 }}>
              <Stack direction={{ xs: "column", xl: "row" }} spacing={2} justifyContent="space-between" alignItems={{ xs: "stretch", xl: "center" }}>
                <Box>
                  <Typography sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                    <ReceiptLongIcon fontSize="small" /> Confirm what was purchased
                  </Typography>
                  <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.45 }}>
                    Receipt #{receiptId}. Inventory updates only after you confirm.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={addManualItem} sx={{ borderRadius: 999, fontWeight: 900 }}>
                    Add item
                  </Button>
                  <Button
                    variant="text"
                    startIcon={<RestartAltIcon />}
                    onClick={() => {
                      setReceiptId(null);
                      setParsedItems([]);
                      setParseMethod(null);
                      setErrorMsg(null);
                    }}
                    sx={{ borderRadius: 999, fontWeight: 900 }}
                  >
                    Start over
                  </Button>
                  <Button variant="contained" disabled={busy} onClick={confirmReceipt} sx={{ borderRadius: 999, fontWeight: 900 }}>
                    {busy ? <CircularProgress size={18} /> : "Confirm receipt"}
                  </Button>
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ ...innerCardSx, p: 1.6 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "center" }}>
                <TextField label="Receipt store" select size="small" value={receiptStoreId || ""} onChange={(e) => setReceiptStoreId(Number(e.target.value))} sx={{ minWidth: 220 }}>
                  {stores.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </TextField>
                <TextField label="Purchased by" select size="small" value={purchaserUserId || ""} onChange={(e) => setPurchaserUserId(Number(e.target.value))} sx={{ minWidth: 220 }}>
                  {members.map((member) => <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>)}
                </TextField>
                <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                  One store is applied to the full receipt{receiptStoreName ? `: ${receiptStoreName}` : ""}.
                </Typography>
              </Stack>
            </Box>

            {parsedItems.length === 0 ? (
              <Alert severity="info">No items were parsed automatically. Add the purchased items manually, then confirm the receipt.</Alert>
            ) : (
              <Box className="cs-stagger" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.2 }}>
                {parsedItems.map((p, idx) => (
                  <Box key={`${p.rawName || p.itemName}-${idx}`} sx={{ ...innerCardSx, p: 1.3 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <CategoryChip category={p.category} />
                        <IconButton size="small" color="error" onClick={() => setParsedItems((cur) => cur.filter((_, i) => i !== idx))}>
                          <DeleteIcon />
                        </IconButton>
                      </Stack>

                      {p.rawName && p.rawName !== p.itemName ? (
                        <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                          Receipt text: <strong>{p.rawName}</strong>
                        </Typography>
                      ) : null}

                      {p.catalogItemId == null || p.needsMapping ? (
                        <Alert severity="warning" sx={{ py: 0 }}>
                          Unmapped item. Choose the name and category CartSense should remember.
                        </Alert>
                      ) : (
                        <Typography className="cs-muted" sx={{ fontSize: 12 }}>
                          Matched automatically using {p.matchedBy} mapping.
                        </Typography>
                      )}

                      <TextField
                        label="Use item name"
                        size="small"
                        value={p.itemName}
                        onChange={(e) => {
                          const next = e.target.value;
                          setParsedItems((cur) => cur.map((x, i) => (i === idx ? { ...x, itemName: next, catalogItemId: null, needsMapping: true } : x)));
                        }}
                        fullWidth
                      />

                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          type="number"
                          label="Qty"
                          size="small"
                          value={p.quantity}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value || 0));
                            setParsedItems((cur) => cur.map((x, i) => (i === idx ? { ...x, quantity: val } : x)));
                          }}
                          sx={{ width: 110 }}
                        />

                        <TextField
                          label="Category"
                          select
                          size="small"
                          value={p.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedItems((cur) => cur.map((x, i) => (i === idx ? { ...x, category: val, catalogItemId: null, needsMapping: true } : x)));
                          }}
                          sx={{ flex: 1 }}
                        >
                          {CATEGORY_OPTIONS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                        </TextField>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}

        {!isConfirmStep && errorMsg ? <Alert severity="error">{errorMsg}</Alert> : null}
      </Stack>
    </GlassPanel>
  );
}
