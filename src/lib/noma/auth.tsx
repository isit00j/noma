import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  linkWithPopup,
  linkWithRedirect,
  unlink,
  reload,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebase";

export interface NomaAuth {
  mode: "firebase" | "local";
  configured: boolean;
  loading: boolean;
  user: User | null;
  email: string | null;
  providers: string[];
  googleLinked: boolean;
  /** True when the account signs in with a password and the email is still unverified. */
  needsEmailVerification: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerification: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
  signOut: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  unlinkGoogle: () => Promise<void>;
}

const AuthContext = createContext<NomaAuth | null>(null);

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  // Keep full diagnostics in the console — never swallow the original error.
  if (error) console.error("[noma-auth]", code || "no-code", error);
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/weak-password":
      return "Choose a password with at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account already exists with this email. Try signing in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window was closed before finishing.";
    case "auth/unauthorized-domain":
      return "This site's domain isn't authorized in Firebase Authentication. Add this exact hostname under Firebase console → Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "Google sign-in is disabled for this Firebase project. Enable the Google provider under Firebase console → Authentication → Sign-in method.";
    case "auth/operation-not-supported-in-this-environment":
      return "This browser blocked the Google sign-in window. Retrying with a full-page redirect…";
    case "auth/credential-already-in-use":
    case "auth/account-exists-with-different-credential":
      return "This Google account is already connected to a different Noma account. Sign in to that account, or unlink Google there first — Noma will not merge two accounts automatically.";
    case "auth/requires-recent-login":
      return "For security, please sign in again before changing linked accounts.";
    case "auth/network-request-failed":
      return "You appear to be offline. Your notes still work — try again when you're connected.";
    default:
      return (error as Error)?.message?.replace(/^Firebase:\s*/, "") || "Something went wrong. Please try again.";
  }
}

const REDIRECT_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
  "auth/internal-error",
]);

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * Popups are unreliable on mobile browsers and under the preview's
 * Cross-Origin-Opener-Policy (Firebase can't observe window.closed, so the
 * popup silently hangs). On mobile top-level windows we go straight to the
 * redirect flow; embedded frames must keep the popup (a redirect would try to
 * navigate the host page).
 */
function preferRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const embedded = window.top !== window.self;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return !embedded && mobile;
}



export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    // Completes a redirect-based Google sign-in (mobile-friendly path).
    void getRedirectResult(auth).catch((error) => {
      console.error("[noma-auth] google redirect result failed", error);
    });
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const value = useMemo<NomaAuth>(() => {
    const requireAuth = () => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Noma authentication isn't configured yet.");
      return auth;
    };
    const providers = user?.providerData.map((p) => p.providerId) ?? [];
    const passwordOnly = providers.includes("password") && !providers.includes("google.com");

    return {
      mode: isFirebaseConfigured ? "firebase" : "local",
      configured: isFirebaseConfigured,
      loading,
      user,
      email: user?.email ?? null,
      providers,
      googleLinked: providers.includes("google.com"),
      needsEmailVerification: Boolean(user) && passwordOnly && !user?.emailVerified,
      signUp: async (email, password) => {
        const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
        await sendEmailVerification(credential.user, { url: window.location.origin });
      },
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
      },
      signInWithGoogle: async () => {
        const auth = requireAuth();
        try {
          await signInWithPopup(auth, googleProvider());
        } catch (error) {
          const code = (error as { code?: string }).code ?? "";
          console.error("[noma-auth] google popup failed", code, error);
          if (!REDIRECT_FALLBACK_CODES.has(code)) throw error;
          await signInWithRedirect(auth, googleProvider());
        }
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(requireAuth(), email.trim());
      },
      sendVerification: async () => {
        const current = requireAuth().currentUser;
        if (!current) throw new Error("You need to be signed in to resend verification.");
        await sendEmailVerification(current, { url: window.location.origin });
      },
      refreshUser: async () => {
        const current = requireAuth().currentUser;
        if (!current) return false;
        await reload(current);
        setVersion((v) => v + 1);
        setUser(requireAuth().currentUser);
        return Boolean(requireAuth().currentUser?.emailVerified);
      },
      signOut: async () => {
        await fbSignOut(requireAuth());
      },
      linkGoogle: async () => {
        const auth = requireAuth();
        const current = auth.currentUser;
        if (!current) throw new Error("You need to be signed in to link Google.");
        // Provider linking keeps ONE Noma account with two sign-in methods.
        try {
          await linkWithPopup(current, googleProvider());
        } catch (error) {
          const code = (error as { code?: string }).code ?? "";
          console.error("[noma-auth] google link popup failed", code, error);
          if (!REDIRECT_FALLBACK_CODES.has(code)) throw error;
          await linkWithRedirect(current, googleProvider());
          return;
        }
        setUser({ ...current } as User);
      },
      unlinkGoogle: async () => {
        const current = requireAuth().currentUser;
        if (!current) throw new Error("You need to be signed in to unlink Google.");
        if (current.providerData.length < 2) {
          throw new Error("Google is your only sign-in method — add a password before unlinking it.");
        }
        await unlink(current, "google.com");
        setUser({ ...current } as User);
      },
    };
  }, [user, loading, version]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): NomaAuth {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
