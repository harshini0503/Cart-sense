import React, { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
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

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteFromUrl = searchParams.get("invite") || "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <AuthShell>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.95fr 1.05fr" }, gap: 2 }}>
        <GlassPanel sx={{ p: { xs: 2.2, md: 3.2 }, minHeight: { lg: 580 } }}>
          <Stack spacing={2.2} justifyContent="space-between" sx={{ height: "100%" }}>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 1.8, color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                Create your account
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 1000, lineHeight: 1.05 }}>
                Start a shared grocery workflow that actually feels organized.
              </Typography>
              <Typography className="cs-muted" sx={{ mt: 1.4, maxWidth: 520 }}>
                Build store-grouped lists, confirm receipts, keep inventory synced, and manage household reminders without stuffing everything into one screen.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <MetricBadge label="Receipts" value="Review before save" />
              <MetricBadge label="Inventory" value="Shared updates" />
              <MetricBadge label="Insights" value="Category balance" />
            </Stack>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.1 }} className="cs-stagger">
              {[
                ["Household invites", "Bring roommates or family into the same dashboard with invite links."],
                ["Preferred stores", "Keep store mappings manual so your household stays in control."],
                ["Essential items", "Track low-stock thresholds for items that should never run out."],
                ["Purchase history", "See what was bought, from where, and by which household member."],
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
                <PersonAddAlt1RoundedIcon fontSize="small" /> Create account
              </Typography>
              <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
                Register once, then switch between households from the app.
              </Typography>
            </Box>

            {inviteFromUrl ? <Alert severity="info">Completing a household invite. Use the same email the invite was sent to.</Alert> : null}
            {err ? <Alert severity="error">{err}</Alert> : null}

            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              helperText="Minimum 6 characters"
            />

            <Button
              variant="contained"
              disabled={busy || !name.trim() || !email.trim() || password.length < 6}
              onClick={async () => {
                setErr(null);
                setBusy(true);
                try {
                  await register(name.trim(), email.trim(), password, inviteFromUrl || undefined);
                  navigate("/app", { replace: true });
                } catch (e: any) {
                  setErr(e?.message || "Registration failed");
                } finally {
                  setBusy(false);
                }
              }}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ borderRadius: 999, fontWeight: 900, minHeight: 46 }}
            >
              {busy ? "Creating..." : "Create CartSense account"}
            </Button>

            <Typography className="cs-muted" sx={{ fontSize: 13 }}>
              Already have an account?{" "}
              <Button variant="text" component={RouterLink} to="/login" sx={{ fontWeight: 900 }}>
                Sign in
              </Button>
            </Typography>
          </Stack>
        </GlassPanel>
      </Box>
    </AuthShell>
  );
}
