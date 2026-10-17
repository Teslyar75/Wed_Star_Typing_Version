/**
 * Адаптив окна: если контент stage выше/шире viewport — уменьшаем --st-fit-scale,
 * чтобы всё влезло без прокрутки.
 */

const MIN_SCALE = 0.55;

function measureAndFit(stage: HTMLElement) {
  /* Полный экран / chrome-полоса — не сжимать. */
  if (stage.classList.contains("is-fs") || document.fullscreenElement === stage) {
    stage.style.setProperty("--st-fit-scale", "1");
    return;
  }

  const panel = [...stage.children].find(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.classList.contains("chrome-under-bar") &&
      !el.classList.contains("stage-fs-bar"),
  );
  if (!panel) {
    stage.style.setProperty("--st-fit-scale", "1");
    return;
  }

  /* Страницы с собственной прокруткой — не сжимать transform'ом (иначе при XXL всё «перекрывается»). */
  if (
    panel.classList.contains("zone-settings") ||
    panel.classList.contains("bridge-settings") ||
    panel.classList.contains("settings-hub")
  ) {
    stage.style.setProperty("--st-fit-scale", "1");
    return;
  }

  const availH = stage.clientHeight;
  const availW = stage.clientWidth;
  if (availH < 32 || availW < 32) return;

  /* Временно снимаем clip/scale, чтобы увидеть натуральный размер */
  const prevOverflow = panel.style.overflow;
  const prevMaxH = panel.style.maxHeight;
  stage.style.setProperty("--st-fit-scale", "1");
  panel.style.overflow = "visible";
  panel.style.maxHeight = "none";

  const needH = Math.max(panel.scrollHeight, panel.getBoundingClientRect().height);
  const needW = Math.max(panel.scrollWidth, panel.getBoundingClientRect().width);

  panel.style.overflow = prevOverflow;
  panel.style.maxHeight = prevMaxH;

  const sH = availH / Math.max(needH, 1);
  const sW = availW / Math.max(needW, 1);
  const raw = Math.min(1, sH, sW);
  const scale = Math.max(MIN_SCALE, Math.min(1, raw > 0.995 ? 1 : raw * 0.98));
  stage.style.setProperty("--st-fit-scale", String(Number(scale.toFixed(3))));
}

/** Пауза авто-сжатия (слайдшоу и т.п.) — иначе после выхода интерфейс «схлопывается». */
let paused = false;
/** Зафиксированный fit после слайдшоу — не пересчитывать, пока юзер не ресайзнет / не сменит cabin. */
let heldFit: string | null = null;

export function pauseStageFit(): void {
  paused = true;
}

export function resumeStageFit(opts?: { refit?: boolean }): void {
  paused = false;
  if (opts?.refit) window.dispatchEvent(new Event("st-stage-fit"));
}

/** Держать этот --st-fit-scale, игнорируя measure (кроме resize / cabin). */
export function holdStageFit(scale: string): void {
  const v = scale.trim() || "1";
  heldFit = v;
  paused = false;
  const stage = document.querySelector<HTMLElement>(".stage");
  if (stage) stage.style.setProperty("--st-fit-scale", v);
}

export function clearStageFitHold(): void {
  heldFit = null;
}

export function installStageFit(getStage: () => HTMLElement | null): () => void {
  let raf = 0;
  let quiet = false;

  const apply = (force = false) => {
    /* paused блокирует и force — иначе hydrate после слайдшоу сбросит hold */
    if (quiet || paused) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (paused) return;
      const stage = getStage();
      if (!stage) return;
      quiet = true;
      try {
        if (heldFit != null && !force) {
          stage.style.setProperty("--st-fit-scale", heldFit);
          return;
        }
        if (force) heldFit = null;
        measureAndFit(stage);
      } finally {
        /* игнор RO/MO от наших style-правок */
        requestAnimationFrame(() => {
          quiet = false;
        });
      }
    });
  };

  const schedule = () => apply(false);
  const scheduleForce = () => apply(true);

  /* RO не force: после слайдшоу hold не сбрасывать от внутреннего reflow */
  const ro = new ResizeObserver(schedule);
  const mo = new MutationObserver(schedule);

  const stage0 = getStage();
  if (stage0) {
    ro.observe(stage0);
    mo.observe(stage0, { childList: true, subtree: true });
    schedule();
  }

  window.addEventListener("resize", scheduleForce);
  window.addEventListener("st-cabin-change", scheduleForce);
  window.addEventListener("st-stage-fit", scheduleForce);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    mo.disconnect();
    window.removeEventListener("resize", scheduleForce);
    window.removeEventListener("st-cabin-change", scheduleForce);
    window.removeEventListener("st-stage-fit", scheduleForce);
  };
}
