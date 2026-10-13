/** Размер игрового поля — как Configure на desktop GameShell. */
import { useEffect, useState, type RefObject } from "react";

export type FieldSize = { w: number; h: number };

export function useFieldSize(wrapRef: RefObject<HTMLElement | null>, min = 120): FieldSize {
  const [size, setSize] = useState<FieldSize>({ w: 640, h: 480 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(min, Math.floor(r.width));
      const h = Math.max(min, Math.floor(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapRef, min]);

  return size;
}
