import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/noma/db";

/**
 * First-run decision on a new device. Nothing is deleted here — local notes are
 * always preserved, this only points the user at restore if they want it.
 */
export function Welcome({ email, onStart }: { email: string | null; onStart: () => void }) {
  const noteCount = useLiveQuery(() => db().notes.filter((n) => !n.deleted).count(), [], 0);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Welcome to Noma</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {email ? `Signed in as ${email}. ` : ""}Your notes live on this device — signing in never uploads them.
        </p>

        {noteCount > 0 && (
          <p className="mt-4 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
            This device already has {noteCount} note{noteCount === 1 ? "" : "s"}. They stay exactly as they are.
          </p>
        )}

        <div className="mt-8 space-y-3">
          <Button className="h-11 w-full" onClick={onStart}>
            {noteCount > 0 ? "Continue where I left off" : "Start fresh"}
          </Button>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/settings" onClick={onStart}>
              Restore from backup
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
