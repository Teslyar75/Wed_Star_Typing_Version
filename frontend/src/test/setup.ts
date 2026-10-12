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
