/** Настройки → «Гид». Только клавиатура (Tab / стрелки / Enter), без прокрутки. Строки — пока по-русски. */
import type { ReactElement, ReactNode } from "react";
import { forgetFirstLaunch, FREQ_LABELS, resetHints } from "./guideLogic";
import { GUIDES, linesOf, NO_GUIDE } from "./guides";
import { useGuide } from "./guideStore";
import { speakGuide } from "./voice";
import { addressOf, fill } from "./guideLogic";

type RowT = (p: { title: string; desc: string; children: ReactNode }) => ReactElement;

export default function GuideSettings({ Row, onReplay }: { Row: RowT; onReplay?: () => void }) {
  const st = useGuide((s) => s.st);
  const idle = useGuide((s) => s.idle);
  const patch = useGuide((s) => s.patch);
  const patchIdle = useGuide((s) => s.patchIdle);
  const off = st.id === NO_GUIDE;
  const sample = (vol = st.volume) => {
    const line = linesOf(st.id)?.sample?.default?.[0];
    if (line) speakGuide(st.id, fill(line, { sir: addressOf() }), vol);
  };
  return (
    <>
      <Row title="Гид" desc="Кто сопровождает вас в полёте. Остальные гиды появятся позже.">
        {GUIDES.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={g.soon}
            className={`hud-btn ${st.id === g.id ? "amber" : ""}`}
            aria-pressed={st.id === g.id}
            title={g.soon ? "скоро" : g.title}
            onClick={() => patch({ id: g.id })}
          >
            {g.name}
            {g.soon ? " · скоро" : ""}
          </button>
        ))}
        <button type="button" className={`hud-btn ${off ? "amber" : ""}`} aria-pressed={off} onClick={() => patch({ id: NO_GUIDE })}>
          Без гида
        </button>
      </Row>
      <Row title="Частота подсказок" desc="«Выкл» — гид говорит только о новых званиях и сюжете. Не чаще одного окна за выбранный интервал.">
        {FREQ_LABELS.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={off}
            className={`hud-btn ${st.freq === f.id ? "amber" : ""}`}
            aria-pressed={st.freq === f.id}
            onClick={() => patch({ freq: f.id })}
          >
            {f.label}
          </button>
        ))}
      </Row>
      <Row title="Шутки и факты" desc="Бортовой гид без ИИ (как desktop guide_idle): заход → Enter слушать / Esc отказаться. Мешок без повторов. Шутка или факт попадают в чат Ориона с меткой kind.">
        <button
          type="button"
          disabled={off}
          className={`hud-btn settings-toggle ${st.jokes ? "ok" : ""}`}
          aria-pressed={st.jokes}
          onClick={() => patch({ jokes: !st.jokes })}
        >
          {st.jokes ? "● вкл" : "○ выкл"}
        </button>
        {(["5-10", "10-20", "20-40"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            disabled={off || !st.jokes}
            className={`hud-btn ${idle.interval === iv ? "amber" : ""}`}
            aria-pressed={idle.interval === iv}
            onClick={() => patchIdle({ interval: iv })}
          >
            {iv.replace("-", "–")} мин
          </button>
        ))}
        <button
          type="button"
          disabled={off || !st.jokes}
          className="hud-btn"
          onClick={() => {
            const g = useGuide.getState();
            g.patchIdle({ last_offer_at: 0 });
            g.patch({ last_by: { ...g.st.last_by, joke_offer: 0 }, last_popup: 0 });
            g.maybeOfferJoke();
          }}
        >
          ▶ Проверить
        </button>
      </Row>
      <Row title="В ONLINE-чате" desc="Редко вставлять шутку/факт в историю чата, только когда агент свободен (нет запроса, пилот не печатает миссию). Не смешивается с ответом ИИ. На desktop такого нет — только toast гида.">
        <button
          type="button"
          disabled={off || !st.jokes}
          className={`hud-btn settings-toggle ${idle.online_jokes ? "ok" : ""}`}
          aria-pressed={idle.online_jokes}
          onClick={() => patchIdle({ online_jokes: !idle.online_jokes })}
        >
          {idle.online_jokes ? "● вкл" : "○ выкл"}
        </button>
      </Row>
      <Row title="Голос гида" desc="Нейроголос с сервера, без сети — голос браузера. В окне гида — клавиша V.">
        <button type="button" disabled={off} className={`hud-btn settings-toggle ${st.voice ? "ok" : ""}`} onClick={() => patch({ voice: !st.voice })}>
          {st.voice ? "● вкл" : "○ выкл"}
        </button>
        {[1, 2, 3, 4].map((v) => (
          <button
            key={v}
            type="button"
            disabled={off || !st.voice}
            className={`hud-btn ${st.volume === v ? "amber" : ""}`}
            aria-pressed={st.volume === v}
            aria-label={`громкость ${v} из 4`}
            onClick={() => {
              patch({ volume: v });
              sample(v);
            }}
          >
            {"▮".repeat(v)}
          </button>
        ))}
        <button type="button" disabled={off} className="hud-btn" onClick={() => sample()}>
          ▶ Прослушать
        </button>
      </Row>
      <Row title="Повторить" desc="Знакомство с гидом можно послушать ещё раз. История появится вместе с сюжетными главами.">
        <button
          type="button"
          disabled={off}
          className="hud-btn"
          onClick={() => {
            const g = useGuide.getState();
            g.patch(forgetFirstLaunch(g.st));
            onReplay?.();
          }}
        >
          Знакомство
        </button>
        <button type="button" disabled className="hud-btn" title="скоро">
          Пересказать историю · скоро
        </button>
      </Row>
      <Row title="Показанные подсказки" desc="Гид снова расскажет о зонах и включит подсказки, отключённые через Shift+Esc.">
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            const g = useGuide.getState();
            g.patch(resetHints(g.st));
          }}
        >
          Сбросить ({st.seen.filter((x) => x !== "first_launch").length + st.muted_triggers.length})
        </button>
      </Row>
    </>
  );
}
