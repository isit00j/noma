import { useEffect, type ReactNode } from "react";
import { VerifyEmail } from "./verify-email";
import { Welcome } from "./welcome";
import { useSettings } from "@/hooks/use-noma";
import { useAuth } from "@/lib/noma/auth";
import { applyTheme } from "@/lib/noma/theme";

/**
 * Applies the stored theme and, for signed-in accounts only, handles email
 * verification and the first-run welcome. Signing in is optional: without an
 * account Noma runs in Local Mode straight into the workspace.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { settings, update, ready } = useSettings();

  // Light = light, Dark = dark, System follows the OS and reacts to changes live.
  useEffect(() => {
    if (!ready) return;
    const choice = settings.theme;
    applyTheme(choice);
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme, ready]);

  if (auth.configured && auth.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse motion-reduce:animate-none">Opening Noma…</p>
      </div>
    );
  }

  if (auth.configured && auth.user && auth.needsEmailVerification) return <VerifyEmail />;

  if (auth.configured && auth.user && ready && settings.onboardedFor !== auth.user.uid) {
    const uid = auth.user.uid;
    return (
      <div className="animate-in fade-in duration-300 motion-reduce:animate-none">
        <Welcome email={auth.email} onStart={() => void update({ onboardedFor: uid })} />
      </div>
    );
  }

  return <div className="animate-in fade-in duration-200 motion-reduce:animate-none">{children}</div>;
}
