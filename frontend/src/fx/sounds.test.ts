import { describe, expect, it, vi } from "vitest";
import { playClick, playError, playFinish, setSoundsMuted, soundsMuted } from "./sounds";

describe("sounds", () => {
  it("mute flag", () => {
    setSoundsMuted(true);
    expect(soundsMuted()).toBe(true);
    setSoundsMuted(false);
    expect(soundsMuted()).toBe(false);
  });

  it("play helpers do not throw without AudioContext", () => {
    const orig = window.AudioContext;
    // @ts-expect-error test stub
    window.AudioContext = undefined;
    expect(() => playClick()).not.toThrow();
    expect(() => playError()).not.toThrow();
    expect(() => playFinish()).not.toThrow();
    window.AudioContext = orig;
  });

  it("uses oscillator when context available", () => {
    const stop = vi.fn();
    const start = vi.fn();
    const connect = vi.fn();
    const o = { type: "square", frequency: { value: 0 }, connect, start, stop };
    const g = {
      gain: { value: 0, exponentialRampToValueAtTime: vi.fn() },
      connect,
    };
    class FakeCtx {
      currentTime = 0;
      createOscillator = () => o;
      createGain = () => g;
      destination = {};
      resume = vi.fn(async () => undefined);
    }
    // @ts-expect-error stub
    window.AudioContext = FakeCtx;
    setSoundsMuted(false);
    playClick();
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
