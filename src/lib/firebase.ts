import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";
import { firebaseConfig, googleDriveClientId as driveClientId } from "@/config/firebaseConfig";

import { Capacitor } from "@capacitor/core";
const config = { ...firebaseConfig };

// To support Firebase Auth redirect flows securely on external environments
// and mitigate cross-origin storage partitioning restrictions (e.g., Safari ITP) for the PWA,
// we proxy /__/auth/ endpoints via Vercel and override the authDomain.
// IMPORTANT: We ONLY do this on the production web environment.
// On Capacitor Native, overriding authDomain to the local app hostname causes the WebView
// to intercept the navigation, resulting in a blank screen instead of opening the system browser.
if (
  typeof window !== "undefined" &&
  window.location.hostname === "mynoma.vercel.app" &&
  !Capacitor.isNativePlatform()
) {
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
