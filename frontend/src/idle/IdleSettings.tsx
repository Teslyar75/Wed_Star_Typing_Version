/** Блок настроек простоя (Настройки → Дополнительно). */
import { useEffect, useState } from "react";
import { IDLE_MINUTES, useIdle, type IdleProvider } from "./idleStore";
import { ti } from "./idleI18n";
import { IDLE_OPEN_EVENT } from "./IdleSlideshow";

type Prov = {
  unsplash: boolean;
  pexels: boolean;
  links: { unsplash: string; pexels: string };
  paid: { id: string; name: string; url: string }[];
};

export default function IdleSettings({ Row }: { Row: (p: { title: string; desc: string; children: React.ReactNode }) => React.ReactElement }) {
  const s = useIdle();
  const [prov, setProv] = useState<Prov | null>(null);
  useEffect(() => {
    void fetch("/api/slideshow/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then(setProv)
      .catch(() => setProv(null));
  }, []);
  const provs: { id: IdleProvider; label: string; dis?: boolean }[] = [
    { id: "auto", label: ti("auto") },
    { id: "wikimedia", label: "Wikimedia" },
    { id: "unsplash", label: "Unsplash", dis: !prov?.unsplash },
  ];
  return (
    <>
      <Row title={ti("title")} desc={ti("desc")}>
        {IDLE_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            className={`hud-btn ${s.minutes === m ? "amber" : ""}`}
            aria-pressed={s.minutes === m}
            onClick={() => s.set("minutes", m)}
          >
            {m === 0 ? ti("off") : ti("min", m)}
          </button>
        ))}
        <button type="button" className="hud-btn" onClick={() => window.dispatchEvent(new Event(IDLE_OPEN_EVENT))}>
          ▶ {ti("try")}
        </button>
      </Row>
      <Row title={ti("radio")} desc={ti("radio_desc")}>
        <button type="button" className={`hud-btn ${s.radio ? "amber" : ""}`} aria-pressed={s.radio} onClick={() => s.set("radio", !s.radio)}>
          {s.radio ? "●" : "○"} {ti("radio")}
        </button>
        <span className="muted">{ti("after_close")}:</span>
        {(["stop", "keep"] as const).map((a) => (
          <button key={a} type="button" className={`hud-btn ${s.after === a ? "amber" : ""}`} aria-pressed={s.after === a} onClick={() => s.set("after", a)}>
            {ti(a)}
          </button>
        ))}
      </Row>
      <Row title={ti("source")} desc="">
        <div className="idle-sources">
          <div>
            {provs.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.dis}
                className={`hud-btn ${s.provider === p.id ? "amber" : ""}`}
                aria-pressed={s.provider === p.id}
                onClick={() => s.set("provider", p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span>✓ {ti("src_wiki")}</span>
          <span>
            {prov?.unsplash ? "✓ " + ti("src_unsplash_on") : "○ " + ti("src_unsplash_off")}{" "}
            <a href={prov?.links.unsplash || "https://unsplash.com/developers"} target="_blank" rel="noreferrer">
              unsplash.com/developers
            </a>
          </span>
          <span>
            {prov?.pexels ? "✓" : "○"} {ti("src_pexels")}{" "}
            <a href={prov?.links.pexels || "https://www.pexels.com/api/"} target="_blank" rel="noreferrer">
              pexels.com/api
            </a>
          </span>
          <span>
            {ti("src_paid")}{" "}
            {(prov?.paid || []).map((p, i) => (
              <span key={p.id}>
                {i ? " · " : ""}
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.name}
                </a>
              </span>
            ))}
          </span>
        </div>
      </Row>
    </>
  );
}
