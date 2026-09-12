import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettings } from "@/hooks/use-noma";
import { useAppLock } from "@/lib/noma/AppLockContext";
import { ReauthDialog } from "@/components/noma/reauth-dialog";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border py-8 last:border-0">
      <h2 className="font-serif text-xl font-medium">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function AppLockSection() {
  const { settings, update } = useSettings();
  const { biometricAvailable, setPassword, setPattern } = useAppLock();

  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");

  const [patternModalOpen, setPatternModalOpen] = useState(false);
  const [patternPoints, setPatternPoints] = useState<number[]>([]);
  const [confirmPatternPoints, setConfirmPatternPoints] = useState<number[]>([]);
  const [patternStep, setPatternStep] = useState<"draw" | "confirm">("draw");
  const [isDrawing, setIsDrawing] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);

  const requestAuthorizedChange = (action: () => Promise<void>) => {
    if (settings.appLockEnabled) {
      setPendingAction(() => action);
      setReauthOpen(true);
    } else {
      void action();
    }
  };

  const handleReauthSuccess = () => {
    if (pendingAction) {
      void pendingAction();
      setPendingAction(null);
    }
  };

  const openPatternSetup = () => {
    setPatternPoints([]);
    setConfirmPatternPoints([]);
    setPatternStep("draw");
    setPatternModalOpen(true);
  };

  const openPasswordSetup = () => {
    setPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordModalOpen(true);
  };

  const handleToggleAppLock = (enabled: boolean) => {
    if (enabled) {
      if (
        !settings.unlockMethods.pattern &&
        !settings.unlockMethods.password &&
        !settings.unlockMethods.biometric
      ) {
        toast.error("Please configure a Noma Pattern or Password first.");
        openPasswordSetup();
        return;
      }
      void update({ appLockEnabled: true });
    } else {
      requestAuthorizedChange(async () => {
        await update({ appLockEnabled: false });
        toast.success("App Lock disabled.");
      });
    }
  };

  const handleToggleBiometric = (enabled: boolean) => {
    if (enabled && !biometricAvailable) {
      toast.error("Biometric hardware unavailable or not enrolled.");
      return;
    }

    if (enabled) {
      if (!settings.unlockMethods.pattern && !settings.unlockMethods.password) {
        toast.error("Biometric requires at least one Noma fallback (Pattern or Password).");
        openPasswordSetup();
        return;
      }
      requestAuthorizedChange(async () => {
        await update({
          unlockMethods: { ...settings.unlockMethods, biometric: true },
        });
        toast.success("Biometric unlock enabled.");
      });
    } else {
      requestAuthorizedChange(async () => {
        await update({
          unlockMethods: { ...settings.unlockMethods, biometric: false },
        });
        toast.success("Biometric unlock disabled.");
      });
    }
  };

  const handleTogglePassword = (enabled: boolean) => {
    if (enabled) {
      requestAuthorizedChange(async () => {
        openPasswordSetup();
      });
    } else {
      if (settings.unlockMethods.biometric && !settings.unlockMethods.pattern) {
        toast.error(
          "Biometric requires at least one Noma fallback. Configure or keep Pattern/Password active.",
        );
        return;
      }
      if (!settings.unlockMethods.pattern) {
        toast.error("At least one unlock method must remain enabled.");
        return;
      }
      requestAuthorizedChange(async () => {
        await update({
          unlockMethods: { ...settings.unlockMethods, password: false },
          passwordHash: null,
          passwordSalt: null,
        });
        toast.success("Password unlock disabled.");
      });
    }
  };

  const handleTogglePattern = (enabled: boolean) => {
    if (enabled) {
      requestAuthorizedChange(async () => {
        openPatternSetup();
      });
    } else {
      if (settings.unlockMethods.biometric && !settings.unlockMethods.password) {
        toast.error(
          "Biometric requires at least one Noma fallback. Configure or keep Pattern/Password active.",
        );
        return;
      }
      if (!settings.unlockMethods.password) {
        toast.error("At least one unlock method must remain enabled.");
        return;
      }
      requestAuthorizedChange(async () => {
        await update({
          unlockMethods: { ...settings.unlockMethods, pattern: false },
          patternHash: null,
          patternSalt: null,
        });
        toast.success("Pattern unlock disabled.");
      });
    }
  };

  // Pattern SVG Canvas drawing logic
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
        if (Math.hypot(x - cx, y - cy) < step / 2.5) {
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
      // Ignore if setPointerCapture unsupported
    }
    setIsDrawing(true);
    const idx = getPointIndex(e.clientX, e.clientY);
    const initial = idx !== null ? [idx] : [];
    if (patternStep === "draw") setPatternPoints(initial);
    else setConfirmPatternPoints(initial);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const idx = getPointIndex(e.clientX, e.clientY);
    if (idx !== null) {
      if (patternStep === "draw" && !patternPoints.includes(idx)) {
        setPatternPoints((prev) => [...prev, idx]);
      } else if (patternStep === "confirm" && !confirmPatternPoints.includes(idx)) {
        setConfirmPatternPoints((prev) => [...prev, idx]);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDrawing(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
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
    if (patternStep === "draw") setPatternPoints([]);
    else setConfirmPatternPoints([]);
  };

  const savePatternSetup = async () => {
    if (patternStep === "draw") {
      if (patternPoints.length < 4) {
        toast.error("Pattern must connect at least 4 dots.");
        return;
      }
      setPatternStep("confirm");
      return;
    }

    if (patternPoints.join("-") !== confirmPatternPoints.join("-")) {
      toast.error("Patterns do not match. Try again.");
      setPatternStep("draw");
      setPatternPoints([]);
      setConfirmPatternPoints([]);
      return;
    }

    await setPattern(patternPoints);
    toast.success("Noma Pattern configured.");
    setPatternModalOpen(false);
  };

  const savePasswordSetup = async () => {
    if (passwordInput.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      toast.error("Passwords do not match.");
      return;
    }

    await setPassword(passwordInput);
    toast.success("Noma Password configured.");
    setPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordModalOpen(false);
  };

  const activePoints = patternStep === "draw" ? patternPoints : confirmPatternPoints;

  return (
    <Section
      title="App Lock & Security"
      description="Protect Noma with local biometrics, pattern, or password access control."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-base font-medium">App Lock</Label>
          <p className="text-xs text-muted-foreground">Require unlock when returning to Noma</p>
        </div>
        <Switch checked={settings.appLockEnabled} onCheckedChange={handleToggleAppLock} />
      </div>

      <div className="space-y-4 pt-2 border-t border-border">
        <Label className="text-sm font-semibold">Unlock Methods</Label>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">Biometric Unlock</Label>
            <p className="text-xs text-muted-foreground">
              {Capacitor.isNativePlatform()
                ? biometricAvailable
                  ? "Android native fingerprint / strong biometric"
                  : "Biometric hardware unavailable"
                : "Unavailable on web/PWA"}
            </p>
          </div>
          <Switch
            checked={settings.unlockMethods.biometric}
            disabled={!Capacitor.isNativePlatform() || !biometricAvailable}
            onCheckedChange={handleToggleBiometric}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Noma Pattern</Label>
              {settings.unlockMethods.pattern && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => requestAuthorizedChange(async () => openPatternSetup())}
                >
                  Change
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Custom Noma pattern independent of phone lock
            </p>
          </div>
          <Switch checked={settings.unlockMethods.pattern} onCheckedChange={handleTogglePattern} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Noma Password</Label>
              {settings.unlockMethods.password && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => requestAuthorizedChange(async () => openPasswordSetup())}
                >
                  Change
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Custom Noma password independent of phone lock
            </p>
          </div>
          <Switch
            checked={settings.unlockMethods.password}
            onCheckedChange={handleTogglePassword}
          />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-sm font-semibold">Lock Noma after</Label>
        <Select
          value={String(settings.lockTimeout)}
          onValueChange={(val) => {
            const timeout = Number(val);
            requestAuthorizedChange(async () => {
              await update({ lockTimeout: timeout });
              toast.success("Lock timeout updated.");
            });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select lock timeout" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Immediately</SelectItem>
            <SelectItem value="10">10 seconds</SelectItem>
            <SelectItem value="60">1 minute</SelectItem>
            <SelectItem value="300">5 minutes</SelectItem>
            <SelectItem value="900">15 minutes</SelectItem>
            <SelectItem value="1800">30 minutes</SelectItem>
            <SelectItem value="3600">1 hour</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        onSuccess={handleReauthSuccess}
      />

      {/* Pattern Setup Modal */}
      <Dialog open={patternModalOpen} onOpenChange={setPatternModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {patternStep === "draw" ? "Draw Noma Pattern" : "Confirm Noma Pattern"}
            </DialogTitle>
            <DialogDescription>
              {patternStep === "draw"
                ? "Connect at least 4 dots to form your pattern."
                : "Draw the pattern once more to confirm."}
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto flex justify-center py-2">
            <svg
              ref={svgRef}
              className="size-60 touch-none rounded-xl border border-border bg-card shadow-sm"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              {activePoints.map((pt, i) => {
                if (i === 0) return null;
                const prevPt = activePoints[i - 1];
                if (prevPt === undefined) return null;
                const x1 = (prevPt % 3) * 80 + 40;
                const y1 = Math.floor(prevPt / 3) * 80 + 40;
                const x2 = (pt % 3) * 80 + 40;
                const y2 = Math.floor(pt / 3) * 80 + 40;
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
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
                const cx = (idx % 3) * 80 + 40;
                const cy = Math.floor(idx / 3) * 80 + 40;
                const selected = activePoints.includes(idx);
                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={selected ? "14" : "10"}
                    className={selected ? "fill-primary" : "fill-muted-foreground/30"}
                  />
                );
              })}
            </svg>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPatternPoints([]);
                setConfirmPatternPoints([]);
                setPatternStep("draw");
              }}
            >
              Reset
            </Button>
            <Button onClick={() => void savePatternSetup()}>
              {patternStep === "draw" ? "Next" : "Save Pattern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Setup Modal */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Set Noma Password</DialogTitle>
            <DialogDescription>
              Create a password specifically for Noma. It will be salted and hashed locally using
              PBKDF2.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">New Noma Password</Label>
              <Input
                type="password"
                placeholder="Enter password (min 8 chars)"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirm Noma Password</Label>
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasswordModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!passwordInput || !confirmPasswordInput}
              onClick={() => void savePasswordSetup()}
            >
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
