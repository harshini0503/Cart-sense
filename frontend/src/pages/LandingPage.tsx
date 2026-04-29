import React from "react";
import { Box, Button, Chip, Container, Paper, Stack, Typography } from "@mui/material";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import { Link as RouterLink } from "react-router-dom";
import { GlassPanel, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";
import "../styles/cartsense.css";

const featureCards = [
  { icon: <ShoppingCartRoundedIcon />, title: "Shopping lists", copy: "Grouped by store." },
  { icon: <ReceiptLongRoundedIcon />, title: "Receipt confirmation", copy: "Clean before save." },
  { icon: <Inventory2RoundedIcon />, title: "Shared inventory", copy: "Track what is home." },
  { icon: <InsightsRoundedIcon />, title: "Insights", copy: "Category balance." },
  { icon: <NotificationsRoundedIcon />, title: "Reminders", copy: "Essential alerts." },
  { icon: <TuneRoundedIcon />, title: "Mappings", copy: "Manual control." },
];

const workflowSteps = [
  "Plan by store",
  "Confirm receipts",
  "Track inventory",
  "Review insights",
];

export function LandingPage() {
  const { token } = useAuth();

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        overflowX: "hidden",
        "&::before": {
          content: '""',
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 15% 20%, rgba(77,177,255,0.18), transparent 25%), radial-gradient(circle at 80% 15%, rgba(124,255,178,0.18), transparent 22%), radial-gradient(circle at 75% 72%, rgba(154,124,255,0.14), transparent 18%), linear-gradient(180deg, #08111f 0%, #0c1629 55%, #08111f 100%)",
          zIndex: -2,
        },
        "&::after": {
          content: '""',
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.18,
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9), transparent)",
          zIndex: -1,
          pointerEvents: "none",
        },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 1480, px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={2.2}
        >
          <Box className="cs-fade-up">
            <Typography className="cs-brand-text" sx={{ fontSize: { xs: 42, md: 62 }, fontWeight: 1000, lineHeight: 1 }}>
              CartSense
            </Typography>
            <Typography className="cs-muted" sx={{ mt: 1, maxWidth: 560 }}>
              Shared grocery planning, receipts, inventory, and reminders.
            </Typography>
          </Box>

          {token ? (
            <Button component={RouterLink} to="/app" variant="contained" sx={{ borderRadius: 999, fontWeight: 900, px: 3.2, minHeight: 48 }}>
              Continue
            </Button>
          ) : (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button component={RouterLink} to="/login" variant="outlined" sx={{ borderRadius: 999, fontWeight: 900 }}>
                Sign in
              </Button>
              <Button component={RouterLink} to="/register" variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }}>
                Create account
              </Button>
            </Stack>
          )}
        </Stack>

        <GlassPanel sx={{ mt: { xs: 3, md: 5 }, p: { xs: 2.4, md: 4 } }}>
          <Stack direction={{ xs: "column", xl: "row" }} spacing={{ xs: 3, md: 4 }} alignItems={{ xs: "flex-start", xl: "center" }}>
            <Box sx={{ flex: 1 }} className="cs-fade-up">
              <Typography variant="overline" sx={{ letterSpacing: 2, color: "rgba(255,255,255,0.62)", fontWeight: 900 }}>
                Household workspace
              </Typography>
              <Typography sx={{ fontSize: { xs: 40, md: 72 }, lineHeight: 0.98, fontWeight: 1000, mt: 1.2, maxWidth: 920 }}>
                <span className="cs-brand-text">CartSense</span>
                <br />
                for your pantry.
              </Typography>
              <Typography sx={{ mt: 2, maxWidth: 720, color: "rgba(255,255,255,0.78)", fontSize: { xs: 15, md: 17 }, lineHeight: 1.75 }}>
                Keep the app focused on household work while this page stays simple and scrollable.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2.4, flexWrap: "wrap" }} useFlexGap>
                <Chip label="Lists" className="cs-glass-chip" />
                <Chip label="Receipts" className="cs-glass-chip" />
                <Chip label="Inventory" className="cs-glass-chip" />
                <Chip label="Insights" className="cs-glass-chip" />
              </Stack>
            </Box>

            <Box sx={{ width: { xs: "100%", xl: 380 } }} className="cs-stagger">
              <Paper sx={{ ...innerCardSx, p: 2.2, borderRadius: 4.5 }}>
                <Typography sx={{ fontWeight: 1000 }}>Quick view</Typography>
                <Stack spacing={1.1} sx={{ mt: 1.8 }}>
                  <Paper sx={{ ...innerCardSx, p: 1.4, borderRadius: 3.2 }}>
                    <Typography sx={{ fontWeight: 900 }}>One receipt store selector</Typography>
                  </Paper>
                  <Paper sx={{ ...innerCardSx, p: 1.4, borderRadius: 3.2 }}>
                    <Typography sx={{ fontWeight: 900 }}>Manual product mappings</Typography>
                  </Paper>
                  <Paper sx={{ ...innerCardSx, p: 1.4, borderRadius: 3.2 }}>
                    <Typography sx={{ fontWeight: 900 }}>Essential item reminders</Typography>
                  </Paper>
                </Stack>
              </Paper>
            </Box>
          </Stack>
        </GlassPanel>

        <Box sx={{ mt: { xs: 6, md: 9 } }}>
          <SectionHeader eyebrow="Feature map" title="Core features" subtitle="" />
          <Box
            className="cs-stagger"
            sx={{
              mt: 3,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
              gap: { xs: 1.5, md: 1.8 },
            }}
          >
            {featureCards.map((feature) => (
              <Paper key={feature.title} sx={{ ...innerCardSx, p: 2.2, borderRadius: 4 }} className="cs-sheen">
                <Stack direction="row" spacing={1.2} alignItems="center">
                  <Box
                    className="cs-icon-pulse"
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(124,255,178,0.12)",
                      border: "1px solid rgba(124,255,178,0.16)",
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 900 }}>{feature.title}</Typography>
                    <Typography className="cs-muted" sx={{ mt: 0.15, fontSize: 12.5 }}>
                      {feature.copy}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>
        </Box>

        <Box sx={{ mt: { xs: 6, md: 9 } }}>
          <SectionHeader eyebrow="How it flows" title="Simple flow" subtitle="" />
          <Stack spacing={1.4} sx={{ mt: 3 }} className="cs-stagger">
            {workflowSteps.map((step, index) => (
              <Paper key={step} sx={{ ...innerCardSx, p: { xs: 1.7, md: 2 }, borderRadius: 4.5 }}>
                <Stack direction="row" spacing={1.4} alignItems="center">
                  <Box
                    sx={{
                      minWidth: 42,
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "linear-gradient(135deg, rgba(76,174,255,0.2), rgba(124,255,178,0.16))",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography sx={{ fontWeight: 900 }}>{step}</Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>

        <GlassPanel sx={{ mt: { xs: 6, md: 9 }, p: { xs: 2.5, md: 3 } }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }} spacing={2.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <GroupRoundedIcon /> Start with <span className="cs-brand-text">CartSense</span>
              </Typography>
              <Typography className="cs-muted" sx={{ mt: 0.9 }}>
                Create an account and invite your household.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button component={RouterLink} to={token ? "/app" : "/register"} variant="contained" sx={{ borderRadius: 999, fontWeight: 900, minHeight: 48, px: 3 }}>
                {token ? "Go to dashboard" : "Get started"}
              </Button>
              {!token ? (
                <Button component={RouterLink} to="/login" variant="outlined" sx={{ borderRadius: 999, fontWeight: 900, minHeight: 48, px: 3 }}>
                  Sign in
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </GlassPanel>
      </Container>
    </Box>
  );
}
