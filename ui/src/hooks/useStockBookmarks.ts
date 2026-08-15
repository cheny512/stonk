import React from "react";

import { createAnonymousProfile, fetchSavedStocks, saveSavedStocks } from "../api/client";

const STORAGE_KEY = "stonkos.stock-bookmarks.v1";
const SESSION_STORAGE_KEY = "stonkos.device-profile.v1";
const SYNC_STORAGE_KEY = "stonkos.stock-bookmarks-sync.v1";
const MAX_BOOKMARKS = 25;

type SyncStatus = "local" | "syncing" | "synced";

interface DeviceSession {
  accessToken: string;
  userId: string;
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function normalizeBookmarks(values: unknown[]): string[] {
  return [...new Set(values.map((value) => normalizeTicker(String(value))).filter(Boolean))].slice(0, MAX_BOOKMARKS);
}

function parseBookmarks(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return normalizeBookmarks(parsed);
  } catch {
    return [];
  }
}

function loadBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  return parseBookmarks(window.localStorage.getItem(STORAGE_KEY));
}

function loadSession(): DeviceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    if (!parsed?.accessToken || !parsed?.userId) return null;
    return { accessToken: String(parsed.accessToken), userId: String(parsed.userId) };
  } catch {
    return null;
  }
}

function saveSession(session: DeviceSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Local bookmarks remain available even when browser storage is restricted.
  }
}

function hasPendingSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return JSON.parse(window.localStorage.getItem(SYNC_STORAGE_KEY) || "{}").pending === true;
  } catch {
    return false;
  }
}

function setPendingSync(pending: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ pending }));
  } catch {
    // The UI still works in memory when storage is restricted.
  }
}

function storeBookmarks(bookmarks: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // The in-memory list remains usable for the current session.
  }
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 401;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useStockBookmarks() {
  const initialBookmarks = React.useMemo(loadBookmarks, []);
  const [bookmarks, setBookmarks] = React.useState<string[]>(initialBookmarks);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>("local");
  const bookmarksRef = React.useRef(initialBookmarks);
  const sessionRef = React.useRef<DeviceSession | null>(loadSession());
  const sessionPromiseRef = React.useRef<Promise<DeviceSession> | null>(null);
  const syncTimerRef = React.useRef<number | null>(null);
  const mutationRevisionRef = React.useRef(0);
  const syncRevisionRef = React.useRef(0);

  const ensureSession = React.useCallback(async (): Promise<DeviceSession> => {
    if (sessionRef.current) return sessionRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    sessionPromiseRef.current = createAnonymousProfile(browserTimezone())
      .then((payload: any) => {
        const session = {
          accessToken: String(payload.accessToken),
          userId: String(payload.user.id),
        };
        sessionRef.current = session;
        saveSession(session);
        return session;
      })
      .finally(() => {
        sessionPromiseRef.current = null;
      });
    return sessionPromiseRef.current;
  }, []);

  const resetSession = React.useCallback(() => {
    sessionRef.current = null;
    saveSession(null);
  }, []);

  const pushBookmarks = React.useCallback(async (nextBookmarks: string[], retryAuthentication = true) => {
    const syncRevision = ++syncRevisionRef.current;
    setSyncStatus("syncing");
    try {
      const session = await ensureSession();
      await saveSavedStocks(session.accessToken, nextBookmarks);
      if (syncRevision === syncRevisionRef.current) {
        setPendingSync(false);
        setSyncStatus("synced");
      }
    } catch (error) {
      if (retryAuthentication && isUnauthorized(error)) {
        resetSession();
        await pushBookmarks(nextBookmarks, false);
        return;
      }
      if (syncRevision === syncRevisionRef.current) setSyncStatus("local");
    }
  }, [ensureSession, resetSession]);

  const schedulePush = React.useCallback((nextBookmarks: string[]) => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void pushBookmarks(nextBookmarks);
    }, 250);
  }, [pushBookmarks]);

  const commitBookmarks = React.useCallback((update: (current: string[]) => string[]) => {
    const next = normalizeBookmarks(update(bookmarksRef.current));
    bookmarksRef.current = next;
    mutationRevisionRef.current += 1;
    setBookmarks(next);
    storeBookmarks(next);
    setPendingSync(true);
    schedulePush(next);
  }, [schedulePush]);

  React.useEffect(() => {
    let cancelled = false;
    const startingRevision = mutationRevisionRef.current;
    const hadSession = sessionRef.current !== null;

    const bootstrapSync = async () => {
      setSyncStatus("syncing");
      try {
        const session = await ensureSession();
        if (cancelled) return;

        if (!hadSession || hasPendingSync() || mutationRevisionRef.current !== startingRevision) {
          await saveSavedStocks(session.accessToken, bookmarksRef.current);
        } else {
          const payload = await fetchSavedStocks(session.accessToken);
          if (cancelled) return;
          if (mutationRevisionRef.current !== startingRevision) {
            await saveSavedStocks(session.accessToken, bookmarksRef.current);
          } else {
            const remoteBookmarks = normalizeBookmarks(payload.tickers || []);
            bookmarksRef.current = remoteBookmarks;
            setBookmarks(remoteBookmarks);
            storeBookmarks(remoteBookmarks);
          }
        }
        if (!cancelled) {
          setPendingSync(false);
          setSyncStatus("synced");
        }
      } catch (error) {
        if (isUnauthorized(error)) {
          resetSession();
          if (!cancelled) void pushBookmarks(bookmarksRef.current, false);
          return;
        }
        if (!cancelled) setSyncStatus("local");
      }
    };

    void bootstrapSync();
    return () => {
      cancelled = true;
    };
  }, [ensureSession, pushBookmarks, resetSession]);

  React.useEffect(() => {
    const syncBookmarks = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === STORAGE_KEY) {
        const next = parseBookmarks(event.newValue);
        bookmarksRef.current = next;
        mutationRevisionRef.current += 1;
        setBookmarks(next);
      }
      if (event.key === SESSION_STORAGE_KEY) sessionRef.current = loadSession();
    };

    window.addEventListener("storage", syncBookmarks);
    return () => {
      window.removeEventListener("storage", syncBookmarks);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const addBookmark = React.useCallback((ticker: string) => {
    const symbol = normalizeTicker(ticker);
    if (!symbol) return;
    commitBookmarks((current) => [symbol, ...current.filter((item) => item !== symbol)]);
  }, [commitBookmarks]);

  const removeBookmark = React.useCallback((ticker: string) => {
    const symbol = normalizeTicker(ticker);
    commitBookmarks((current) => current.filter((item) => item !== symbol));
  }, [commitBookmarks]);

  const toggleBookmark = React.useCallback((ticker: string) => {
    const symbol = normalizeTicker(ticker);
    if (!symbol) return;
    commitBookmarks((current) => current.includes(symbol)
      ? current.filter((item) => item !== symbol)
      : [symbol, ...current]);
  }, [commitBookmarks]);

  const moveBookmark = React.useCallback((ticker: string, direction: -1 | 1) => {
    const symbol = normalizeTicker(ticker);
    commitBookmarks((current) => {
      const fromIndex = current.indexOf(symbol);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  }, [commitBookmarks]);

  const reorderBookmark = React.useCallback((ticker: string, targetTicker: string) => {
    const symbol = normalizeTicker(ticker);
    const target = normalizeTicker(targetTicker);
    if (!symbol || !target || symbol === target) return;
    commitBookmarks((current) => {
      const fromIndex = current.indexOf(symbol);
      const targetIndex = current.indexOf(target);
      if (fromIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [movedBookmark] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, movedBookmark);
      return next;
    });
  }, [commitBookmarks]);

  return { bookmarks, syncStatus, addBookmark, removeBookmark, toggleBookmark, moveBookmark, reorderBookmark };
}
