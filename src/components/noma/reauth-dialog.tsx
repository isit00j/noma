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
import { PatternLock } from "@/components/noma/pattern-lock";

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
  const [patternError, setPatternError] = useState(false);
  const [busy, setBusy] = useState(false);

  const availableMethods = settings.unlockMethods;

  const activeTabs = [
    availableMethods.biometric && biometricAvailable && "biometric",
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

  const gridColsClass =
    activeTabs.length === 1
      ? "grid-cols-1"
      : activeTabs.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

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

  const handlePatternComplete = async (points: number[]) => {
    if (points.length < 4) {
      if (points.length > 0) toast.error("Pattern must connect at least 4 dots.");
      return;
    }

    setBusy(true);
    setPatternError(false);
    try {
      const res = await verifyCurrentCredential("pattern", points);
      if (res.success) {
        onSuccess();
        onOpenChange(false);
      } else {
        setPatternError(true);
        toast.error(res.error ?? "Incorrect Noma pattern.");
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
          <TabsList className={`grid w-full ${gridColsClass}`}>
            {availableMethods.biometric && biometricAvailable && (
              <TabsTrigger value="biometric">
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

          {availableMethods.biometric && biometricAvailable && (
            <TabsContent value="biometric" className="mt-4 space-y-3 text-center">
              <Button
                type="button"
                className="w-full gap-2"
                disabled={busy}
                onClick={handleBiometricReauth}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Fingerprint className="size-4" />
                )}
                Confirm Biometric
              </Button>
            </TabsContent>
          )}

          {availableMethods.pattern && (
            <TabsContent value="pattern" className="mt-4 space-y-3">
              <div className="mx-auto flex justify-center">
                <PatternLock
                  size={230}
                  disabled={busy}
                  error={patternError}
                  onComplete={(pts) => void handlePatternComplete(pts)}
                  onChange={() => setPatternError(false)}
                />
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
