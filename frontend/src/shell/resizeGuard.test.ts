import { afterEach, describe, expect, it, vi } from "vitest";
import { observeBox } from "./resizeGuard";

class FakeRO {
  static last: FakeRO | null = null;
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    FakeRO.last = this;
  }
  observe() {}
  disconnect() {
    FakeRO.last = null;
  }
  unobserve() {}
  fire() {
    this.cb([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

describe("observeBox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRO.last = null;
  });

  it("глушит повтор того же размера и disconnect на cleanup", () => {
    const raf: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      raf.push(cb);
      return raf.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      raf.length = 0;
    });
    vi.stubGlobal("ResizeObserver", FakeRO);

    const el = document.createElement("div");
    let w = 200;
    let h = 100;
    el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, bottom: h, right: w, x: 0, y: 0, toJSON() {} });

    const onSize = vi.fn();
    const stop = observeBox(el, onSize);
    expect(onSize).toHaveBeenCalledTimes(1);
    expect(onSize.mock.calls[0][0]).toEqual({ w: 200, h: 100 });

    FakeRO.last?.fire();
    expect(onSize).toHaveBeenCalledTimes(1);

    raf.shift()?.(0);
    FakeRO.last?.fire();
    expect(onSize).toHaveBeenCalledTimes(1);

    w = 240;
    h = 120;
    FakeRO.last?.fire();
    expect(onSize).toHaveBeenCalledTimes(2);
    expect(onSize.mock.calls[1][0]).toEqual({ w: 240, h: 120 });

    stop();
    expect(FakeRO.last).toBeNull();
  });
});
