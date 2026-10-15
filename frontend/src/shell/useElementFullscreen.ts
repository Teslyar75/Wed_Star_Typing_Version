/** Fullscreen API + CSS-фолбэк .is-fs (как в BookReaderView). */
import { useCallback, useEffect, useState, type RefObject } from "react";

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type FsDoc = Document & { webkitExitFullscreen?: () => Promise<void> };

export function useElementFullscreen(rootRef: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);

  const exitFullscreen = useCallback(async () => {
    setFullscreen(false);
    const doc = document as FsDoc;
    if (document.fullscreenElement || doc.webkitExitFullscreen) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const enterFullscreen = useCallback(async () => {
    setFullscreen(true);
    const el = rootRef.current as FsEl | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else await el.webkitRequestFullscreen?.();
    } catch {
      /* CSS .is-fs уже на весь экран */
    }
  }, [rootRef]);

  const toggleFullscreen = useCallback(() => {
    if (fullscreen) void exitFullscreen();
    else void enterFullscreen();
  }, [fullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      const el = rootRef.current;
      if (!document.fullscreenElement) setFullscreen(false);
      else if (el && document.fullscreenElement === el) setFullscreen(true);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, [rootRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        void exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, toggleFullscreen, exitFullscreen]);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  return { fullscreen, toggleFullscreen, exitFullscreen, enterFullscreen };
}
