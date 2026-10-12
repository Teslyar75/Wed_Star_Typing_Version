import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storeMem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storeMem.set(k, String(v));
  },
  removeItem: (k: string) => {
    storeMem.delete(k);
  },
  clear: () => storeMem.clear(),
  key: () => null,
  length: 0,
});

import { useRadio } from "./radioStore";
import type { Station } from "./api";

const s1: Station = { name: "A", url_resolved: "https://a.example/stream", stationuuid: "1" };
const s2: Station = { name: "B", url_resolved: "https://b.example/stream", stationuuid: "2" };

describe("radio favs navigation", () => {
  beforeEach(() => {
    storeMem.clear();
    useRadio.setState({
      favs: [s1, s2],
      station: s1,
      playing: false,
      audio: null,
      duckOnType: false,
      autoLast: false,
    });
  });

  it("isFav and toggleFav", () => {
    expect(useRadio.getState().isFav(s1)).toBe(true);
    useRadio.getState().toggleFav(s1);
    expect(useRadio.getState().isFav(s1)).toBe(false);
  });

  it("stores duck-on-type preference", () => {
    useRadio.getState().setDuckOnType(true);
    expect(useRadio.getState().duckOnType).toBe(true);
    expect(storeMem.get("st_radio_duck_type")).toBe("1");
  });
});
