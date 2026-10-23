/**
 * Хвост крошек: страница зоны + стек модалок.
 * Клик по крошке → goDeep(slugs) → активная панель (registerGoHandler).
 *
 * Важно: getDeepRoute() возвращает стабильную ссылку, пока данные не менялись —
 * иначе useSyncExternalStore → React #185 (maximum update depth).
 */
import { useSyncExternalStore } from "react";

export type DeepSeg = { slug: string; label: string };

type Listener = () => void;
type GoHandler = (deepSlugs: string[]) => void;

let pageRoute: DeepSeg[] = [];
let modalStack: DeepSeg[] = [];
let deepSnapshot: DeepSeg[] = [];
let goHandler: GoHandler | null = null;
const listeners = new Set<Listener>();

function same(a: DeepSeg[], b: DeepSeg[]) {
  return a.length === b.length && a.every((s, i) => s.slug === b[i]?.slug && s.label === b[i]?.label);
}

function emit() {
  deepSnapshot = pageRoute.length || modalStack.length ? [...pageRoute, ...modalStack] : [];
  listeners.forEach((l) => l());
}

/** Внутренний путь страницы зоны (без slug зоны). */
export function setDeepRoute(segs: DeepSeg[]) {
  const next = segs.filter((s) => s.slug);
  if (same(next, pageRoute)) return;
  pageRoute = next;
  emit();
}

export function setPageRoute(segs: DeepSeg[]) {
  setDeepRoute(segs);
}

/** Стек модалок поверх страницы. */
export function setModalStack(segs: DeepSeg[]) {
  const next = segs.filter((s) => s.slug);
  if (same(next, modalStack)) return;
  modalStack = next;
  emit();
}

export function clearModalStack() {
  if (!modalStack.length) return;
  modalStack = [];
  emit();
}

export function clearDeepRoute() {
  if (!pageRoute.length && !modalStack.length) return;
  pageRoute = [];
  modalStack = [];
  emit();
}

export function getPageRoute(): DeepSeg[] {
  return pageRoute;
}

export function getModalStack(): DeepSeg[] {
  return modalStack;
}

/** Стабильный снимок page + modals. */
export function getDeepRoute(): DeepSeg[] {
  return deepSnapshot;
}

export function useDeepRoute(): DeepSeg[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getDeepRoute,
    getDeepRoute,
  );
}

export function registerGoHandler(handler: GoHandler | null) {
  goHandler = handler;
}

export function goDeep(deepSlugs: string[]) {
  const n = deepSlugs.length;
  if (n <= pageRoute.length) {
    modalStack = [];
    pageRoute = pageRoute.slice(0, Math.max(0, n));
    emit();
  } else {
    const pageLen = pageRoute.length;
    modalStack = modalStack.slice(0, Math.max(0, n - pageLen));
    emit();
  }
  goHandler?.(deepSlugs);
  window.dispatchEvent(new CustomEvent("st-crumb-go", { detail: { slugs: deepSlugs } }));
}

/* ── Экраны отсека для меню ОБЗОР (alt): публикует активная панель ── */
export type ZoneScreens = { tab: string; screens: DeepSeg[] };
let zoneScreens: ZoneScreens = { tab: "", screens: [] };
const zoneListeners = new Set<Listener>();

export function setZoneScreens(tab: string, screens: DeepSeg[]) {
  if (zoneScreens.tab === tab && same(zoneScreens.screens, screens)) return;
  zoneScreens = { tab, screens };
  zoneListeners.forEach((l) => l());
}

export function getZoneScreens(): ZoneScreens {
  return zoneScreens;
}

export function useZoneScreens(): ZoneScreens {
  return useSyncExternalStore(
    (cb) => {
      zoneListeners.add(cb);
      return () => zoneListeners.delete(cb);
    },
    getZoneScreens,
    getZoneScreens,
  );
}
