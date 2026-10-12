import { describe, expect, it, vi } from "vitest";
import { searchStations } from "./api";

describe("radio api", () => {
  it("filters stations without url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("servers")) {
          return { ok: true, json: async () => [{ name: "de1.api.radio-browser.info" }] };
        }
        return {
          ok: true,
          json: async () => [
            { name: "A", url_resolved: "https://x/a" },
            { name: "B", url_resolved: "" },
          ],
        };
      }),
    );
    const list = await searchStations({ name: "a" });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("A");
    vi.unstubAllGlobals();
  });
});
