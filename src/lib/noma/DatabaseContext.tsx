import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    if (auth.loading) return;

    let isMounted = true;

    async function initializeDatabase() {
      setLoading(true);
      setGuestMigrationPending(false);
      setPendingGuestDb(null);

      const dbName = auth.user ? `noma_${auth.user.uid}` : "noma_guest";
      const newDb = new NomaDatabase(dbName);

      const legacyDbName = "noma";
      const legacyExists = await Dexie.exists(legacyDbName);

      if (legacyExists && dbName !== legacyDbName) {
        const legacyDb = new NomaDatabase(legacyDbName);
        try {
          await legacyDb.open();
          const count = await legacyDb.notes.count();
          if (count > 0) {
            await copyDatabase(legacyDb, newDb);
          }
          legacyDb.close();
          await Dexie.delete(legacyDbName);
        } catch (err) {
          console.error("Legacy migration failed", err);
        }
      }

      if (auth.user) {
        const guestExists = await Dexie.exists("noma_guest");
        if (guestExists) {
          const guestDb = new NomaDatabase("noma_guest");
          await guestDb.open();
          const guestCount = await guestDb.notes.count();
          if (guestCount > 0) {
            if (isMounted) {
              setPendingGuestDb(guestDb);
              setActiveDb(newDb);
              setGuestMigrationPending(true);
              setLoading(false);
              return;
            }
          } else {
            guestDb.close();
          }
        }
      }

      if (isMounted) {
        setActiveDb(newDb);
        setLoading(false);
      }
    }

    initializeDatabase();

    return () => {
      isMounted = false;
      if (activeDb) {
        activeDb.close();
      }
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
