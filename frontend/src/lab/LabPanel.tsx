/** Отсек «Лаборатория»: три уровня LOD, камера, полный слепок. */
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import LabCanvas, { type Cam, type LabCanvasHandle } from "./LabCanvas";
import {
  cancelSnapshot,
  fetchFragment,
  fetchNeighborhood,
  fetchVisual,
  loadFullSnapshot,
  type LabGraphPayload,
  type Neighborhood,
  type SnapshotEvent,
} from "./labApi";
import {
  DRAG_CLICK_PX,
  ORBIT_SENS,
  WORK_ZOOM,
  ZOOM_STEP,
  clampPitch,
  zoomToward,
} from "./labMath";
import "./lab.css";

const HOME_CAM: Cam = {
  yaw: 0,
  pitch: 0.18,
  zoom: 1,
  panX: 0,
  panY: 0,
  viewOx: 0,
  viewOy: 0,
  yawVel: 0,
  pitchVel: 0,
};

function useDemoFlag(): boolean {
  try {
    return localStorage.getItem("st_lab_demo") === "1" || import.meta.env.VITE_LAB_DEMO === "1";
  } catch {
    return false;
  }
}

export default function LabPanel() {
  const demo = useDemoFlag();
  const [mode, setMode] = useState<"visual" | "work">("visual");
  const [graph, setGraph] = useState<LabGraphPayload | null>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [cam, setCam] = useState<Cam>(HOME_CAM);
  const [home, setHome] = useState<Cam>(HOME_CAM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Neighborhood | null>(null);
  const [selCache, setSelCache] = useState<Record<string, Neighborhood>>({});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [snapProgress, setSnapProgress] = useState<SnapshotEvent | null>(null);
  const [snapJson, setSnapJson] = useState<string | null>(null);
  const [snapRunning, setSnapRunning] = useState(false);

  const canvasApi = useRef<LabCanvasHandle>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selTokenRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const snapCancelRef = useRef(false);
  const snapTokenRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clearSelection = useCallback(() => {
    selTokenRef.current += 1;
    setSelectedId(null);
    setSelection(null);
  }, []);

  const loadVisual = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr("");
    try {
      const g = await fetchVisual(demo, ac.signal);
      if (ac.signal.aborted) return;
      setGraph(g);
      setMode("visual");
      setFocusGroup(null);
      clearSelection();
      const next = { ...HOME_CAM };
      setCam(next);
      setHome(next);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, [demo, clearSelection]);

  const loadFrag = useCallback(
    async (group: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      setErr("");
      try {
        const g = await fetchFragment(group, demo, ac.signal);
        if (ac.signal.aborted) return;
        setGraph(g);
        setMode("work");
        setFocusGroup(group);
        clearSelection();
        const next = { ...HOME_CAM, zoom: WORK_ZOOM };
        setCam(next);
        setHome(next);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr(String(e));
      } finally {
        setBusy(false);
      }
    },
    [demo, clearSelection],
  );

  useEffect(() => {
    void loadVisual();
    return () => abortRef.current?.abort();
  }, [loadVisual]);

  const selectStarSafe = useCallback(
    async (nodeId: string) => {
      if (mode !== "work") return;
      const token = ++selTokenRef.current;
      setSelectedId(nodeId);
      const cached = selCache[nodeId];
      if (cached) {
        setSelection({ ...cached, cached: true });
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const bund = await fetchNeighborhood(nodeId, {
          demo,
          group: focusGroup ?? undefined,
          signal: ac.signal,
        });
        if (selTokenRef.current !== token || selectedIdRef.current !== nodeId) return;
        setSelCache((c) => ({ ...c, [nodeId]: bund }));
        setSelection(bund);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr(String(e));
      }
    },
    [mode, demo, focusGroup, selCache],
  );

  const showMore = useCallback(async () => {
    if (!selectedId || !selection?.has_more) return;
    const token = selTokenRef.current;
    const offset = selection.neighbors.length;
    try {
      const more = await fetchNeighborhood(selectedId, {
        demo,
        offset,
        group: focusGroup ?? undefined,
      });
      if (selTokenRef.current !== token) return;
      const merged: Neighborhood = {
        selected: selection.selected,
        neighbors: [...selection.neighbors, ...more.neighbors],
        edges: [...selection.edges, ...more.edges],
        neighbor_total: more.neighbor_total,
        neighbor_offset: 0,
        neighbor_limit: more.neighbor_limit,
        has_more: more.has_more,
      };
      setSelCache((c) => ({ ...c, [selectedId]: merged }));
      setSelection(merged);
    } catch (e) {
      setErr(String(e));
    }
  }, [selectedId, selection, demo, focusGroup]);

  const resetView = useCallback(() => {
    setCam({ ...home, yawVel: 0, pitchVel: 0 });
  }, [home]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "Home") return;
      const zone = document.querySelector('.nav-tab[data-zone="lab"][aria-selected="true"]');
      if (!zone) return;
      e.preventDefault();
      resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetView]);

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasApi.current?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drag.current = { x, y, yaw: cam.yaw, pitch: cam.pitch, moved: false };
    setDragging(false);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = canvasApi.current?.canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - drag.current.x;
    const dy = y - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) >= DRAG_CLICK_PX) {
      drag.current.moved = true;
      setDragging(true);
    }
    setCam((c) => ({
      ...c,
      yaw: drag.current!.yaw + dx * ORBIT_SENS,
      pitch: clampPitch(drag.current!.pitch - dy * ORBIT_SENS),
      yawVel: dx * ORBIT_SENS * 0.35,
      pitchVel: -dy * ORBIT_SENS * 0.35,
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved) return;
    const rect = canvasApi.current?.canvas?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const n = canvasApi.current?.starAt(x, y) ?? null;
    if (!n) {
      if (mode === "work" && selectedId) clearSelection();
      return;
    }
    if (
      mode === "visual" &&
      ["cluster", "book", "verb", "milestone", "mission", "exercise"].includes(n.kind)
    ) {
      void loadFrag(n.group);
    } else if (mode === "work") {
      void selectStarSafe(n.id);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasApi.current?.canvas?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setCam((c) => {
      const [z, ox, oy] = zoomToward(c.zoom, c.viewOx, c.viewOy, factor, [mx, my], [cx, cy]);
      return { ...c, zoom: z, viewOx: ox, viewOy: oy, yawVel: 0, pitchVel: 0 };
    });
  };

  const runSnapshot = async () => {
    snapCancelRef.current = false;
    setSnapJson(null);
    setSnapRunning(true);
    setSnapProgress({ phase: "collect", done: 0, total: 0 });
    const snap = await loadFullSnapshot(
      demo,
      (ev) => {
        setSnapProgress(ev);
        if (ev.token) snapTokenRef.current = ev.token;
      },
      () => snapCancelRef.current,
    );
    setSnapRunning(false);
    if (snap) setSnapJson(JSON.stringify(snap, null, 2));
    snapTokenRef.current = null;
  };

  const abortSnap = async () => {
    snapCancelRef.current = true;
    if (snapTokenRef.current) await cancelSnapshot(snapTokenRef.current);
    setSnapProgress({ phase: "cancelled", done: 0, total: 0 });
    setSnapRunning(false);
  };

  const counts = graph?.counts ?? {};
  const summary =
    mode === "work"
      ? t("lab_fragment_n").replace("{0}", String(graph?.nodes.length ?? 0))
      : t("lab_counts")
          .replace("{0}", String(counts.en ?? 0))
          .replace("{1}", String(counts.read ?? 0))
          .replace("{2}", String(counts.type ?? 0));

  return (
    <section className="lab-panel" data-testid="lab-panel" data-lab-mode={mode}>
      <header className="lab-toolbar">
        <div className="lab-title-row">
          <h2 className="lab-title">{t("lab_title")}</h2>
          {demo ? <span className="lab-badge">{t("lab_demo")}</span> : null}
          <span className="lab-mode muted">
            {mode === "work" ? t("lab_mode_work") : t("lab_mode_visual")}
          </span>
        </div>
        <div className="lab-actions" data-nav-group="lab-actions">
          <span className="lab-summary muted">{summary}</span>
          {mode === "work" ? (
            <button type="button" className="hud-btn" onClick={() => void loadVisual()}>
              {t("lab_back")}
            </button>
          ) : null}
          {selection?.has_more ? (
            <button type="button" className="hud-btn" onClick={() => void showMore()}>
              {t("lab_show_more")}
            </button>
          ) : null}
          <button type="button" className="hud-btn" onClick={resetView} title="Ctrl+Home">
            {t("lab_reset_view")}
          </button>
          <button
            type="button"
            className="hud-btn amber"
            onClick={() => void runSnapshot()}
            disabled={snapRunning}
          >
            {t("lab_full_snapshot")}
          </button>
          <button type="button" className="hud-btn" onClick={() => void loadVisual()} disabled={busy}>
            {t("lab_reload")}
          </button>
        </div>
      </header>

      <div
        className="lab-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <LabCanvas
          ref={canvasApi}
          graph={graph}
          mode={mode}
          cam={cam}
          onCam={setCam}
          selection={selection}
          selectedId={selectedId}
          dragging={dragging}
          reducedMotion={reduced}
        />
        {selection ? (
          <aside className="lab-detail" data-testid="lab-detail">
            <div>{t("lab_selected").replace("{0}", selection.selected.label)}</div>
            <div className="muted">
              {selection.selected.kind} · {selection.selected.detail || selection.selected.group}
            </div>
            <div>{t("lab_fresh").replace("{0}", String(Math.round((selection.selected.fresh ?? 0) * 100)))}</div>
            <div>
              {t("lab_links")
                .replace("{0}", String(selection.neighbors.length))
                .replace("{1}", String(selection.neighbor_total))}
            </div>
            <ul>
              {selection.neighbors.slice(0, 8).map((n) => (
                <li key={n.id}>
                  · {n.label} ({n.kind})
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>

      {err ? <div className="lab-err">{err}</div> : null}

      {snapRunning && snapProgress ? (
        <div className="lab-snap-dlg" role="dialog" data-testid="lab-snapshot-progress">
          <div className="lab-snap-card">
            <h3>{t("lab_full_snapshot")}</h3>
            <p>
              {snapProgress.phase}: {snapProgress.done}/{snapProgress.total || "…"}
            </p>
            <div className="lab-snap-bar">
              <div
                style={{
                  width: `${
                    snapProgress.total
                      ? Math.min(100, (100 * snapProgress.done) / snapProgress.total)
                      : 5
                  }%`,
                }}
              />
            </div>
            <button type="button" className="hud-btn" onClick={() => void abortSnap()}>
              {t("lab_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {snapJson ? (
        <div className="lab-snap-dlg" role="dialog" data-testid="lab-snapshot-json">
          <div className="lab-snap-card lab-snap-json">
            <header>
              <h3>{t("lab_full_snapshot")}</h3>
              <button type="button" className="hud-btn" onClick={() => setSnapJson(null)}>
                ✕
              </button>
            </header>
            <textarea readOnly value={snapJson} spellCheck={false} />
            <div className="lab-snap-actions">
              <button
                type="button"
                className="hud-btn amber"
                onClick={() => {
                  void navigator.clipboard?.writeText(snapJson);
                }}
              >
                {t("lab_copy_json")}
              </button>
              <a
                className="hud-btn"
                download="lab_entity_snapshot.json"
                href={`data:application/json;charset=utf-8,${encodeURIComponent(snapJson)}`}
              >
                {t("lab_download_json")}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
