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
  const [patternPoints, setPatternPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  const availableMethods = settings.unlockMethods;
  const hasAutoTriggeredBiometric = useRef(false);

  // Auto-trigger native biometric prompt ONCE when in active foreground
  useEffect(() => {
    if (!isAppActive) {
      hasAutoTriggeredBiometric.current = false;
      return;
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

  const defaultTab = availableMethods.biometric && biometricAvailable
    ? "biometric"
    : availableMethods.pattern
      ? "pattern"
      : availableMethods.password
        ? "password"
        : activeTabs[0] || "password";

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

  // 3x3 Pattern SVG Grid Canvas drawing logic
  const svgRef = useRef<SVGSVGElement>(null);

  const getPointIndex = (clientX: number, clientY: number): number | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const size = rect.width;
    const step = size / 3;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = col * step + step / 2;
        const cy = row * step + step / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < step / 2.5) {
          return row * 3 + col;
        }
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if setPointerCapture unsupported in test environment
    }
    setIsDrawing(true);
    const idx = getPointIndex(e.clientX, e.clientY);
    if (idx !== null) {
      setPatternPoints([idx]);
    } else {
      setPatternPoints([]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const idx = getPointIndex(e.clientX, e.clientY);
    if (idx !== null && !patternPoints.includes(idx)) {
      setPatternPoints((prev) => [...prev, idx]);
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (patternPoints.length < 4) {
      if (patternPoints.length > 0) {
        toast.error("Pattern must connect at least 4 dots.");
      }
      setPatternPoints([]);
      return;
    }

    setBusy(true);
    try {
      const res = await unlockWithPattern(patternPoints);
      if (!res.success) {
        toast.error(res.error ?? "Incorrect pattern");
      }
    } finally {
      setBusy(false);
      setPatternPoints([]);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDrawing(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    setPatternPoints([]);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8 select-none">
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

        <Tabs defaultValue={defaultTab} className="w-full">
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
                <svg
                  ref={svgRef}
                  className="size-64 touch-none rounded-xl border border-border bg-card shadow-sm"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => void handlePointerUp(e)}
                  onPointerCancel={handlePointerCancel}
                >
                  {/* Grid Lines */}
                  {patternPoints.map((pt, i) => {
                    if (i === 0) return null;
                    const prevPt = patternPoints[i - 1];
                    const x1 = (prevPt % 3) * 85 + 42.5;
                    const y1 = Math.floor(prevPt / 3) * 85 + 42.5;
                    const x2 = (pt % 3) * 85 + 42.5;
                    const y2 = Math.floor(pt / 3) * 85 + 42.5;
                    return (
                      <line
                        key={`line-${i}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="hsl(var(--primary))"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {/* Grid Dots */}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
                    const cx = (idx % 3) * 85 + 42.5;
                    const cy = Math.floor(idx / 3) * 85 + 42.5;
                    const selected = patternPoints.includes(idx);
                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r={selected ? "14" : "10"}
                        className={
                          selected
                            ? "fill-primary transition-all duration-150"
                            : "fill-muted-foreground/30 hover:fill-muted-foreground/60 transition-all duration-150"
                        }
                      />
                    );
                  })}
                </svg>
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
            <AlertDialogTitle className="font-serif">Forgotten Credentials Recovery</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {availableMethods.biometric && biometricAvailable ? (
                <span>
                  If you have forgotten your pattern or password, you can authenticate using your Biometric sensor to unlock Noma and reset your credentials in Settings.
                </span>
              ) : (
                <>
                  <span className="block">
                    Noma App Lock has no unauthenticated backdoor. To protect local security, forgotten credentials can only be reset by authenticating with another active method or performing an explicit local database wipe.
                  </span>
                  <span className="block text-destructive font-semibold">
                    Warning: Wiping local database will permanently delete all local notes, attachments, and settings stored on this device.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {availableMethods.biometric && biometricAvailable ? (
              <AlertDialogAction onClick={() => void unlockWithBiometric()}>
                Authenticate Biometric
              </AlertDialogAction>
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
