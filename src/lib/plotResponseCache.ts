const DB_NAME = "pulsar-prespidar-cache";
const STORE_NAME = "session";
const PLOT_RESPONSE_PREFIX = "plot-response:";
const PLOT_RESPONSE_INDEX_KEY = "plot-response-index";
const PLOT_RESPONSE_CACHE_VERSION = 3;
const MAX_PERSISTED_PLOT_RESPONSES = 48;

type PlotResponseCacheRecord = {
  version: number;
  createdAt: number;
  value: unknown;
};

type PlotResponseCacheHit<T> = {
  hit: true;
  value: T;
};

type PlotResponseCacheMiss = {
  hit: false;
};

const memoryCache = new Map<string, unknown>();

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoreValue<T>(key: string): Promise<T | undefined> {
  if (!canUseIndexedDb()) return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

async function persistStoreValue(key: string, value: unknown) {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const cacheKey = `${PLOT_RESPONSE_PREFIX}${key}`;
    const indexRequest = store.get(PLOT_RESPONSE_INDEX_KEY);

    store.put(
      {
        version: PLOT_RESPONSE_CACHE_VERSION,
        createdAt: Date.now(),
        value,
      } satisfies PlotResponseCacheRecord,
      cacheKey,
    );

    indexRequest.onsuccess = () => {
      const currentIndex = Array.isArray(indexRequest.result) ? indexRequest.result as string[] : [];
      const nextIndex = [key, ...currentIndex.filter(item => item !== key)];
      const keptIndex = nextIndex.slice(0, MAX_PERSISTED_PLOT_RESPONSES);
      const droppedIndex = nextIndex.slice(MAX_PERSISTED_PLOT_RESPONSES);
      store.put(keptIndex, PLOT_RESPONSE_INDEX_KEY);
      droppedIndex.forEach(item => {
        memoryCache.delete(item);
        store.delete(`${PLOT_RESPONSE_PREFIX}${item}`);
      });
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function readPlotResponseCache<T>(key: string): Promise<PlotResponseCacheHit<T> | PlotResponseCacheMiss> {
  if (memoryCache.has(key)) {
    return { hit: true, value: memoryCache.get(key) as T };
  }

  try {
    const cached = await readStoreValue<PlotResponseCacheRecord>(`${PLOT_RESPONSE_PREFIX}${key}`);
    if (cached?.version !== PLOT_RESPONSE_CACHE_VERSION) return { hit: false };
    memoryCache.set(key, cached.value);
    return { hit: true, value: cached.value as T };
  } catch (error) {
    console.warn("Plot response cache read failed; falling back to backend.", error);
    return { hit: false };
  }
}

export function writePlotResponseCache(key: string, value: unknown) {
  memoryCache.set(key, value);
  void persistStoreValue(key, value).catch(error => {
    console.warn("Plot response cache write failed; continuing without persisted plot cache.", error);
  });
}
