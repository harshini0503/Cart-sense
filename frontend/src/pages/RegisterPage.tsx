import React, { useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link as RouterLink, useSearchParams } from "react-router-dom";

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
    <Paper className="cs-card" sx={{ p: 3, maxWidth: 560, mx: "auto", mt: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 1000 }}>
            Create account
          </Typography>
          <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
            If you opened an invite link, you will join that household after registering with the invited email.
          </Typography>
        </Box>

        {inviteFromUrl ? (
          <Alert severity="info">Completing a household invite — use the same email the invite was sent to.</Alert>
        ) : null}

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
          sx={{ borderRadius: 999, fontWeight: 900 }}
        >
          {busy ? "Creating..." : "Register"}
        </Button>

        <Typography className="cs-muted" sx={{ fontSize: 12 }}>
          Already have an account?{" "}
          <Button variant="text" component={RouterLink} to="/login" sx={{ fontWeight: 900 }}>
            Sign in
          </Button>
        </Typography>
      </Stack>
    </Paper>
  );
}

