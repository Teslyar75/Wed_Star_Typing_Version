import { beforeEach, describe, expect, it, vi } from "vitest";
import { idbGetBlob, idbPutBlob, resolveVoskModelUrl } from "./voskCache";

describe("voskCache", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("star-typing-vosk");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it("stores and reads blob", async () => {
    const blob = new Blob(["fake-tar"], { type: "application/gzip" });
    await idbPutBlob(blob);
    const got = await idbGetBlob();
    expect(got).not.toBeNull();
    expect(got!.size).toBe(blob.size);
  });

  it("resolveVoskModelUrl caches after fetch", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([payload], { type: "application/gzip" }),
      })),
    );
    const url1 = await resolveVoskModelUrl("/models/fake.tar.gz");
    expect(url1.startsWith("blob:")).toBe(true);
    expect(await idbGetBlob()).not.toBeNull();

    (fetch as ReturnType<typeof vi.fn>).mockClear();
    const url2 = await resolveVoskModelUrl("/models/fake.tar.gz");
    expect(url2.startsWith("blob:")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
