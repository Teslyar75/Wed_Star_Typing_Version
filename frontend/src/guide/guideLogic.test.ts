import { describe, expect, it } from "vitest";
import { canShow, DEFAULT_STATE, fill, markShown, muteTrigger, normalize, pickLines, TYPING_QUIET_MS } from "./guideLogic";
import { cycleGuide, GUIDES, linesOf, PICKABLE } from "./guides";

const T = 1_000_000_000;
const st = { ...DEFAULT_STATE };
const idle = { now: T, lastTypeAt: 0 };

describe("гид: логика", () => {
  it("лимит частоты 10 минут, кроме rank_up/story", () => {
    const s = { ...st, last_popup: T - 5 * 60_000 };
    expect(canShow("tip", s, idle)).toBe("drop");
    expect(canShow("rank_up", s, idle)).toBe("show");
    expect(canShow("story", s, idle)).toBe("show");
    expect(canShow("tip", { ...st, last_popup: T - 11 * 60_000 }, idle)).toBe("show");
  });
  it("во время набора — в очередь, на паузе — можно", () => {
    const typing = { now: T, lastTypeAt: T - 500 };
    expect(canShow("first_launch", st, typing)).toBe("wait");
    expect(canShow("first_launch", st, { ...typing, paused: true })).toBe("show");
    expect(canShow("first_launch", st, { now: T, lastTypeAt: T - TYPING_QUIET_MS - 1 })).toBe("show");
  });
  it("first_launch один раз; Shift+Esc глушит триггер; «Без гида» молчит", () => {
    expect(canShow("first_launch", markShown(st, "first_launch", T), idle)).toBe("drop");
    expect(canShow("rank_up", muteTrigger(st, "rank_up"), idle)).toBe("drop");
    expect(canShow("rank_up", { ...st, id: "none" }, idle)).toBe("drop");
    expect(canShow("tip", { ...st, freq: "story" }, idle)).toBe("drop");
  });
  it("markShown не трогает лимит для исключений", () => {
    expect(markShown(st, "rank_up", T).last_popup).toBe(0);
    expect(markShown(st, "tip", T).last_popup).toBe(T);
  });
  it("фолбэк реплик и подстановки", () => {
    const own = { a: { old_england: ["skin"], default: ["own"] } };
    const nar = { b: { default: ["nar {pilot}"] } };
    expect(pickLines("a", "old_england", own, nar)).toEqual(["skin"]);
    expect(pickLines("a", "spaceship", own, nar)).toEqual(["own"]);
    expect(pickLines("b", "spaceship", own, nar)).toEqual(["nar {pilot}"]);
    expect(fill("Привет, {pilot}! {x}", { pilot: "Ас" })).toBe("Привет, Ас! {x}");
  });
  it("normalize терпит мусор", () => {
    expect(normalize(null)).toEqual(DEFAULT_STATE);
    expect(normalize({ id: "none", freq: "bad", seen: [1, "x"] })).toMatchObject({ id: "none", freq: "normal", seen: ["x"] });
  });
  it("ОРИОН: голос Dmitry, 4 реплики первого запуска; выбор — ОРИОН ⇄ Без гида", () => {
    expect(GUIDES[0]).toMatchObject({ id: "ship_ai", name: "ОРИОН", voice: "ru-RU-DmitryNeural" });
    expect(linesOf("ship_ai")!.first_launch!.default).toHaveLength(4);
    expect(PICKABLE).toEqual(["ship_ai", "none"]);
    expect(cycleGuide("ship_ai", 1)).toBe("none");
    expect(cycleGuide("none", 1)).toBe("ship_ai");
    expect(GUIDES.filter((g) => g.soon).map((g) => g.name)).toEqual(["Мистер Хоббс", "Вера Павловна", "Кадет Тим"]);
  });
});
