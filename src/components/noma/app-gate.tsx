import { useEffect, type ReactNode } from "react";
import { AuthScreen } from "./auth-screen";
import { VerifyEmail } from "./verify-email";
import { Welcome } from "./welcome";
import { useSettings } from "@/hooks/use-noma";
import { useAuth } from "@/lib/noma/auth";



/** Applies the stored theme and keeps unauthenticated users out when Firebase auth is on. */
export function AppGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { settings, update, ready } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  if (auth.configured && auth.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening Noma…</p>
      </div>
    );
  }
  if (auth.configured && auth.needsEmailVerification) return <VerifyEmail />;

  if (auth.configured && auth.user && !ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening Noma…</p>
      </div>
    );
  }


  if (auth.configured && !auth.user) return <AuthScreen />;

  if (auth.configured && auth.user && ready && settings.onboardedFor !== auth.user.uid) {
    const uid = auth.user.uid;
    return <Welcome email={auth.email} onStart={() => void update({ onboardedFor: uid })} />;
  }

  return <>{children}</>;
}
