import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";
import { firebaseConfig, googleDriveClientId as driveClientId } from "@/config/firebaseConfig";

const config = { ...firebaseConfig };

// To support Firebase Auth redirect flows securely on external environments
// and mitigate cross-origin storage partitioning restrictions (e.g., Safari ITP),
// we proxy /__/auth/ endpoints via Vercel to the Firebase project, and override
// the authDomain to match the current app host.
if (typeof window !== "undefined" && window.location.hostname) {
  config.authDomain = window.location.hostname;
}

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured || typeof window === "undefined") return null;
  if (!auth) {
    app = getApps()[0] ?? initializeApp(config as Record<string, string>);
    auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  }
  return auth;
}

export const googleDriveClientId: string | undefined = driveClientId || undefined;
