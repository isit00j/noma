import { useState, useRef } from "react";
import { Fingerprint, KeyRound, Grid, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface ReauthDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ReauthDialog({
  open,
  title = "Authorize Security Change",
  description = "Confirm your identity using any active Noma unlock method to proceed.",
  onOpenChange,
  onSuccess,
}: ReauthDialogProps) {
  const { settings } = useSettings();
  const { biometricAvailable, verifyCurrentCredential } = useAppLock();

  const [passwordInput, setPasswordInput] = useState("");
  const [patternPoints, setPatternPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [busy, setBusy] = useState(false);

  const availableMethods = settings.unlockMethods;
  const svgRef = useRef<SVGSVGElement>(null);

  const defaultTab = availableMethods.biometric && biometricAvailable
    ? "biometric"
    : availableMethods.pattern
      ? "pattern"
      : "password";

  const handleBiometricReauth = async () => {
    setBusy(true);
    try {
      const res = await verifyCurrentCredential("biometric");
      if (res.success) {
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Biometric authorization failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput || busy) return;
    setBusy(true);
    try {
      const res = await verifyCurrentCredential("password", passwordInput);
      if (res.success) {
        setPasswordInput("");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Incorrect Noma password.");
        setPasswordInput("");
      }
    } finally {
      setBusy(false);
    }
  };

  // Pattern SVG grid helpers
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
    setIsDrawing(true);
    const idx = getPointIndex(e.clientX, e.clientY);
    setPatternPoints(idx !== null ? [idx] : []);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const idx = getPointIndex(e.clientX, e.clientY);
    if (idx !== null && !patternPoints.includes(idx)) {
      setPatternPoints((prev) => [...prev, idx]);
    }
  };

  const handlePointerUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (patternPoints.length < 4) {
      if (patternPoints.length > 0) toast.error("Pattern must connect at least 4 dots.");
      setPatternPoints([]);
      return;
    }

    setBusy(true);
    try {
      const res = await verifyCurrentCredential("pattern", patternPoints);
      if (res.success) {
        setPatternPoints([]);
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Incorrect Noma pattern.");
        setPatternPoints([]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="biometric" disabled={!availableMethods.biometric || !biometricAvailable}>
              <Fingerprint className="size-4 mr-1.5" /> Biometric
            </TabsTrigger>
            <TabsTrigger value="pattern" disabled={!availableMethods.pattern}>
              <Grid className="size-4 mr-1.5" /> Pattern
            </TabsTrigger>
            <TabsTrigger value="password" disabled={!availableMethods.password}>
              <KeyRound className="size-4 mr-1.5" /> Password
            </TabsTrigger>
          </TabsList>

          {availableMethods.biometric && (
            <TabsContent value="biometric" className="mt-4 space-y-3 text-center">
              <Button
                type="button"
                className="w-full gap-2"
                disabled={busy}
                onClick={handleBiometricReauth}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
                Confirm Biometric
              </Button>
            </TabsContent>
          )}

          {availableMethods.pattern && (
            <TabsContent value="pattern" className="mt-4 space-y-3">
              <div className="mx-auto flex justify-center">
                <svg
                  ref={svgRef}
                  className="size-56 touch-none rounded-xl border border-border bg-card shadow-sm"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => void handlePointerUp()}
                >
                  {patternPoints.map((pt, i) => {
                    if (i === 0) return null;
                    const prevPt = patternPoints[i - 1];
                    const x1 = (prevPt % 3) * 74 + 37;
                    const y1 = Math.floor(prevPt / 3) * 74 + 37;
                    const x2 = (pt % 3) * 74 + 37;
                    const y2 = Math.floor(pt / 3) * 74 + 37;
                    return (
                      <line
                        key={`line-${i}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="hsl(var(--primary))"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
                    const cx = (idx % 3) * 74 + 37;
                    const cy = Math.floor(idx / 3) * 74 + 37;
                    const selected = patternPoints.includes(idx);
                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r={selected ? "12" : "8"}
                        className={selected ? "fill-primary" : "fill-muted-foreground/30"}
                      />
                    );
                  })}
                </svg>
              </div>
            </TabsContent>
          )}

          {availableMethods.password && (
            <TabsContent value="password" className="mt-4">
              <form onSubmit={handlePasswordReauth} className="space-y-3">
                <Input
                  type="password"
                  placeholder="Enter Noma Password"
                  value={passwordInput}
                  disabled={busy}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
                <Button type="submit" className="w-full" disabled={!passwordInput || busy}>
                  {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Confirm Password
                </Button>
              </form>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
