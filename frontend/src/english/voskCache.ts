/** Кэш tar.gz модели Vosk в IndexedDB — повторные запуски без сети. */

const DB = "star-typing-vosk";
const STORE = "models";
const KEY = "vosk-model-small-en-us";
const VER = 1;
const MIME = "application/gzip";

async function toArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // FileReader надёжнее jsdom-Blob (arrayBuffer часто stub).
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error("FileReader"));
    fr.readAsArrayBuffer(blob);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open"));
  });
}

/** Читаем ArrayBuffer (надёжнее Blob в IDB). */
export async function idbGetBlob(key = KEY): Promise<Blob | null> {
  try {
    const db = await openDb();
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onabort = () => reject(tx.error ?? new Error("idb abort"));
    });
    // instanceof ломается между realm'ами (jsdom / workers) — смотрим toStringTag
    const tag = Object.prototype.toString.call(result);
    if (tag === "[object ArrayBuffer]") {
      return new Blob([result as ArrayBuffer], { type: MIME });
    }
    if (tag === "[object Blob]" || result instanceof Blob) return result as Blob;
    if (tag === "[object Uint8Array]") {
      const u8 = result as Uint8Array;
      const copy = new Uint8Array(u8.byteLength);
      copy.set(u8);
      return new Blob([copy.buffer], { type: MIME });
    }
    return null;
  } catch {
    return null;
  }
}

export async function idbPutBlob(blob: Blob, key = KEY): Promise<void> {
  const buf = await toArrayBuffer(blob);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(buf, key);
    req.onerror = () => reject(req.error ?? new Error("idb put"));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("idb abort"));
  });
}

/** Скачать модель (если нет в IDB) и вернуть object URL для createModel. */
export async function resolveVoskModelUrl(remoteUrl: string): Promise<string> {
  let blob = await idbGetBlob();
  if (!blob) {
    const r = await fetch(remoteUrl);
    if (!r.ok) throw new Error(`vosk fetch ${r.status}`);
    blob = await r.blob();
    try {
      await idbPutBlob(blob);
    } catch {
      /* квота / private mode — всё равно отдаём URL */
    }
  }
  return URL.createObjectURL(blob);
}

export async function voskCachedOrRemote(remoteUrl: string): Promise<boolean> {
  if (await idbGetBlob()) return true;
  try {
    const r = await fetch(remoteUrl, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}
