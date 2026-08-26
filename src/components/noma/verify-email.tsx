import { Loader2, MailCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { friendlyAuthError, useAuth } from "@/lib/noma/auth";

const COOLDOWN_SECONDS = 60;

/** Blocks access to Noma until a password account's email address is verified. */
export function VerifyEmail() {
  const auth = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [notDetected, setNotDetected] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const check = useCallback(
    async (announce: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (announce) setChecking(true);
      try {
        const verified = await auth.refreshUser();
        if (verified) {
          if (announce) toast.success("Email verified — welcome to Noma.");
          return;
        }
        setNotDetected(true);
        if (announce) toast.error("We haven't seen the verification yet.");
      } catch (error) {
        toast.error(friendlyAuthError(error));
      } finally {
        busyRef.current = false;
        setChecking(false);
      }
    },
    [auth],
  );

  // Re-check when the tab regains focus — the user clicks the link elsewhere.
  useEffect(() => {
    const onFocus = () => void check(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check]);

  const resend = async () => {
    setSending(true);
    try {
      await auth.sendVerification();
      setCooldown(COOLDOWN_SECONDS);
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm text-center animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
        <MailCheck
          className="mx-auto size-8 text-muted-foreground animate-in zoom-in-75 fade-in duration-300 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight">Verify your email</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{auth.email ?? "your email address"}</span>. Open it, then come
          back here.
        </p>

        {notDetected && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none"
          >
            Verification hasn't been detected yet. Click the link in the email (check spam too), then tap “I've verified
            my email”.
          </p>
        )}

        <div className="mt-8 space-y-3" aria-live="polite">
          <Button
            className="h-11 w-full transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={checking || signingOut}
            onClick={() => void check(true)}
          >
            {checking && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {checking ? "Checking…" : "I've verified my email"}
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={sending || cooldown > 0 || signingOut}
            onClick={() => void resend()}
          >
            {sending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await auth.signOut();
              } catch (error) {
                toast.error(friendlyAuthError(error));
                setSigningOut(false);
              }
            }}
          >
            {signingOut && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {signingOut ? "Signing out…" : "Sign out / use another account"}
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Your notes stay on this device — verification only protects your Noma account.
        </p>
      </div>
    </main>
  );
}
