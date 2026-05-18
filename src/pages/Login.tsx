import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ALLOWED_EMAIL_DOMAIN } from "../firebase";
import Logo from "../components/Logo";

export default function Login() {
  const { user, signIn, loading, error } = useAuth();
  const loc = useLocation() as any;
  if (loading) return null;
  if (user) return <Navigate to={loc.state?.from ?? "/dashboard"} replace />;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card-padded max-w-md w-full text-center">
        <div className="flex justify-center mb-5">
          <Logo height={44} />
        </div>
        <h1 className="text-2xl font-extrabold mb-1">World Cup 2026</h1>
        <p className="text-ink-500 mb-6 text-sm">Sign in with your @{ALLOWED_EMAIL_DOMAIN} Google account.</p>

        <button onClick={signIn} className="btn-secondary w-full justify-center">
          <svg viewBox="0 0 18 18" className="w-4 h-4" aria-hidden>
            <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84c-.21 1.12-.84 2.07-1.79 2.7v2.24h2.9c1.69-1.56 2.69-3.86 2.69-6.59z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.24c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.71H.95v2.33A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.95 10.73a5.4 5.4 0 0 1 0-3.46V4.94H.95a9 9 0 0 0 0 8.12l3-2.33z" fill="#FBBC05"/>
            <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.86 11.43 0 9 0A8.997 8.997 0 0 0 .95 4.94l3 2.33C4.66 5.16 6.65 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {error && (
          <div className="mt-4 chip-red w-full justify-center text-xs">{error}</div>
        )}

        <p className="text-xs text-ink-400 mt-6">
          Only @{ALLOWED_EMAIL_DOMAIN} accounts are allowed. If you sign in with a different
          account, you'll be signed out automatically.
        </p>
      </div>
    </div>
  );
}
