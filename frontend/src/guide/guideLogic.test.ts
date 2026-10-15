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
    expect(markShown(st, "first_launch", T)).toMatchObject({ last_popup: T, seen: ["first_launch", "first_zone:bridge"] });
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

import { dialogBottom } from "./placement";
describe("гид: окно не закрывает «Пауза / Заново»", () => {
  it("ряд внизу — окно над ним; ряд высоко — окно внизу", () => {
    expect(dialogBottom(800, 90, [{ top: 700, bottom: 730 }])).toBe(108);
    expect(dialogBottom(800, 90, [{ top: 660, bottom: 690 }])).toBe(14);
    expect(dialogBottom(800, 90, [{ top: 400, bottom: 430 }])).toBe(14);
    expect(dialogBottom(800, 90, [])).toBe(14);
  });
});

import { addressOf as addr } from "./guideLogic";
import shipRu from "../../../packages/guides/lines/ship_ai.ru.json";
describe("ОРИОН: характер", () => {
  it("обращение сэр/мэм/пилот", () => {
    expect(addr()).toBe("сэр");
    expect(addr("f")).toBe("мэм");
    expect(addr("m")).toBe("сэр");
    expect(addr("x")).toBe("пилот");
  });
  it("никаких чужих имён и вселенных в репликах", () => {
    const all = JSON.stringify(shipRu).toLowerCase();
    for (const w of ["jarvis", "джарвис", "marvel", "марвел", "тони", "старк", "stark"]) expect(all).not.toContain(w);
  });
});

import { ZONE_TRIGGERS, zoneTrigger } from "./zoneTriggers";
describe("гид G2: первый вход в зоны", () => {
  it("каждая зона и подстраница мостика — 2–3 реплики с {zone}, обращение «сэр»", () => {
    const own = linesOf("ship_ai")!;
    for (const tr of ZONE_TRIGGERS) {
      const l = own[tr]?.default || [];
      expect(l.length, tr).toBeGreaterThanOrEqual(2);
      expect(l.length, tr).toBeLessThanOrEqual(3);
      expect(l.join(" "), tr).toContain("{zone}");
      expect(l.join(" "), tr).toContain("{sir}");
    }
    expect(ZONE_TRIGGERS).toHaveLength(10);
  });
  it("один раз на зону; лимит 10 минут; мостик уже показан первым запуском", () => {
    const s = markShown(st, "first_launch", T);
    expect(canShow("first_zone:bridge", s, { now: T + 20 * 60_000, lastTypeAt: 0 })).toBe("drop");
    expect(canShow("first_zone:radio", s, { now: T + 60_000, lastTypeAt: 0 })).toBe("drop");
    const later = { now: T + 11 * 60_000, lastTypeAt: 0 };
    expect(canShow("first_zone:radio", s, later)).toBe("show");
    const s2 = markShown(s, "first_zone:radio", later.now);
    expect(canShow("first_zone:radio", s2, { now: T + 60 * 60_000, lastTypeAt: 0 })).toBe("drop");
  });
  it("вкладка → триггер; имя зоны берётся из словаря скина", () => {
    expect(zoneTrigger("cargo")).toBe("first_zone:cargo");
    expect(zoneTrigger("nope")).toBeNull();
  });
});
