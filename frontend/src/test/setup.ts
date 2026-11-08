import "fake-indexeddb/auto";

if (typeof URL.createObjectURL !== "function") {
  const urls = new Map<string, Blob>();
  let n = 0;
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    const id = `blob:test/${++n}`;
    if (blob instanceof Blob) urls.set(id, blob);
    return id;
  };
  URL.revokeObjectURL = (id: string) => {
    urls.delete(id);
  };
}

// Node >= 25 ships an experimental global `localStorage` that is undefined
// unless --localstorage-file is given; it shadows jsdom's Storage for bare
// `localStorage` references. Re-point the globals at a working Storage.
for (const name of ["localStorage", "sessionStorage"] as const) {
  let ok = false;
  try {
    ok = typeof (globalThis as Record<string, unknown>)[name] === "object" &&
      typeof (globalThis as unknown as Record<string, Storage>)[name].setItem === "function";
  } catch {
    ok = false;
  }
  if (!ok) {
    let store: Storage | undefined;
    try {
      store = (window as unknown as Record<string, Storage>)[name];
      if (!store || typeof store.setItem !== "function") store = undefined;
    } catch {
      store = undefined;
    }
    if (!store) {
      const m = new Map<string, string>();
      store = {
        get length() { return m.size; },
        clear: () => m.clear(),
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        key: (i: number) => Array.from(m.keys())[i] ?? null,
        removeItem: (k: string) => { m.delete(k); },
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
      } as Storage;
    }
    Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
  }
}