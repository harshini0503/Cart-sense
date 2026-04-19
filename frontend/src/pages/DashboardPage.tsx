import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import LocalMallRoundedIcon from "@mui/icons-material/LocalMallRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import { TopBar } from "../components/TopBar";
import "../styles/cartsense.css";
import { useAuth } from "../hooks/useAuth";
import { EssentialItemsPage } from "./EssentialItemsPage";
import { InventoryPage } from "./InventoryPage";
import { InsightsPage } from "./InsightsPage";
import { NotificationsPage } from "./NotificationsPage";
import { PurchaseHistoryPage } from "./PurchaseHistoryPage";
import { ReceiptUploadPage } from "./ReceiptUploadPage";
import { SettingsPage } from "./SettingsPage";
import { ShoppingListPage } from "./ShoppingListPage";

const navItems = [
  { key: "shopping", label: "Shopping List", icon: <ShoppingCartRoundedIcon fontSize="small" /> },
  { key: "inventory", label: "Inventory", icon: <Inventory2RoundedIcon fontSize="small" /> },
  { key: "essentials", label: "Essential Items", icon: <LocalMallRoundedIcon fontSize="small" /> },
  { key: "receipts", label: "Receipt Upload", icon: <ReceiptLongRoundedIcon fontSize="small" /> },
  { key: "insights", label: "Insights", icon: <InsightsRoundedIcon fontSize="small" /> },
  { key: "history", label: "Purchase History", icon: <HistoryRoundedIcon fontSize="small" /> },
  { key: "notifications", label: "Notifications", icon: <NotificationsRoundedIcon fontSize="small" /> },
  { key: "settings", label: "Settings", icon: <SettingsRoundedIcon fontSize="small" /> },
] as const;

type NavKey = (typeof navItems)[number]["key"];

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      className={active ? "cs-nav-pill cs-nav-pill-active" : "cs-nav-pill"}
      sx={{
        justifyContent: "flex-start",
        px: 1.8,
        py: 1.25,
        minHeight: 46,
        borderRadius: 999,
        color: active ? "white" : "rgba(255,255,255,0.72)",
        textTransform: "none",
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Button>
  );
}

export function DashboardPage() {
  const { activeHouseholdId, households, createHousehold } = useAuth();
  const [active, setActive] = useState<NavKey>("shopping");
  const [createName, setCreateName] = useState("");
  const canRender = households.length > 0 && activeHouseholdId != null;

  const content = useMemo(() => {
    if (!activeHouseholdId) return null;
    switch (active) {
      case "shopping":
        return <ShoppingListPage householdId={activeHouseholdId} />;
      case "inventory":
        return <InventoryPage householdId={activeHouseholdId} />;
      case "essentials":
        return <EssentialItemsPage householdId={activeHouseholdId} />;
      case "receipts":
        return <ReceiptUploadPage householdId={activeHouseholdId} />;
      case "insights":
        return <InsightsPage householdId={activeHouseholdId} />;
      case "history":
        return <PurchaseHistoryPage householdId={activeHouseholdId} />;
      case "notifications":
        return <NotificationsPage householdId={activeHouseholdId} />;
      case "settings":
        return <SettingsPage />;
      default:
        return null;
    }
  }, [active, activeHouseholdId]);

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        pb: 4,
        "&::before": {
          content: '\"\"',
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 12% 18%, rgba(77,177,255,0.18), transparent 22%), radial-gradient(circle at 86% 12%, rgba(124,255,178,0.16), transparent 22%), radial-gradient(circle at 78% 72%, rgba(154,124,255,0.14), transparent 20%), linear-gradient(180deg, #08111f 0%, #0c1629 55%, #08111f 100%)",
          zIndex: -2,
        },
        "&::after": {
          content: '\"\"',
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.18,
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.8), transparent)",
          zIndex: -1,
          pointerEvents: "none",
        },
      }}
    >
      <Box sx={{ maxWidth: 1520, mx: "auto", px: { xs: 2, md: 3 }, pt: 2 }}>
        <TopBar />

        {!canRender ? (
          <Paper
            className="cs-card cs-fade-up"
            sx={{
              p: 3,
              mt: 3,
              borderRadius: 5,
              background: "rgba(9,18,34,0.74)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(14px)",
            }}
          >
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                  <HomeWorkRoundedIcon /> Create your first household
                </Typography>
                <Typography className="cs-muted" sx={{ mt: 1, maxWidth: 760 }}>
                  CartSense shares a single catalog, shopping list, inventory, notifications, and insights across everyone in your home.
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ xs: "stretch", md: "flex-end" }}>
                <TextField
                  label="Household name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  sx={{ minWidth: 320 }}
                />
                <Button
                  variant="contained"
                  sx={{ borderRadius: 999, fontWeight: 800, minHeight: 52, px: 3 }}
                  onClick={async () => {
                    await createHousehold(createName.trim());
                    setCreateName("");
                  }}
                  disabled={!createName.trim()}
                >
                  Create household
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : (
          <>
            <Paper
              sx={{
                mt: 2,
                p: 1,
                borderRadius: 4,
                background: "rgba(8,16,31,0.74)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(14px)",
                overflowX: "auto",
              }}
            >
              <Stack direction="row" spacing={1} className="cs-horizontal-nav">
                {navItems.map((item) => (
                  <NavButton
                    key={item.key}
                    active={active === item.key}
                    icon={item.icon}
                    label={item.label}
                    onClick={() => setActive(item.key)}
                  />
                ))}
              </Stack>
            </Paper>

            <Box sx={{ mt: 2 }}>{content}</Box>
          </>
        )}
      </Box>
    </Box>
  );
}
