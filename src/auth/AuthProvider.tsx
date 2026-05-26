import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, ALLOWED_EMAIL_DOMAIN, ADMIN_EMAILS, DEMO_MODE } from "../firebase";
import { DEMO_USER } from "../lib/demo";

interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO_MODE) {
      setUser(DEMO_USER as AuthUser);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    // Fetch identity from the backend (which reads the auth proxy headers).
    apiFetch<{
      uid: string;
      email: string;
      displayName: string;
      photoURL?: string;
      isAdmin: boolean;
    }>("/api/me")
      .then((me) => {
        setUser({
          uid: me.uid,
          email: me.email,
          displayName: me.displayName,
          photoURL: me.photoURL,
        });
        const emailAdmin = ADMIN_EMAILS.includes(
          (me.email ?? "").toLowerCase()
        );
        setIsAdmin(me.isAdmin || emailAdmin);
        setLoading(false);
      })
      .catch((e) => {
        console.warn("Auth check failed:", e);
        setUser(null);
        setIsAdmin(false);
        setError(
          "Authentication required. Please sign in through your organization's SSO."
        );
        setLoading(false);
      });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAdmin,
      error,
      signIn: async () => {
        if (DEMO_MODE) {
          setUser(DEMO_USER as AuthUser);
          setIsAdmin(true);
          return;
        }
        // In production, the auth proxy handles sign-in.
        // Reload the page to trigger the proxy's auth flow.
        window.location.reload();
      },
      logout: async () => {
        if (DEMO_MODE) {
          setUser(null);
          setIsAdmin(false);
          return;
        }
        setUser(null);
        setIsAdmin(false);
      },
    }),
    [user, loading, isAdmin, error]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
