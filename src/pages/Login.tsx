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
        <p className="text-ink-500 mb-6 text-sm">Sign in with your @{ALLOWED_EMAIL_DOMAIN} account.</p>

        <button onClick={signIn} className="btn-secondary w-full justify-center">
          Sign in
        </button>

        {error && (
          <div className="mt-4 chip-red w-full justify-center text-xs">{error}</div>
        )}

        <p className="text-xs text-ink-400 mt-6">
          Only @{ALLOWED_EMAIL_DOMAIN} accounts are allowed.
        </p>
      </div>
    </div>
  );
}
