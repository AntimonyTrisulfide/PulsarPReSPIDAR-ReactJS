const DB_NAME = "pulsar-prespidar-cache";
const STORE_NAME = "session";
const DATASET_KEY = "latest-dataset";

export type PersistedPlotSettings = {
  url: string;
  username: string;
  obsMetadata: unknown;
  datasetOnPulse: { start: number; end: number };
  startPhaseAitoff: number;
  endPhaseAitoff: number;
  startPhasePolHist: number;
  endPhasePolHist: number;
  startPhasePolStacks: number;
  endPhasePolStacks: number;
  startPhasePolarParams: number;
  endPhasePolarParams: number;
  onPulseStartPolarParams: number;
  onPulseEndPolarParams: number;
  startPhaseProfiles: number;
  endPhaseProfiles: number;
  startPhaseHeatmaps: number;
  endPhaseHeatmaps: number;
  aitoffPhase: number;
  leftPhaseHist: number;
  midPhaseHist: number;
  rightPhaseHist: number;
};

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

async function withStore<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = task(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export async function persistDatasetBlob(blob: Blob) {
  await withStore("readwrite", store => store.put(blob, DATASET_KEY));
}

export async function readPersistedDatasetBlob() {
  const result = await withStore<Blob | undefined>("readonly", store => store.get(DATASET_KEY));
  return result ?? null;
}

export function persistPlotSettings(settings: PersistedPlotSettings) {
  localStorage.setItem("pulsar-prespidar-settings", JSON.stringify(settings));
}

export function readPersistedPlotSettings(): PersistedPlotSettings | null {
  const raw = localStorage.getItem("pulsar-prespidar-settings");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedPlotSettings;
  } catch {
    return null;
  }
}
