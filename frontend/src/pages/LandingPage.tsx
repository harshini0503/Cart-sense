import React from "react";
import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import AltRouteRoundedIcon from "@mui/icons-material/AltRouteRounded";
import { Link as RouterLink } from "react-router-dom";
import { GlassPanel, MetricBadge, SectionHeader, innerCardSx } from "../components/Glass";
import { useAuth } from "../hooks/useAuth";
import "../styles/cartsense.css";

const featureCards = [
  {
    icon: <ShoppingCartRoundedIcon />,
    title: "Store-grouped shopping list",
    copy: "Keep your grocery plan organized by store while categories are auto-suggested from what you type.",
  },
  {
    icon: <Inventory2RoundedIcon />,
    title: "Shared inventory",
    copy: "Track what is currently at home, who purchased it, and where it was last bought.",
  },
  {
    icon: <ReceiptLongRoundedIcon />,
    title: "Receipt confirmation",
    copy: "Upload JPG, PNG, or PDF receipts, review the parsed items, and save clean mappings for future uploads.",
  },
  {
    icon: <InsightsRoundedIcon />,
    title: "Nutrition and purchase insights",
    copy: "See category balance, store patterns, and swap suggestions generated from your household purchase history.",
  },
  {
    icon: <NotificationsRoundedIcon />,
    title: "Refill reminders",
    copy: "Get notified when essential items drop below threshold and optionally send the same alert by email.",
  },
  {
    icon: <TuneRoundedIcon />,
    title: "Manual mappings",
    copy: "Edit canonical products, preferred stores, and receipt aliases in one place instead of letting stores change automatically.",
  },
];

const workflowSteps = [
  {
    icon: <ShoppingCartRoundedIcon />,
    title: "Plan by store",
    copy: "Build lists that stay easy to shop instead of turning into one long, mixed checklist.",
  },
  {
    icon: <ReceiptLongRoundedIcon />,
    title: "Confirm purchases",
    copy: "Use receipts as the quick check-in so the household does not have to update inventory manually every time.",
  },
  {
    icon: <Inventory2RoundedIcon />,
    title: "Track what is at home",
    copy: "Keep the pantry readable, review who purchased items, and watch essentials before they run low.",
  },
  {
    icon: <InsightsRoundedIcon />,
    title: "Learn from purchase patterns",
    copy: "Understand category balance, store reliance, and healthier swaps from actual purchases.",
  },
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
          content: '\"\"',
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(circle at 15% 20%, rgba(77,177,255,0.18), transparent 25%), radial-gradient(circle at 80% 15%, rgba(124,255,178,0.18), transparent 22%), radial-gradient(circle at 75% 72%, rgba(154,124,255,0.14), transparent 18%), linear-gradient(180deg, #08111f 0%, #0c1629 55%, #08111f 100%)",
          zIndex: -2,
        },
        "&::after": {
          content: '\"\"',
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
            <Typography variant="h4" sx={{ fontWeight: 1000 }}>
              CartSense
            </Typography>
            <Typography className="cs-muted" sx={{ mt: 0.8, maxWidth: 720 }}>
              A shared grocery and household dashboard for shopping lists, receipts, inventory, essential reminders, and category-based insights.
            </Typography>
          </Box>

          {token ? (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button component={RouterLink} to="/app" variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }}>
                Continue to app
              </Button>
            </Stack>
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
                Household command center
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 38, md: 58 }, lineHeight: 1.04, fontWeight: 1000, mt: 1.2, maxWidth: 900 }}>
                Grocery planning that feels clean, smart, and collaborative.
              </Typography>
              <Typography sx={{ mt: 2, maxWidth: 780, color: "rgba(255,255,255,0.78)", fontSize: { xs: 15, md: 17 }, lineHeight: 1.85 }}>
                Build lists by store, confirm purchases with receipts, keep inventory current, and manually control product mappings so preferred stores only change when your household says so.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 2.4, flexWrap: "wrap" }}>
                <MetricBadge label="Shared" value="Roommates + family" />
                <MetricBadge label="Fast" value="Receipt confirmation" />
                <MetricBadge label="Smart" value="Insights + notifications" />
              </Stack>
            </Box>

            <Box sx={{ width: { xs: "100%", xl: 430 } }} className="cs-stagger">
              <Paper sx={{ ...innerCardSx, p: 2.2, borderRadius: 4.5 }}>
                <Typography sx={{ fontWeight: 1000 }}>What your household gets</Typography>
                <Stack spacing={1.3} sx={{ mt: 1.8 }}>
                  <Paper sx={{ ...innerCardSx, p: 1.5, borderRadius: 3.5 }}>
                    <Typography sx={{ fontWeight: 900 }}>One receipt store selector</Typography>
                    <Typography className="cs-muted" sx={{ fontSize: 12.5, mt: 0.5, lineHeight: 1.7 }}>
                      Review a full receipt once instead of editing store details item by item.
                    </Typography>
                  </Paper>
                  <Paper sx={{ ...innerCardSx, p: 1.5, borderRadius: 3.5 }}>
                    <Typography sx={{ fontWeight: 900 }}>Manual mapping control</Typography>
                    <Typography className="cs-muted" sx={{ fontSize: 12.5, mt: 0.5, lineHeight: 1.7 }}>
                      Categories can be inferred automatically while preferred stores remain editable by the user.
                    </Typography>
                  </Paper>
                  <Paper sx={{ ...innerCardSx, p: 1.5, borderRadius: 3.5 }}>
                    <Typography sx={{ fontWeight: 900 }}>Essential item reminders</Typography>
                    <Typography className="cs-muted" sx={{ fontSize: 12.5, mt: 0.5, lineHeight: 1.7 }}>
                      Notifications and optional email alerts appear when low-stock items cross a threshold.
                    </Typography>
                  </Paper>
                </Stack>
              </Paper>
            </Box>
          </Stack>
        </GlassPanel>

        <Box sx={{ mt: { xs: 6, md: 9 } }}>
          <SectionHeader
            eyebrow="Feature map"
            title="Everything CartSense can do"
            subtitle="The feature story lives here so the main application can stay focused on actual household work."
          />
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
                  <Typography sx={{ fontWeight: 900 }}>{feature.title}</Typography>
                </Stack>
                <Typography className="cs-muted" sx={{ mt: 1.35, lineHeight: 1.85 }}>
                  {feature.copy}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>

        <Box sx={{ mt: { xs: 6, md: 9 } }}>
          <SectionHeader
            eyebrow="How it flows"
            title="A calmer way to manage the pantry"
            subtitle="The same information is still here, but spaced into a simple journey so the page feels easier to scan."
          />
          <Stack spacing={2} sx={{ mt: 3 }} className="cs-stagger">
            {workflowSteps.map((step, index) => (
              <Paper key={step.title} sx={{ ...innerCardSx, p: { xs: 2, md: 2.4 }, borderRadius: 4.5 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2.2} alignItems={{ xs: "flex-start", md: "center" }}>
                  <Box
                    sx={{
                      minWidth: 54,
                      width: 54,
                      height: 54,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "linear-gradient(135deg, rgba(76,174,255,0.2), rgba(124,255,178,0.16))",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {step.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="overline" sx={{ letterSpacing: 1.8, color: "rgba(255,255,255,0.5)", fontWeight: 900 }}>
                      Step {index + 1}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900, mt: 0.35 }}>
                      {step.title}
                    </Typography>
                    <Typography className="cs-muted" sx={{ mt: 0.75, lineHeight: 1.8, maxWidth: 920 }}>
                      {step.copy}
                    </Typography>
                  </Box>
                  <AltRouteRoundedIcon sx={{ color: "rgba(255,255,255,0.22)", display: { xs: "none", md: "block" } }} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>

        <GlassPanel sx={{ mt: { xs: 6, md: 9 }, p: { xs: 2.5, md: 3 } }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }} spacing={2.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <GroupRoundedIcon /> Ready to start using it?
              </Typography>
              <Typography className="cs-muted" sx={{ mt: 0.9, maxWidth: 840, lineHeight: 1.8 }}>
                Create an account, create a household, and invite everyone who shares the pantry with you. Once you are inside the app, the landing page stays out of the way and the navigation bar gives the workspace more screen space.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button component={RouterLink} to={token ? "/app" : "/register"} variant="contained" sx={{ borderRadius: 999, fontWeight: 900, minHeight: 48, px: 3 }}>
                {token ? "Go to dashboard" : "Get started"}
              </Button>
              {!token ? (
                <Button component={RouterLink} to="/login" variant="outlined" sx={{ borderRadius: 999, fontWeight: 900, minHeight: 48, px: 3 }}>
                  I already have an account
                </Button>
              ) : null}
              {token ? (
                <Button component={RouterLink} to="/app" variant="text" sx={{ borderRadius: 999, fontWeight: 900, minHeight: 48, px: 2 }}>
                  Open workspace
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </GlassPanel>

        <Box sx={{ mt: { xs: 5, md: 7 }, pb: { xs: 2, md: 4 } }} className="cs-fade-up">
          <Paper sx={{ ...innerCardSx, p: { xs: 2, md: 2.4 }, borderRadius: 4, textAlign: "center" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} justifyContent="center" alignItems="center">
              <AutoAwesomeRoundedIcon sx={{ color: "rgba(124,255,178,0.88)" }} />
              <Typography className="cs-muted" sx={{ lineHeight: 1.8 }}>
                CartSense keeps the detailed feature story on this page, while the app itself stays focused on shopping, receipts, inventory, insights, and settings.
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
