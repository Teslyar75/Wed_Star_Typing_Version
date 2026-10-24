// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./serverAsr", () => ({
  serverAsrAvailable: vi.fn(async () => ({ ok: false, reason: "no model" })),
  listenOnceServer: vi.fn(),
}));
vi.mock("./asr", () => ({
  asrAvailable: vi.fn(async () => ({ ok: false, engine: "none" })),
  listenOnce: vi.fn(),
}));

import MicTransmit from "./MicTransmit";
import * as asr from "./asr";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<MicTransmit expected="hello world" />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { el, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MicTransmit — без самооценки (как десктоп: только автоматическая оценка)", () => {
  it("нет ASR → сообщение, без кнопок хорошо/средне/плохо", async () => {
    const { el, root } = await mount();
    expect(el.querySelector(".en-mic-self")).toBeNull();
    expect(el.querySelector("[data-testid=mic-no-asr]")).not.toBeNull();
    expect(el.querySelectorAll("button").length).toBe(0);
    root.unmount();
  });

  it("сервер недоступен, браузерный ASR есть → кнопка ПЕРЕДАЧА", async () => {
    vi.mocked(asr.asrAvailable).mockResolvedValueOnce({ ok: true, engine: "webspeech" });
    const { el, root } = await mount();
    expect(el.querySelector(".en-mic-self")).toBeNull();
    expect(el.querySelectorAll("button").length).toBe(1);
    root.unmount();
  });
});
