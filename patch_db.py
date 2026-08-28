import re

with open("src/lib/noma/DatabaseContext.tsx", "r") as f:
    content = f.read()

new_content = """import { createContext, useContext, useEffect, useState, type ReactNode, useRef } from "react";
import Dexie from "dexie";
import { NomaDatabase, copyDatabase } from "./db";
import { useAuth } from "./auth";

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

  // Close databases when they are replaced or component unmounts
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

    let isMounted = true;
    let localNewDb: NomaDatabase | null = null;
    let localLegacyDb: NomaDatabase | null = null;
    let localGuestDb: NomaDatabase | null = null;

    async function initializeDatabase() {
      setLoading(true);
      setGuestMigrationPending(false);

      const dbName = auth.user ? `noma_${auth.user.uid}` : "noma_guest";
      localNewDb = new NomaDatabase(dbName);

      const legacyDbName = "noma";
      let legacyExists = false;
      try {
        legacyExists = await Dexie.exists(legacyDbName);
      } catch (e) {
        console.error("Dexie.exists failed", e);
      }

      if (!isMounted) return;

      if (legacyExists && dbName !== legacyDbName) {
        localLegacyDb = new NomaDatabase(legacyDbName);
        try {
          await localLegacyDb.open();
          if (!isMounted) return;
          const count = await localLegacyDb.notes.count();
          if (!isMounted) return;
          if (count > 0) {
            await copyDatabase(localLegacyDb, localNewDb);
          }
          if (!isMounted) return;
          localLegacyDb.close();
          localLegacyDb = null;
          await Dexie.delete(legacyDbName);
        } catch (err) {
          console.error("Legacy migration failed", err);
        }
      }

      if (!isMounted) return;

      if (auth.user) {
        let guestExists = false;
        try {
          guestExists = await Dexie.exists("noma_guest");
        } catch (e) {}

        if (!isMounted) return;

        if (guestExists) {
          localGuestDb = new NomaDatabase("noma_guest");
          try {
            await localGuestDb.open();
            if (!isMounted) return;
            const guestCount = await localGuestDb.notes.count();
            if (!isMounted) return;
            if (guestCount > 0) {
              setPendingGuestDb(localGuestDb);
              setActiveDb(localNewDb);
              setGuestMigrationPending(true);
              setLoading(false);

              // Prevent cleanup from closing these since they are now in state
              localGuestDb = null;
              localNewDb = null;
              return;
            } else {
              localGuestDb.close();
              localGuestDb = null;
            }
          } catch(err) {
             console.error("Guest migration check failed", err);
          }
        }
      }

      if (isMounted) {
        setActiveDb(localNewDb);
        setLoading(false);
        // Prevent cleanup from closing it since it's now in state
        localNewDb = null;
        setPendingGuestDb(null); // Clear any old pending guest db
      }
    }

    initializeDatabase();

    return () => {
      isMounted = false;
      if (localNewDb) localNewDb.close();
      if (localLegacyDb) localLegacyDb.close();
      if (localGuestDb) localGuestDb.close();
    };
  }, [auth.user, auth.loading]);

  const migrateGuestData = async () => {
    if (!activeDb || !pendingGuestDb) return;
    setLoading(true);
    try {
      await copyDatabase(pendingGuestDb, activeDb);
      pendingGuestDb.close();
      await Dexie.delete("noma_guest");
      setGuestMigrationPending(false);
      setPendingGuestDb(null);
    } catch (err) {
      console.error("Failed to migrate guest data", err);
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
"""

with open("src/lib/noma/DatabaseContext.tsx", "w") as f:
    f.write(new_content)
