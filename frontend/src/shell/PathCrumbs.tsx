/** Путь зоны: мелкие крошки, клик по любому уровню, копирование slug. */
import { useState } from "react";
import { t } from "../i18n";
import type { Tab } from "./tabs";
import { basePathForTab, slugPath } from "./routes";
import { goDeep, useDeepRoute } from "./routeStore";
import { zoneOf } from "./zones";

type Props = {
  tab: Tab;
  onJump: (tab: Tab) => void;
};

type Seg = { slug: string; label: string; tab?: Tab; kind: "base" | "deep" };

export default function PathCrumbs({ tab, onJump }: Props) {
  const deep = useDeepRoute();
  const [copied, setCopied] = useState(false);

  const base = basePathForTab(tab).map((s) => ({
    slug: s.slug,
    label: t(s.labelKey),
    tab: s.tab,
    kind: "base" as const,
  }));
  const deepSegs = deep.map((d) => ({
    slug: d.slug,
    label: d.label,
    kind: "deep" as const,
  }));
  const segs: Seg[] = [...base, ...deepSegs];

  const fullSlug = slugPath(segs);

  const onSegClick = (i: number) => {
    if (i >= segs.length - 1) return;
    const target = segs[i]!;
    if (target.kind === "base" && target.tab) {
      /* зона или лист мостика */
      onJump(target.tab);
      return;
    }
    /* deep: хвост без зоны (и без bridge leaf в base) */
    const baseLen = base.length;
    if (i < baseLen) {
      onJump(zoneOf(tab) === "bridge" && tab !== "bridge" ? "bridge" : zoneOf(tab));
      return;
    }
    const deepUpto = deep.slice(0, i - baseLen + 1).map((d) => d.slug);
    goDeep(deepUpto);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullSlug);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="path-crumbs" aria-label="path">
      <ol className="path-crumbs-list">
        {segs.map((s, i) => {
          const last = i === segs.length - 1;
          return (
            <li key={`${s.kind}-${s.slug}-${i}`} className={last ? "on" : ""}>
              {i > 0 ? <span className="path-sep" aria-hidden>/</span> : null}
              {!last ? (
                <button type="button" className="path-seg" onClick={() => onSegClick(i)}>
                  {s.label}
                </button>
              ) : (
                <span className="path-seg static">{s.label}</span>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="path-copy"
        title={fullSlug}
        aria-label={copied ? t("path_copied") : t("path_copy")}
        onClick={() => void copy()}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <code className="path-slug" title={t("path_copy")}>
        {fullSlug}
      </code>
    </div>
  );
}
