import { useEffect, useState, useRef } from "react";
import { Fingerprint, Lock, KeyRound, Grid, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSettings } from "@/hooks/use-noma";
import { useAppLock } from "@/lib/noma/AppLockContext";
import { PatternLock } from "@/components/noma/pattern-lock";

export function LockScreen() {
  const { settings } = useSettings();
  const {
    isAppActive,
    biometricAvailable,
    lockoutRemainingSeconds,
    unlockWithBiometric,
    unlockWithPassword,
    unlockWithPattern,
    wipeLocalDataAndSecurity,
  } = useAppLock();

  const [passwordInput, setPasswordInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [patternError, setPatternError] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  const availableMethods = settings.unlockMethods;

  // Usable unlock method verification
  const isBiometricUsable = Boolean(availableMethods.biometric && biometricAvailable);
  const isPatternUsable = Boolean(
    availableMethods.pattern && settings.patternHash && settings.patternSalt,
  );
  const isPasswordUsable = Boolean(
    availableMethods.password && settings.passwordHash && settings.passwordSalt,
  );

  const hasUsableMethod = isBiometricUsable || isPatternUsable || isPasswordUsable;
  const hasAutoTriggeredBiometric = useRef(false);

  const wasAppInactive = useRef(false);

  // Auto-trigger native biometric prompt ONCE per real background-to-foreground return
  useEffect(() => {
    if (!isAppActive) {
      wasAppInactive.current = true;
      return;
    }

    const isRealReturn = wasAppInactive.current;
    if (isRealReturn) {
      hasAutoTriggeredBiometric.current = false;
      wasAppInactive.current = false;
    }

    if (
      availableMethods.biometric &&
      biometricAvailable &&
      lockoutRemainingSeconds === 0 &&
      !hasAutoTriggeredBiometric.current
    ) {
      hasAutoTriggeredBiometric.current = true;
      void unlockWithBiometric();
    }
  }, [
    isAppActive,
    availableMethods.biometric,
    biometricAvailable,
    lockoutRemainingSeconds,
    unlockWithBiometric,
  ]);

  // Determine initial active tab & visible tabs count
  const activeTabs = [
    availableMethods.biometric && "biometric",
    availableMethods.pattern && "pattern",
    availableMethods.password && "password",
  ].filter((t): t is "biometric" | "pattern" | "password" => Boolean(t));

  const defaultTab =
    availableMethods.biometric && biometricAvailable
      ? "biometric"
      : availableMethods.pattern
        ? "pattern"
        : availableMethods.password
          ? "password"
          : activeTabs[0] || "password";

  const [selectedTab, setSelectedTab] = useState<string>(defaultTab);

  useEffect(() => {
    setSelectedTab(defaultTab);
  }, [defaultTab]);

  const gridColsClass =
    activeTabs.length === 1
      ? "grid-cols-1"
      : activeTabs.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput || busy) return;
    setBusy(true);
    try {
      const res = await unlockWithPassword(passwordInput);
      if (!res.success) {
        toast.error(res.error ?? "Incorrect password");
        setPasswordInput("");
      }
    } finally {
      setBusy(false);
    }
  }

  const handlePatternComplete = async (points: number[]) => {
    if (points.length < 4) {
      if (points.length > 0) {
        toast.error("Pattern must connect at least 4 dots.");
      }
      return;
    }

    setBusy(true);
    setPatternError(false);
    try {
      const res = await unlockWithPattern(points);
      if (!res.success) {
        setPatternError(true);
        toast.error(res.error ?? "Incorrect pattern");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="noma-leaf-watermark flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 select-none">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center space-y-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-6" />
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Noma Locked</h1>
          <p className="text-xs text-muted-foreground">
            Enter your credentials to access your local notes library
          </p>
        </div>

        {lockoutRemainingSeconds > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-center gap-2">
            <ShieldAlert className="size-4 shrink-0" />
            <span>Too many attempts. Lockout active for {lockoutRemainingSeconds}s.</span>
          </div>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className={`grid w-full ${gridColsClass}`}>
            {availableMethods.biometric && (
              <TabsTrigger value="biometric" disabled={!biometricAvailable}>
                <Fingerprint className="size-4 mr-1.5" /> Biometric
              </TabsTrigger>
            )}
            {availableMethods.pattern && (
              <TabsTrigger value="pattern">
                <Grid className="size-4 mr-1.5" /> Pattern
              </TabsTrigger>
            )}
            {availableMethods.password && (
              <TabsTrigger value="password">
                <KeyRound className="size-4 mr-1.5" /> Password
              </TabsTrigger>
            )}
          </TabsList>

          {availableMethods.biometric && (
            <TabsContent value="biometric" className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Authenticate using Android Biometric sensor
              </p>
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!biometricAvailable || lockoutRemainingSeconds > 0}
                onClick={() => void unlockWithBiometric()}
              >
                <Fingerprint className="size-5" /> Authenticate Biometric
              </Button>
            </TabsContent>
          )}

          {availableMethods.pattern && (
            <TabsContent value="pattern" className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">Draw your Noma pattern</p>
              <div className="mx-auto flex justify-center">
                <PatternLock
                  size={260}
                  disabled={lockoutRemainingSeconds > 0 || busy}
                  error={patternError}
                  onComplete={(pts) => void handlePatternComplete(pts)}
                  onChange={() => setPatternError(false)}
                />
              </div>
            </TabsContent>
          )}

          {availableMethods.password && (
            <TabsContent value="password" className="mt-6 space-y-4">
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <Input
                  type="password"
                  placeholder="Enter Noma Password"
                  value={passwordInput}
                  disabled={lockoutRemainingSeconds > 0 || busy}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!passwordInput || lockoutRemainingSeconds > 0 || busy}
                >
                  {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Unlock with Password
                </Button>
              </form>
            </TabsContent>
          )}
        </Tabs>

        <div className="pt-4 border-t border-border">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            onClick={() => setShowRecoveryDialog(true)}
          >
            Forgotten Noma credentials?
          </button>
        </div>
      </div>

      <AlertDialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Forgotten Credentials Recovery
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {hasUsableMethod ? (
                <span>
                  If you have forgotten one of your credentials, you can authenticate using any
                  other configured unlock method to unlock Noma and update your security settings.
                </span>
              ) : (
                <>
                  <span className="block">
                    Noma App Lock has no unauthenticated backdoor. Because no other configured
                    unlock method is usable, forgotten credentials can only be reset by performing
                    an explicit local database wipe.
                  </span>
                  <span className="block text-destructive font-semibold">
                    Warning: Wiping local database will permanently delete all local notes,
                    attachments, and settings stored on this device.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2 sm:justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {hasUsableMethod ? (
              <>
                {isBiometricUsable && (
                  <AlertDialogAction
                    onClick={() => {
                      setShowRecoveryDialog(false);
                      void unlockWithBiometric();
                    }}
                  >
                    Authenticate Biometric
                  </AlertDialogAction>
                )}
                {isPatternUsable && (
                  <AlertDialogAction
                    onClick={() => {
                      setSelectedTab("pattern");
                      setShowRecoveryDialog(false);
                    }}
                  >
                    Use Noma Pattern
                  </AlertDialogAction>
                )}
                {isPasswordUsable && (
                  <AlertDialogAction
                    onClick={() => {
                      setSelectedTab("password");
                      setShowRecoveryDialog(false);
                    }}
                  >
                    Use Noma Password
                  </AlertDialogAction>
                )}
              </>
            ) : (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  await wipeLocalDataAndSecurity();
                }}
              >
                Wipe Local Database & Reset
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
