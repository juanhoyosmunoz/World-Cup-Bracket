import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { DEMO_MODE } from "./lib/demo";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const ALLOWED_EMAIL_DOMAIN =
  (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string) ?? "antenna.live";

export const ADMIN_EMAILS = (
  (import.meta.env.VITE_ADMIN_EMAILS as string) ?? ""
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// In demo mode we skip real Firebase initialization entirely so the app can
// run with zero backend setup. AuthProvider + firestore helpers branch on
// DEMO_MODE and use the in-memory store from `lib/demo.ts`.
export const app =
  DEMO_MODE
    ? (null as any)
    : (getApps().length ? getApps()[0] : initializeApp(cfg));
export const auth = DEMO_MODE ? (null as any) : getAuth(app);
export const db = DEMO_MODE ? (null as any) : getFirestore(app);
export const functions = DEMO_MODE ? (null as any) : getFunctions(app);

export const googleProvider = DEMO_MODE ? (null as any) : new GoogleAuthProvider();
if (!DEMO_MODE) {
  // hd= hosted domain hint forces Google account chooser to prefer the workspace.
  (googleProvider as GoogleAuthProvider).setCustomParameters({
    hd: ALLOWED_EMAIL_DOMAIN,
    prompt: "select_account",
  });
}

if (!DEMO_MODE && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}
