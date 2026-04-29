import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { API_BASE_URL } from "../api";

type PublicInvite = {
  householdId: number;
  householdName: string;
  inviteEmail: string | null;
  expiresAt: string;
};

export function JoinPage() {
  const { token, user, acceptInvite, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [inviteToken, setInviteToken] = useState(tokenFromUrl);
  const [publicInfo, setPublicInfo] = useState<PublicInvite | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(!!tokenFromUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromUrl) setInviteToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    let cancelled = false;
    const t = tokenFromUrl.trim();
    if (!t) {
      setLoadingInfo(false);
      setPublicInfo(null);
      return;
    }
    (async () => {
      setLoadingInfo(true);
      setErr(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/public/invite/${encodeURIComponent(t)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Invalid invite");
        if (!cancelled) {
          setPublicInfo({
            householdId: data.householdId,
            householdName: data.householdName,
            inviteEmail: data.inviteEmail ?? null,
            expiresAt: data.expiresAt,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Could not load invite");
          setPublicInfo(null);
        }
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenFromUrl]);

  const loginHref = `/login?invite=${encodeURIComponent(inviteToken.trim())}`;
  const registerHref = `/register?invite=${encodeURIComponent(inviteToken.trim())}`;

  return (
    <Paper className="cs-card" sx={{ p: 3, maxWidth: 620, mx: "auto", mt: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 1000 }}>
            Join a household
          </Typography>
          <Typography className="cs-muted" sx={{ fontSize: 12, mt: 0.5 }}>
            Use an invite link or paste the token from your host. New users should register with the same email the invite
            was sent to.
          </Typography>
        </Box>

        {loadingInfo && tokenFromUrl ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={28} />
          </Box>
        ) : null}

        {publicInfo ? (
          <Alert severity="info">
            You are invited to <strong>{publicInfo.householdName}</strong>
            {publicInfo.inviteEmail ? (
              <>
                {" "}
                for <strong>{publicInfo.inviteEmail}</strong>
              </>
            ) : null}
            .
          </Alert>
        ) : null}

        {err ? <Alert severity="error">{err}</Alert> : null}
        {ok ? <Alert severity="success">{ok}</Alert> : null}

        <TextField
          label="Invite token"
          value={inviteToken}
          onChange={(e) => setInviteToken(e.target.value)}
          multiline
          minRows={2}
          fullWidth
          disabled={!!tokenFromUrl && loadingInfo}
        />

        {!token && !authLoading ? (
          <Stack spacing={1}>
            <Typography className="cs-muted" sx={{ fontSize: 12 }}>
              Sign in or create an account, then accept the invite below.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button component={RouterLink} to={registerHref} variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }}>
                Register
              </Button>
              <Button component={RouterLink} to={loginHref} variant="outlined" sx={{ borderRadius: 999, fontWeight: 900 }}>
                Sign in
              </Button>
            </Stack>
          </Stack>
        ) : null}

        {token && user ? (
          <Button
            variant="contained"
            disabled={busy || !inviteToken.trim() || loadingInfo}
            sx={{ borderRadius: 999, fontWeight: 900 }}
            onClick={async () => {
              setErr(null);
              setOk(null);
              setBusy(true);
              try {
                await acceptInvite(inviteToken.trim());
                setOk("Joined household. Opening dashboard…");
                setTimeout(() => navigate("/", { replace: true }), 500);
              } catch (e: any) {
                setErr(e?.message || "Could not join household");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Joining..." : "Accept invite"}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
