import { describe, expect, it } from "vitest";
import {
  bagNext,
  canOfferNow,
  canOnlineAmbient,
  DEFAULT_IDLE,
  intervalMs,
  type GuideIdlePersist,
} from "./guideIdle";

function fresh(): GuideIdlePersist {
  return { ...DEFAULT_IDLE, bags: {} };
}

describe("guideIdle ShuffleBag", () => {
  it("выдаёт каждый id один раз за круг", () => {
    const st = fresh();
    const ids = ["a", "b", "c"];
    const first = [bagNext(st, "t", ids)!, bagNext(st, "t", ids)!, bagNext(st, "t", ids)!];
    expect(new Set(first).size).toBe(3);
    const again = bagNext(st, "t", ids)!;
    expect(ids).toContain(again);
  });

  it("на стыке мешков не ставит last первым", () => {
    const st = fresh();
    const ids = ["a", "b"];
    // детерминированный rnd: shuffle оставляет порядок; swap сработает если last===first
    const seq = [bagNext(st, "t", ids, () => 0)!, bagNext(st, "t", ids, () => 0)!];
    expect(new Set(seq).size).toBe(2);
    const last = seq[1]!;
    const next = bagNext(st, "t", ids, () => 0)!;
    expect(next).not.toBe(last);
  });

  it("интервал удваивается после 3 отказов", () => {
    const base = intervalMs("10-20", 0, () => 0);
    const slow = intervalMs("10-20", 3, () => 0);
    expect(slow).toBe(base * 2);
  });
});

describe("guideIdle gates", () => {
  it("canOfferNow: выкл / кулдаун / набор", () => {
    const st = fresh();
    const now = 1_000_000;
    expect(canOfferNow(st, { now, lastTypeAt: 0, jokesOn: false, guideOn: true })).toBe("drop");
    expect(canOfferNow(st, { now, lastTypeAt: 0, jokesOn: true, guideOn: false })).toBe("drop");
    st.last_offer_at = now - 60_000;
    expect(canOfferNow(st, { now, lastTypeAt: 0, jokesOn: true, guideOn: true })).toBe("drop");
    st.last_offer_at = 0;
    expect(canOfferNow(st, { now, lastTypeAt: now - 1000, jokesOn: true, guideOn: true })).toBe("wait");
    expect(canOfferNow(st, { now, lastTypeAt: now - 10_000, jokesOn: true, guideOn: true })).toBe("show");
  });

  it("canOnlineAmbient: busy / draft / cooldown", () => {
    const st = { ...fresh(), online_jokes: true };
    const base = {
      now: 1_000_000,
      lastTypeAt: 0,
      jokesOn: true,
      onlineOn: true,
      busy: false,
      hasDraft: false,
      listening: false,
      pendingAnswer: false,
    };
    expect(canOnlineAmbient(st, base)).toBe(true);
    expect(canOnlineAmbient(st, { ...base, busy: true })).toBe(false);
    expect(canOnlineAmbient(st, { ...base, hasDraft: true })).toBe(false);
    expect(canOnlineAmbient(st, { ...base, onlineOn: false })).toBe(false);
    st.last_online_at = base.now - 60_000;
    expect(canOnlineAmbient(st, base)).toBe(false);
  });
});
