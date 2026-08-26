import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  linkWithPopup,
  unlink,
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
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  unlinkGoogle: () => Promise<void>;
}

const AuthContext = createContext<NomaAuth | null>(null);

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
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

    return {
      mode: isFirebaseConfigured ? "firebase" : "local",
      configured: isFirebaseConfigured,
      loading,
      user,
      email: user?.email ?? null,
      providers,
      googleLinked: providers.includes("google.com"),
      signUp: async (email, password) => {
        await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
      },
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
      },
      signInWithGoogle: async () => {
        await signInWithPopup(requireAuth(), new GoogleAuthProvider());
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(requireAuth(), email.trim());
      },
      signOut: async () => {
        await fbSignOut(requireAuth());
      },
      linkGoogle: async () => {
        const current = requireAuth().currentUser;
        if (!current) throw new Error("You need to be signed in to link Google.");
        // Provider linking keeps ONE Noma account with two sign-in methods.
        await linkWithPopup(current, new GoogleAuthProvider());
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
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): NomaAuth {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
