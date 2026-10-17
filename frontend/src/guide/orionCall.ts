/** Вызов Ориона: приветствие → микрофон → команда (шутка / смена волны). */
import { listenPhrase } from "../english/asr";
import { useRadio } from "../radio/radioStore";
import { parseOrionCommand } from "./orionCommands";
import { useGuide } from "./guideStore";
import { speakGuideAsync } from "./voice";
import { addressOf } from "./guideLogic";

export type OrionCallPhase = "idle" | "greeting" | "listening" | "acting";

const GREETING = (sir: string) => `Да, я тут, ${sir}. Что-то нужно?`;

export type OrionCallHandlers = {
  onPhase?: (p: OrionCallPhase) => void;
  onHeard?: (text: string) => void;
  signal?: AbortSignal;
};

const MUTE_REASON = "orion_call";

/** Один сеанс: радио молчит → поздороваться → слушать → выполнить → эфир обратно. */
export async function runOrionCall(handlers: OrionCallHandlers = {}): Promise<void> {
  const g = useGuide.getState();
  if (g.st.id === "none" || !g.pilot) {
    handlers.onPhase?.("idle");
    return;
  }
  const { id, volume } = g.st;
  const sir = addressOf();
  const aborted = () => handlers.signal?.aborted;
  const say = (text: string) => speakGuideAsync(id, text, volume);

  /* сразу тишина в эфире — иначе ASR не разбирает речь пилота */
  useRadio.getState().holdMute(MUTE_REASON);
  try {
    handlers.onPhase?.("greeting");
    await say(GREETING(sir));
    if (aborted()) return;

    handlers.onPhase?.("listening");
    const result = await listenPhrase({
      expected: "",
      lang: "ru-RU",
      maxMs: 10_000,
      waitStartMs: 600,
      silenceMs: 1100,
      onInterim: (t) => handlers.onHeard?.(t),
      onReadyStop: (stop) => {
        handlers.signal?.addEventListener("abort", () => stop(), { once: true });
      },
    }).catch(() => ({ transcript: "", alternatives: [] as string[], error: "asr-fail" as string | undefined }));

    if (aborted()) return;

    const heard = (result.transcript || result.alternatives[0] || "").trim();
    if (heard) handlers.onHeard?.(heard);

    handlers.onPhase?.("acting");
    const cmd = parseOrionCommand(heard);

    if (cmd === "joke") {
      const ok = useGuide.getState().tellJokeNow();
      if (!ok) await say(`Простите, ${sir}, анекдотов в буфере нет.`);
      return;
    }

    if (cmd === "radio_next" || cmd === "radio_prev") {
      const radio = useRadio.getState();
      if (!radio.favs.length) {
        await say(`Нет избранных волн, ${sir}. Добавьте станции в радиорубке.`);
        return;
      }
      if (cmd === "radio_next") radio.nextFav();
      else radio.prevFav();
      const name = useRadio.getState().station?.name || "следующая";
      await say(`Переключаю: ${name}.`);
      return;
    }

    if (!heard || result.error) {
      await say(`Не расслышал, ${sir}. Скажите «дай шутку» или «смени волну».`);
    } else {
      await say(`Пока умею шутку и смену волны, ${sir}. Повторите, пожалуйста.`);
    }
  } finally {
    useRadio.getState().releaseMute(MUTE_REASON);
    handlers.onPhase?.("idle");
  }
}
