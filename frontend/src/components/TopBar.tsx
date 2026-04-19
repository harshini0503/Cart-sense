import React from "react";
import {
  AppBar,
  Box,
  Button,
  IconButton,
  MenuItem,
  Select,
  Toolbar,
  Typography,
} from "@mui/material";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutIcon from "@mui/icons-material/Logout";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function TopBar() {
  const navigate = useNavigate();
  const { user, households, activeHouseholdId, setActiveHouseholdId, logout } = useAuth();

  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        background: "linear-gradient(135deg, rgba(19,28,58,0.75), rgba(14,101,84,0.24))",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
        borderRadius: 4,
        overflow: "hidden",
        backdropFilter: "blur(16px)",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "-30% auto auto -10%",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(84,214,255,0.18), rgba(84,214,255,0))",
          animation: "csTopBarFloat 12s ease-in-out infinite",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          right: -40,
          top: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,255,178,0.16), rgba(124,255,178,0))",
          animation: "csTopBarFloat 16s ease-in-out infinite reverse",
        },
        "@keyframes csTopBarFloat": {
          "0%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(18px, 14px, 0) scale(1.08)" },
          "100%": { transform: "translate3d(0, 0, 0) scale(1)" },
        },
      }}
    >
      <Toolbar sx={{ alignItems: "center", gap: 1.5, position: "relative", zIndex: 1, minHeight: 82, flexWrap: "wrap" }}>
        <StackTitle />

        <IconButton
          onClick={() => navigate("/")}
          sx={{
            color: "white",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            "&:hover": { background: "rgba(255,255,255,0.12)" },
          }}
          aria-label="Go to home page"
        >
          <HomeRoundedIcon />
        </IconButton>

        <Button
          variant="text"
          startIcon={<DashboardRoundedIcon />}
          onClick={() => navigate("/app")}
          sx={{ borderRadius: 999, color: "white", fontWeight: 800, textTransform: "none" }}
        >
          App
        </Button>

        <Box sx={{ flex: 1 }} />

        {households.length > 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
            <Typography variant="body2" sx={{ opacity: 0.78, fontWeight: 700 }}>
              Household
            </Typography>
            <Select
              size="small"
              value={activeHouseholdId ?? ""}
              onChange={(e) => setActiveHouseholdId(e.target.value ? Number(e.target.value) : null)}
              sx={{
                minWidth: 220,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                "& .MuiSelect-select": { py: 1 },
              }}
            >
              {households.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.name}
                </MenuItem>
              ))}
            </Select>
          </Box>
        ) : null}

        {user ? (
          <Box
            sx={{
              px: 1.5,
              py: 0.9,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{user.name}</Typography>
          </Box>
        ) : null}

        <Button
          onClick={logout}
          variant="outlined"
          startIcon={<LogoutIcon />}
          sx={{
            borderRadius: 999,
            fontWeight: 800,
            borderColor: "rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
}

function StackTitle() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: 0.4 }}>
        CartSense
      </Typography>
      <Typography sx={{ opacity: 0.72, fontSize: 12 }}>
        Smarter pantry, receipts, and refill reminders
      </Typography>
    </Box>
  );
}
