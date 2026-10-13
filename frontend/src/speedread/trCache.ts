/**
 * UPLINK-кэш для гипердрайва — порт stamina/translator.py + reader._request_word_tr.
 *
 * * sync-lookup: в полёте показываем только то, что уже в кэше (без «…» и без ожидания сети).
 * * priority queue: текущий кадр (0), prefetch вперёд (1…), фоновый прогрев книги (8).
 * * group cancel: устаревший хвост rsvp не засоряет сеть.
 * * batch HTTP вместо одного слова — тот же смысл, быстрее для веба.
 */

import { frameAt, frameText, type RsvpWord } from "./rsvpCore";

const LS_KEY = "st_hd_tr_cache_v1";
const MAX_LS = 4000;
const MAX_QUEUE = 48;
const BATCH_SIZE = 80;
/** Как в reader._request_word_tr: текущий + 4 кадра вперёд. */
export const RSVP_PREFETCH = 4;
/** Запас до входа / фоновый хвост — чтобы на ≥1000 сл/мин не было склейки. */
export const RSVP_PREWARM = 120;
export const RSVP_BOOT_MIN = 60;

/** Частые служебные слова — мгновенно, без сети. */
const MINI: Record<string, string> = {
  the: "—",
  a: "—",
  an: "—",
  and: "и",
  or: "или",
  but: "но",
  of: "—",
  to: "—",
  in: "в",
  on: "на",
  at: "у",
  for: "для",
  with: "с",
  by: "—",
  from: "из",
  as: "как",
  is: "есть",
  are: "—",
  was: "был",
  were: "были",
  be: "быть",
  been: "был",
  being: "будучи",
  have: "иметь",
  has: "имеет",
  had: "имел",
  do: "делать",
  does: "делает",
  did: "сделал",
  not: "не",
  no: "нет",
  yes: "да",
  it: "это",
  its: "его",
  he: "он",
  she: "она",
  they: "они",
  we: "мы",
  you: "ты",
  i: "я",
  my: "мой",
  his: "его",
  her: "её",
  their: "их",
  this: "это",
  that: "тот",
  these: "эти",
  those: "те",
  which: "который",
  who: "кто",
  what: "что",
  when: "когда",
  where: "где",
  why: "почему",
  how: "как",
  if: "если",
  then: "тогда",
  than: "чем",
  so: "так",
  there: "там",
  here: "здесь",
  out: "из",
  up: "вверх",
  down: "вниз",
  into: "в",
  about: "о",
  over: "над",
  after: "после",
  before: "до",
  between: "между",
  through: "через",
  during: "во время",
  without: "без",
  again: "снова",
  once: "однажды",
  only: "только",
  just: "просто",
  also: "также",
  even: "даже",
  still: "всё ещё",
  already: "уже",
  always: "всегда",
  never: "никогда",
  often: "часто",
  sometimes: "иногда",
  very: "очень",
  more: "больше",
  most: "самый",
  some: "некоторые",
  any: "любой",
  all: "все",
  each: "каждый",
  every: "каждый",
  other: "другой",
  another: "ещё один",
  such: "такой",
  own: "свой",
  same: "тот же",
  new: "новый",
  old: "старый",
  good: "хороший",
  great: "великий",
  small: "маленький",
  large: "большой",
  long: "длинный",
  little: "мало",
  much: "много",
  many: "много",
  few: "мало",
  one: "один",
  two: "два",
  first: "первый",
  last: "последний",
  next: "следующий",
  man: "человек",
  men: "люди",
  people: "люди",
  time: "время",
  year: "год",
  day: "день",
  way: "путь",
  life: "жизнь",
  world: "мир",
  face: "лицо",
  hand: "рука",
  eye: "глаз",
  eyes: "глаза",
  door: "дверь",
  room: "комната",
  wall: "стена",
  voice: "голос",
  said: "сказал",
  say: "сказать",
  says: "говорит",
  like: "как",
  look: "смотреть",
  looked: "смотрел",
  see: "видеть",
  saw: "увидел",
  know: "знать",
  knew: "знал",
  think: "думать",
  thought: "думал",
  go: "идти",
  went: "шёл",
  come: "приходить",
  came: "пришёл",
  make: "делать",
  made: "сделал",
  take: "брать",
  took: "взял",
  get: "получать",
  got: "получил",
  can: "мочь",
  could: "мог",
  will: "будет",
  would: "бы",
  shall: "должен",
  should: "следует",
  may: "может",
  might: "мог бы",
  must: "должен",
  winston: "Уинстон",
  smith: "Смит",
  brother: "брат",
  big: "большой",
  watching: "наблюдает",
};

export function trKey(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loadLs(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(MINI)) m.set(k, v);
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return m;
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) {
      if (k && v) m.set(k, v);
    }
  } catch {
    /* ignore */
  }
  return m;
}

function saveLs(cache: Map<string, string>) {
  try {
    const obj: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of cache) {
      if (MINI[k]) continue;
      obj[k] = v;
      if (++n >= MAX_LS) break;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

type Job = {
  priority: number;
  seq: number;
  key: string;
  raw: string;
  group: string;
};

export type TrStore = {
  /** Sync: готовый перевод или "" (как desktop — без «…»). */
  get(raw: string): string;
  cached(raw: string): string | null;
  put(raw: string, tr: string): void;
  /** Поставить в очередь. priority: 0 срочно, 1–4 prefetch, 8 book_warm. */
  request(raw: string, priority?: number, group?: string): void;
  cancelGroup(group: string, keep?: Set<string>): void;
  /** Слить готовые результаты (аналог Translator.poll). */
  poll(): void;
  /** Пакетно прогреть ключи (ждём сеть) — для буфера до входа. */
  warm(keys: string[]): Promise<void>;
  /** Сколько из keys уже в кэше. */
  coverage(keys: string[]): { have: number; total: number };
};

function createTrStore(): TrStore {
  const cache = loadLs();
  const alive = new Map<string, string>(); // key -> group
  const queue: Job[] = [];
  let seq = 0;
  let pumping = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLs(cache), 800);
  };

  const enqueue = (raw: string, priority: number, group: string) => {
    const key = trKey(raw);
    if (!key) return;
    if (cache.has(key)) return;
    if (alive.has(key)) {
      alive.set(key, group);
      /* повысить приоритет — новый job с меньшим priority */
    } else {
      if (queue.length >= MAX_QUEUE && priority >= 5) return;
      alive.set(key, group);
    }
    seq += 1;
    queue.push({ priority, seq, key, raw, group });
    queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    void pump();
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (true) {
        const batch: Job[] = [];
        const seen = new Set<string>();
        while (batch.length < BATCH_SIZE && queue.length) {
          const job = queue.shift()!;
          if (!alive.has(job.key) || cache.has(job.key)) {
            alive.delete(job.key);
            continue;
          }
          if (seen.has(job.key)) continue;
          seen.add(job.key);
          batch.push(job);
        }
        if (!batch.length) break;
        const words = batch.map((j) => j.key);
        try {
          const r = await fetch("/api/reader/word-tr-batch", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ words, src: "en", dst: "ru" }),
          });
          if (r.ok) {
            const j = (await r.json()) as { tr?: Record<string, string> };
            for (const [k, v] of Object.entries(j.tr || {})) {
              if (v && !v.startsWith("[ru]")) cache.set(k, v);
            }
            scheduleSave();
          }
        } catch {
          /* ignore — следующий тик/кадр повторит request */
        } finally {
          for (const job of batch) alive.delete(job.key);
        }
      }
    } finally {
      pumping = false;
      if (queue.some((j) => alive.has(j.key) && !cache.has(j.key))) void pump();
    }
  };

  return {
    get(raw: string) {
      const key = trKey(raw);
      if (!key) return "";
      return cache.get(key) ?? "";
    },
    cached(raw: string) {
      const key = trKey(raw);
      if (!key) return null;
      return cache.get(key) ?? null;
    },
    put(raw: string, tr: string) {
      const key = trKey(raw);
      if (!key || !tr) return;
      cache.set(key, tr);
      scheduleSave();
    },
    request(raw: string, priority = 5, group = "default") {
      enqueue(raw, priority, group);
    },
    cancelGroup(group: string, keep?: Set<string>) {
      const keepSet = keep || new Set<string>();
      for (const [k, g] of [...alive.entries()]) {
        if (g === group && !keepSet.has(k) && !cache.has(k)) {
          alive.delete(k);
        }
      }
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i]!;
        if (j.group === group && !keepSet.has(j.key) && !cache.has(j.key)) {
          queue.splice(i, 1);
        }
      }
    },
    poll() {
      /* результаты пишутся в cache прямо из pump — poll нужен API-совместимости с desktop */
    },
    async warm(keys: string[]) {
      const need: string[] = [];
      for (const raw of keys) {
        const key = trKey(raw);
        if (!key || cache.has(key)) continue;
        need.push(key);
        if (need.length >= BATCH_SIZE) break;
      }
      if (!need.length) return;
      for (const k of need) alive.set(k, "warm");
      try {
        const r = await fetch("/api/reader/word-tr-batch", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: need, src: "en", dst: "ru" }),
        });
        if (!r.ok) return;
        const j = (await r.json()) as { tr?: Record<string, string> };
        for (const [k, v] of Object.entries(j.tr || {})) {
          if (v && !v.startsWith("[ru]")) cache.set(k, v);
        }
        scheduleSave();
      } catch {
        /* ignore */
      } finally {
        for (const k of need) alive.delete(k);
      }
    },
    coverage(keys: string[]) {
      let have = 0;
      for (const raw of keys) {
        const key = trKey(raw);
        if (!key || cache.has(key)) have += 1;
      }
      return { have, total: keys.length };
    },
  };
}

let _singleton: TrStore | null = null;

/** Один Translator на приложение — прогрев из полки живёт до гипердрайва. */
export function getTrStore(): TrStore {
  if (!_singleton) _singleton = createTrStore();
  return _singleton;
}

/** Уникальные тексты кадров начиная с at (для прогрева окна). */
export function collectFrameKeys(words: RsvpWord[], at: number, chunk: number, limit = RSVP_PREWARM): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = Math.max(0, at); i < words.length && out.length < limit; ) {
    const idxs = frameAt(words, i, chunk);
    if (!idxs.length) break;
    const { text: ft } = frameText(words, idxs);
    const key = trKey(ft);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(ft);
    }
    i = (idxs[idxs.length - 1] ?? i) + 1;
  }
  return out;
}

/**
 * Порт reader._request_word_tr:
 * текущий кадр priority=0, следующие RSVP_PREFETCH — 1…N, cancel_group("rsvp").
 * Возвращает sync-перевод текущего кадра ("" если ещё нет).
 */
export function requestWordTr(
  store: TrStore,
  words: RsvpWord[],
  frame: number[],
  chunk: number,
  prefetch = RSVP_PREFETCH,
): string {
  if (!frame.length) return "";
  const { text: src } = frameText(words, frame);
  const bare = src.trim();
  if (!bare) return "";

  const hit = store.cached(bare);
  const keep = new Set<string>();
  const curKey = trKey(bare);
  if (curKey) keep.add(curKey);
  if (!hit) store.request(bare, 0, "rsvp");

  let pos = (frame[frame.length - 1] ?? 0) + 1;
  for (let prefI = 0; prefI < prefetch; prefI++) {
    if (pos >= words.length) break;
    const nxt = frameAt(words, pos, chunk);
    if (!nxt.length) break;
    const nxtSrc = frameText(words, nxt).text.trim();
    if (nxtSrc) {
      const k = trKey(nxtSrc);
      if (k) keep.add(k);
      if (!store.cached(nxtSrc)) store.request(nxtSrc, 1 + prefI, "rsvp");
    }
    pos = (nxt[nxt.length - 1] ?? pos) + 1;
  }
  store.cancelGroup("rsvp", keep);
  return hit || store.get(bare);
}

/**
 * Фоновый хвост вперёд (как book_warm / span) — низкий приоритет, без отмены rsvp.
 * Чтобы после окна из 4 кадров уже лежал следующий фрагмент.
 */
export function warmAheadTail(store: TrStore, words: RsvpWord[], at: number, chunk: number, limit = RSVP_PREWARM) {
  const keys = collectFrameKeys(words, at, chunk, limit);
  for (const raw of keys) {
    if (!store.cached(raw)) store.request(raw, 8, "rsvp_warm");
  }
}

/** Дождаться буфера перед входом в гипердрайв (или таймаут). */
export async function ensureBootBuffer(
  store: TrStore,
  words: RsvpWord[],
  at: number,
  chunk: number,
  minFrames = RSVP_BOOT_MIN,
  timeoutMs = 2500,
): Promise<void> {
  const keys = collectFrameKeys(words, at, chunk, minFrames);
  if (!keys.length) return;
  const { have, total } = store.coverage(keys);
  if (have >= total || have >= Math.max(20, Math.floor(total * 0.7))) return;

  const deadline = performance.now() + timeoutMs;
  /* сначала срочный пакет, потом добиваем */
  await store.warm(keys);
  while (performance.now() < deadline) {
    const cov = store.coverage(keys);
    if (cov.have >= cov.total || cov.have >= Math.max(20, Math.floor(cov.total * 0.7))) return;
    const missing = keys.filter((k) => !store.cached(k));
    if (!missing.length) return;
    await store.warm(missing);
  }
}
