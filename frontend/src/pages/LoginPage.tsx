import React, { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link as RouterLink, useSearchParams } from "react-router-dom";
import { GlassPanel, MetricBadge } from "../components/Glass";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: 2,
        py: { xs: 3, md: 5 },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 12% 18%, rgba(77,177,255,0.2), transparent 22%), radial-gradient(circle at 86% 14%, rgba(124,255,178,0.16), transparent 20%), linear-gradient(180deg, #08111f 0%, #0c1629 60%, #08111f 100%)",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1080 }}>{children}</Box>
    </Box>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <AuthShell>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.95fr 1.05fr" }, gap: 2 }}>
        <GlassPanel sx={{ p: { xs: 2.2, md: 3.2 }, minHeight: { lg: 560 } }}>
          <Stack spacing={2.2} justifyContent="space-between" sx={{ height: "100%" }}>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 1.8, color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                Welcome back
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 1000, lineHeight: 1.05 }}>
                Sign in to your household workspace.
              </Typography>
              <Typography className="cs-muted" sx={{ mt: 1.4, maxWidth: 520 }}>
                Jump back into shopping lists, receipt confirmation, inventory tracking, refill reminders, and shared household insights.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricBadge label="Shared" value="Household access" />
              <MetricBadge label="Fast" value="Receipt check-ins" />
              <MetricBadge label="Smart" value="Manual mappings" />
            </Stack>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.1 }} className="cs-stagger">
              {[
                ["Shopping by store", "Keep every trip grouped by the store you actually want to visit."],
                ["Inventory visibility", "See what is at home and who last updated it."],
                ["Receipt confirmation", "Confirm parsed items before anything touches inventory."],
                ["Essential alerts", "Track thresholds and get low-stock reminders when they matter."],
              ].map(([title, copy]) => (
                <Box key={title} sx={{ p: 1.2, borderRadius: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
                  <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.55 }}>{copy}</Typography>
                </Box>
              ))}
            </Box>
          </Stack>
        </GlassPanel>

        <GlassPanel sx={{ p: { xs: 2.2, md: 3 }, display: "flex", alignItems: "center" }}>
          <Stack spacing={2} sx={{ width: "100%" }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 1 }}>
                <LoginRoundedIcon fontSize="small" /> Sign in
              </Typography>
              <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
                Secure access with authentication.
              </Typography>
            </Box>

            {err ? <Alert severity="error">{err}</Alert> : null}
            {inviteToken ? <Alert severity="info">After signing in, you will finish joining from the invite screen.</Alert> : null}

            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />

            <Button
              variant="contained"
              disabled={busy || !email.trim() || !password}
              onClick={async () => {
                setErr(null);
                setBusy(true);
                try {
                  await login(email.trim(), password);
                  if (inviteToken.trim()) {
                    navigate(`/join?token=${encodeURIComponent(inviteToken.trim())}`, { replace: true });
                  } else {
                    navigate("/app", { replace: true });
                  }
                } catch (e: any) {
                  setErr(e?.message || "Login failed");
                } finally {
                  setBusy(false);
                }
              }}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ borderRadius: 999, fontWeight: 900, minHeight: 46 }}
            >
              {busy ? "Signing in..." : "Enter CartSense"}
            </Button>

            <Typography className="cs-muted" sx={{ fontSize: 13 }}>
              New here?{" "}
              <Button variant="text" component={RouterLink} to="/register" sx={{ fontWeight: 900 }}>
                Create an account
              </Button>
            </Typography>
          </Stack>
        </GlassPanel>
      </Box>
    </AuthShell>
  );
}
