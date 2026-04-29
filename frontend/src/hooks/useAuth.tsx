import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

type User = { id: number; email: string; name: string };
type Household = { id: number; name: string; role: string };

type AuthContextValue = {
  token: string | null;
  user: User | null;
  households: Household[];
  activeHouseholdId: number | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, inviteToken?: string) => Promise<void>;
  logout: () => void;
  setActiveHouseholdId: (id: number | null) => void;
  createHousehold: (name: string) => Promise<void>;
  inviteToHousehold: (
    householdId: number,
    email: string
  ) => Promise<{ invite_token: string; invitePath: string; inviteEmail: string }>;
  acceptInvite: (inviteToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredToken(): string | null {
  try {
    return localStorage.getItem("cartsense_token");
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem("cartsense_token");
    else localStorage.setItem("cartsense_token", token);
  } catch {
    // ignore
  }
}

function getStoredActiveHouseholdId(): number | null {
  try {
    const raw = localStorage.getItem("cartsense_active_household_id");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setStoredActiveHouseholdId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem("cartsense_active_household_id");
    else localStorage.setItem("cartsense_active_household_id", String(id));
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<number | null>(getStoredActiveHouseholdId());
  const [loading, setLoading] = useState<boolean>(true);

  const setActiveHouseholdId = useCallback((id: number | null) => {
    setActiveHouseholdIdState(id);
    setStoredActiveHouseholdId(id);
  }, []);

  const refresh = useCallback(async (nextToken?: string | null) => {
    const authToken = nextToken ?? token;
    if (!authToken) {
      setUser(null);
      setHouseholds([]);
      setActiveHouseholdId(null);
      return;
    }

    const me = await apiFetch<User>("/api/auth/me", { token: authToken });
    const hh = await apiFetch<{ households: Household[]; activeHouseholdId: number | null }>(
      "/api/households/me",
      { token: authToken }
    );

    const nextHouseholds = hh.households || [];
    const storedId = getStoredActiveHouseholdId();
    const serverId = hh.activeHouseholdId ?? null;

    const preferredId = [
      activeHouseholdId,
      storedId,
      serverId,
      nextHouseholds?.[0]?.id ?? null,
    ].find((candidate) =>
      candidate != null && nextHouseholds.some((household) => household.id === candidate)
    ) ?? null;

    setUser(me);
    setHouseholds(nextHouseholds);
    setActiveHouseholdId(preferredId);
  }, [token, activeHouseholdId, setActiveHouseholdId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!token) {
          setUser(null);
          setHouseholds([]);
          setActiveHouseholdId(null);
          return;
        }
        await refresh();
      } catch {
        if (!cancelled) {
          setStoredToken(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredActiveHouseholdId(null);
    setToken(null);
    setUser(null);
    setHouseholds([]);
    setActiveHouseholdId(null);
  }, [setActiveHouseholdId]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<{ access_token: string; user: User }>("/api/auth/login", {
        method: "POST",
        token: undefined,
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(res.access_token);
      setToken(res.access_token);
      await refresh(res.access_token);
    },
    [refresh]
  );

  const register = useCallback(
    async (name: string, email: string, password: string, inviteToken?: string) => {
      const body: Record<string, string> = { name, email, password };
      if (inviteToken?.trim()) body.invite_token = inviteToken.trim();
      const res = await apiFetch<{ access_token: string; user: User }>("/api/auth/register", {
        method: "POST",
        token: undefined,
        body: JSON.stringify(body),
      });
      setStoredToken(res.access_token);
      setToken(res.access_token);
      await refresh(res.access_token);
    },
    [refresh]
  );

  const createHousehold = useCallback(
    async (name: string) => {
      await apiFetch("/api/households", {
        method: "POST",
        token: token || undefined,
        body: JSON.stringify({ name }),
      });
      await refresh();
    },
    [token, refresh]
  );

  const inviteToHousehold = useCallback(
    async (householdId: number, email: string) => {
      const res = await apiFetch<{ invite_token: string; invitePath: string; inviteEmail: string }>(
        "/api/households/invite",
        {
          method: "POST",
          token: token || undefined,
          body: JSON.stringify({ household_id: householdId, email }),
        }
      );
      return {
        invite_token: res.invite_token,
        invitePath: res.invitePath,
        inviteEmail: res.inviteEmail,
      };
    },
    [token]
  );

  const acceptInvite = useCallback(
    async (inviteToken: string) => {
      await apiFetch("/api/households/accept-invite", {
        method: "POST",
        token: token || undefined,
        body: JSON.stringify({ invite_token: inviteToken }),
      });
      await refresh();
    },
    [token, refresh]
  );

  const value: AuthContextValue = useMemo(
    () => ({
      token,
      user,
      households,
      activeHouseholdId,
      loading,
      login,
      register,
      logout,
      setActiveHouseholdId,
      createHousehold,
      inviteToHousehold,
      acceptInvite,
    }),
    [activeHouseholdId, createHousehold, households, inviteToHousehold, login, loading, logout, register, token, user, acceptInvite]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

