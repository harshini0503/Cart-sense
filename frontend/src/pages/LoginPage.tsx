import React, { useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link as RouterLink, useSearchParams } from "react-router-dom";

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
    <Paper className="cs-card" sx={{ p: 3, maxWidth: 520, mx: "auto", mt: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 1000 }}>
            Sign in
          </Typography>
          <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
            Secure access with authentication.
          </Typography>
        </Box>

        {err ? <Alert severity="error">{err}</Alert> : null}

        {inviteToken ? (
          <Alert severity="info">After signing in, you will finish joining from the invite screen.</Alert>
        ) : null}

        <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
        />

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
          sx={{ borderRadius: 999, fontWeight: 900 }}
        >
          {busy ? "Signing in..." : "Login"}
        </Button>

        <Typography className="cs-muted" sx={{ fontSize: 12 }}>
          New here?{" "}
          <Button variant="text" component={RouterLink} to="/register" sx={{ fontWeight: 900 }}>
            Create an account
          </Button>
        </Typography>
      </Stack>
    </Paper>
  );
}

