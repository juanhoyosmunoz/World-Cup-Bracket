import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, googleProvider, db, ALLOWED_EMAIL_DOMAIN, ADMIN_EMAILS } from "../firebase";
import { DEMO_MODE, DEMO_USER } from "../lib/demo";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function isAllowed(email: string | null | undefined) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@" + ALLOWED_EMAIL_DOMAIN.toLowerCase());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO_MODE) {
      // Pretend the demo user is signed in immediately, and treat them as admin
      // so the Admin tab is reachable.
      setUser(DEMO_USER as unknown as User);
      setIsAdmin(true);
      setLoading(false);
      return;
    }
    return onIdTokenChanged(auth, async (u) => {
      if (u && !isAllowed(u.email)) {
        // Reject non-antenna domains immediately.
        await signOut(auth);
        setUser(null);
        setIsAdmin(false);
        setError("Only @" + ALLOWED_EMAIL_DOMAIN + " accounts are allowed.");
        setLoading(false);
        return;
      }
      setUser(u);
      if (u) {
        // Custom claim is the source of truth for admin status. We also
        // fall back to env-configured admin emails (handy for first deploy
        // before claims are set).
        const tokenResult = await u.getIdTokenResult().catch(() => null);
        const claimAdmin = Boolean(tokenResult?.claims?.admin);
        const emailAdmin = ADMIN_EMAILS.includes((u.email ?? "").toLowerCase());
        setIsAdmin(claimAdmin || emailAdmin);

        // Upsert user profile (idempotent — uses merge).
        await setDoc(
          doc(db, "users", u.uid),
          {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName ?? (u.email ?? "").split("@")[0],
            photoURL: u.photoURL ?? null,
            createdAt: (await getDoc(doc(db, "users", u.uid))).exists()
              ? undefined
              : serverTimestamp(),
          },
          { merge: true }
        ).catch((e) => console.warn("user profile upsert failed", e));
      } else {
        setIsAdmin(false);
      }
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
          setUser(DEMO_USER as unknown as User);
          setIsAdmin(true);
          return;
        }
        setError(null);
        try {
          const cred = await signInWithPopup(auth, googleProvider);
          if (!isAllowed(cred.user.email)) {
            await signOut(auth);
            setError("Only @" + ALLOWED_EMAIL_DOMAIN + " accounts are allowed.");
          }
        } catch (e: any) {
          if (e?.code !== "auth/popup-closed-by-user") {
            setError(e?.message ?? "Sign-in failed.");
          }
        }
      },
      logout: async () => {
        if (DEMO_MODE) {
          setUser(null);
          setIsAdmin(false);
          return;
        }
        await signOut(auth);
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
