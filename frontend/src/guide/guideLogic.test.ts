import { describe, expect, it } from "vitest";
import { canShow, DEFAULT_STATE, fill, jokeCount, markShown, muteTrigger, normalize, pickJokeKey, pickLines, TYPING_QUIET_MS } from "./guideLogic";
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
  it("шутки: выкл / story — drop; joke_offer кулдаун 10 мин, вне общего лимита", () => {
    expect(canShow("joke_offer", { ...st, jokes: false }, idle)).toBe("drop");
    expect(canShow("joke_offer", { ...st, freq: "story" }, idle)).toBe("drop");
    expect(canShow("joke_offer", { ...st, last_by: { joke_offer: T - 1000 } }, idle)).toBe("drop");
    expect(canShow("joke_offer", { ...st, last_by: { joke_offer: T - 9 * 60_000 }, last_popup: T - 1000 }, idle)).toBe("drop");
    expect(canShow("joke_offer", { ...st, last_by: { joke_offer: T - 10 * 60_000 }, last_popup: T - 1000 }, idle)).toBe("show");
    /* недавнее другое окно не блокирует — Орион вклинивается сам */
    expect(canShow("joke_offer", { ...st, last_popup: T - 1000 }, idle)).toBe("show");
  });
  it("ОРИОН: голос Dmitry, 4 реплики первого запуска; выбор — ОРИОН ⇄ Без гида", () => {
    expect(GUIDES[0]).toMatchObject({ id: "ship_ai", name: "ОРИОН", voice: "ru-RU-DmitryNeural" });
    expect(linesOf("ship_ai")!.first_launch!.default).toHaveLength(4);
    expect(PICKABLE).toEqual(["ship_ai", "none"]);
    expect(cycleGuide("ship_ai", 1)).toBe("none");
    expect(cycleGuide("none", 1)).toBe("ship_ai");
    expect(GUIDES.filter((g) => g.soon).map((g) => g.name)).toEqual(["Мистер Хоббс", "Вера Павловна", "Кадет Тим"]);
  });
  it("ОРИОН: пул анекдотов joke:0… и скучающие офферы", () => {
    const own = linesOf("ship_ai")!;
    expect(jokeCount(own)).toBeGreaterThanOrEqual(5);
    expect(own.joke_offer!.default!.length).toBeGreaterThanOrEqual(2);
    expect(own.joke_offer!.default![0]).toMatch(/Enter/);
    expect(own.joke_offer_radio!.default!.length).toBeGreaterThanOrEqual(1);
    expect(own.joke_offer_radio!.default![0]).toMatch(/радио|эфир|волн/i);
    expect(pickJokeKey(own, () => 0)).toBe("joke:0");
    expect(pickLines("joke:1", "spaceship", own).length).toBeGreaterThanOrEqual(1);
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

import { forgetFirstLaunch, resetHints } from "./guideLogic";
describe("гид G3: настройки", () => {
  it("сброс подсказок оставляет знакомство, снимает Shift+Esc и лимит", () => {
    const s = { ...st, seen: ["first_launch", "first_zone:radio"], muted_triggers: ["record"], last_popup: T };
    expect(resetHints(s)).toMatchObject({ seen: ["first_launch"], muted_triggers: [], last_popup: 0 });
    expect(forgetFirstLaunch(s).seen).toEqual(["first_zone:radio"]);
  });
  it("громкость 0…4, по умолчанию 3", () => {
    expect(normalize({}).volume).toBe(3);
    expect(normalize({ volume: 9 }).volume).toBe(3);
    expect(normalize({ volume: 1 }).volume).toBe(1);
  });
});

import { breakDays, checkRecord, daysWord, isRankUp } from "./guideLogic";
import { onSession } from "./GuideEvents";
import { useGuide } from "./guideStore";
describe("гид G3: события", () => {
  it("рекорд: первая сессия — база; скорость при точности ≥90; точность ≥95; короткие не в счёт", () => {
    const b0 = { cpm: 0, acc: 0 };
    const r0 = checkRecord(b0, { cpm: 150, acc: 96, chars: 200 });
    expect(r0.kind).toBeNull();
    expect(r0.bests).toEqual({ cpm: 150, acc: 96 });
    expect(checkRecord(r0.bests, { cpm: 170, acc: 92, chars: 200 })).toMatchObject({ kind: "cpm", prev: 150 });
    expect(checkRecord(r0.bests, { cpm: 170, acc: 85, chars: 200 }).kind).toBeNull();
    expect(checkRecord(r0.bests, { cpm: 120, acc: 99, chars: 200 })).toMatchObject({ kind: "acc", prev: 96 });
    expect(checkRecord(r0.bests, { cpm: 300, acc: 100, chars: 20 }).kind).toBeNull();
  });
  it("кулдауны: рекорд раз в сутки, серия ошибок раз в 15 мин и не на «Редко»; звание — вне лимита", () => {
    const s = markShown({ ...st, last_popup: 0 }, "record", T);
    expect(s.seen).toEqual([]);
    expect(canShow("record", { ...s, last_popup: 0 }, { now: T + 3600_000, lastTypeAt: 0 })).toBe("drop");
    expect(canShow("record", { ...s, last_popup: 0 }, { now: T + 25 * 3600_000, lastTypeAt: 0 })).toBe("show");
    expect(canShow("error_streak", { ...st, freq: "rare" }, idle)).toBe("drop");
    const e = markShown(st, "error_streak", T);
    expect(canShow("error_streak", { ...e, last_popup: 0 }, { now: T + 10 * 60_000, lastTypeAt: 0 })).toBe("drop");
    expect(canShow("rank_up", { ...st, last_popup: T }, { now: T + 1000, lastTypeAt: 0 })).toBe("show");
    expect(canShow("rank_up", { ...st, freq: "story" }, idle)).toBe("show");
    expect(canShow("rank_up", st, { now: T, lastTypeAt: T - 100 })).toBe("wait");
  });
  it("долгий перерыв ≥3 дней, звание, склонение", () => {
    expect(breakDays(0, T)).toBe(0);
    expect(breakDays(T - 2 * 86_400_000, T)).toBe(0);
    expect(breakDays(T - 4 * 86_400_000, T)).toBe(4);
    expect(isRankUp("", "Мичман")).toBe(false);
    expect(isRankUp("Кадет", "Мичман")).toBe(true);
    expect([1, 3, 5, 11, 21, 22].map(daysWord)).toEqual(["день", "дня", "дней", "дней", "день", "дня"]);
  });
  it("реплики событий: {sir}, без чужих вселенных", () => {
    const own = linesOf("ship_ai")!;
    for (const k of ["rank_up", "record:cpm", "record:acc", "long_break", "error_streak"]) {
      expect(own[k]?.default?.join(" "), k).toContain("{sir}");
    }
  });
  it("сессия → окно рекорда, потом звания (после паузы)", async () => {
    const g = useGuide.getState();
    g.setPilot("Тест");
    g.patch({ ...DEFAULT_STATE, bests: { cpm: 100, acc: 90 }, last_rank: "Кадет", last_popup: 0 });
    useGuide.setState({ lastTypeAt: 0 });
    await onSession({ cpm: 140, acc: 93, chars: 300 }, async () => ({ rank: "Мичман" }));
    const s = useGuide.getState();
    expect(s.popup?.trigger).toBe("record");
    expect(s.popup?.lines[0]).toContain("140 зн/мин");
    expect(s.popup?.lines[0]).toContain("сэр");
    expect(s.queue.map((q) => q.trigger)).toEqual(["rank_up"]);
    s.close();
    useGuide.getState().pump();
    expect(useGuide.getState().popup?.lines[0]).toContain("«");
    expect(useGuide.getState().st.last_rank).toBe("Мичман");
  });
});
