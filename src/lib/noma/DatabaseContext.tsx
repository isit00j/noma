import { createContext, useContext, useEffect, useState, type ReactNode, useRef } from "react";
import Dexie from "dexie";
import { toast } from "sonner";
import { NomaDatabase, copyDatabase } from "./db";
import { useAuth } from "./auth";
import { rehydrateReminders } from "./notifications";

export interface DatabaseContextValue {
  db: NomaDatabase | null;
  loading: boolean;
  migrateGuestData: () => Promise<void>;
  skipGuestData: () => Promise<void>;
  guestMigrationPending: boolean;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function useDatabase(): DatabaseContextValue {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used inside DatabaseProvider");
  }
  return context;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [activeDb, setActiveDb] = useState<NomaDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestMigrationPending, setGuestMigrationPending] = useState(false);
  const [pendingGuestDb, setPendingGuestDb] = useState<NomaDatabase | null>(null);

  const initGeneration = useRef(0);

  // Clean up activeDb when unmounted
  useEffect(() => {
    return () => {
      if (activeDb) activeDb.close();
    };
  }, [activeDb]);

  useEffect(() => {
    return () => {
      if (pendingGuestDb) pendingGuestDb.close();
    };
  }, [pendingGuestDb]);

  useEffect(() => {
    if (auth.loading) return;

    const currentGen = ++initGeneration.current;

    // Immediately clear stale active DB when auth changes / initialization starts
    setActiveDb((prevDb) => {
      if (prevDb) prevDb.close();
      return null;
    });
    setLoading(true);
    setGuestMigrationPending(false);

    let localNewDb: NomaDatabase | null = null;
    let localLegacyDb: NomaDatabase | null = null;
    let localGuestDb: NomaDatabase | null = null;

    async function initializeDatabase() {
      const dbName = auth.user ? `noma_${auth.user.uid}` : "noma_guest";
      localNewDb = new NomaDatabase(dbName);

      const legacyDbName = "noma";
      let legacyExists = false;
      try {
        legacyExists = await Dexie.exists(legacyDbName);
      } catch (e) {
        console.error("Dexie.exists failed", e);
      }

      if (initGeneration.current !== currentGen) return;

      if (legacyExists && dbName !== legacyDbName) {
        localLegacyDb = new NomaDatabase(legacyDbName);
        try {
          await localLegacyDb.open();
          if (initGeneration.current !== currentGen) return;
          const count = await localLegacyDb.notes.count();
          if (initGeneration.current !== currentGen) return;
          if (count > 0) {
            await copyDatabase(localLegacyDb, localNewDb);
          }
          if (initGeneration.current !== currentGen) return;
          localLegacyDb.close();
          localLegacyDb = null;
          await Dexie.delete(legacyDbName);
        } catch (err) {
          console.error("Legacy migration failed", err);
        }
      }

      if (initGeneration.current !== currentGen) return;

      if (auth.user) {
        let guestExists = false;
        try {
          guestExists = await Dexie.exists("noma_guest");
        } catch (e) {
          console.error("Dexie.exists failed", e);
        }

        if (initGeneration.current !== currentGen) return;

        if (guestExists) {
          localGuestDb = new NomaDatabase("noma_guest");
          try {
            await localGuestDb.open();
            if (initGeneration.current !== currentGen) return;
            const guestCount = await localGuestDb.notes.count();
            if (initGeneration.current !== currentGen) return;
            if (guestCount > 0) {
              if (initGeneration.current === currentGen) {
                setPendingGuestDb(localGuestDb);
                setActiveDb(localNewDb);
                setGuestMigrationPending(true);
                setLoading(false);

                // Prevent cleanup from closing these since they are now in state
                localGuestDb = null;
                localNewDb = null;
              }
              return;
            } else {
              localGuestDb.close();
              localGuestDb = null;
            }
          } catch (err) {
            console.error("Guest migration check failed", err);
          }
        }
      }

      if (initGeneration.current === currentGen) {
        setActiveDb(localNewDb);
        setLoading(false);
        const dbToRehydrate = localNewDb;
        localNewDb = null;
        setPendingGuestDb(null);
        if (dbToRehydrate) {
          void rehydrateReminders(dbToRehydrate);
        }
      }
    }

    void initializeDatabase();

    return () => {
      if (localNewDb) localNewDb.close();
      if (localLegacyDb) localLegacyDb.close();
      if (localGuestDb) localGuestDb.close();
    };
  }, [auth.user?.uid, auth.loading]);

  const migrateGuestData = async () => {
    if (!activeDb || !pendingGuestDb) return;
    setLoading(true);
    try {
      await copyDatabase(pendingGuestDb, activeDb);
      pendingGuestDb.close();
      await Dexie.delete("noma_guest");
      setGuestMigrationPending(false);
      setPendingGuestDb(null);
      toast.success("Local notes moved to this account.");
    } catch (err) {
      console.error("Failed to migrate guest data", err);
      toast.error("Failed to move local notes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const skipGuestData = async () => {
    if (pendingGuestDb) {
      pendingGuestDb.close();
      setPendingGuestDb(null);
      setGuestMigrationPending(false);
    }
  };

  return (
    <DatabaseContext.Provider
      value={{ db: activeDb, loading, migrateGuestData, skipGuestData, guestMigrationPending }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
