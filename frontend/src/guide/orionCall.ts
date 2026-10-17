/** Вызов Ориона: приветствие → микрофон (ru) → команда (шутка / смена волны). */
import { ensureMicPermission, listenPhrase, webSpeechAvailable } from "../english/asr";
import { stopSpeaking } from "../english/speak";
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
  /** статус для кнопки: «говорите», ошибка микрофона и т.п. */
  onStatus?: (msg: string) => void;
  signal?: AbortSignal;
};

const MUTE_REASON = "orion_call";

function delay(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

/** Ждём, пока окно гида закроется (анекдот дочитан / Esc) — радио до этого молчит. */
function waitGuidePopupDone(signal?: AbortSignal): Promise<void> {
  if (!useGuide.getState().popup) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsub();
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => finish();
    const unsub = useGuide.subscribe((s) => {
      if (!s.popup) finish();
    });
    signal?.addEventListener("abort", onAbort);
    if (!useGuide.getState().popup) finish();
  });
}

/** Один сеанс: радио молчит до конца всего диалога и задания, потом эфир снова. */
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
  const status = (msg: string) => handlers.onStatus?.(msg);

  useRadio.getState().holdMute(MUTE_REASON);
  try {
    handlers.onPhase?.("greeting");
    status("Орион говорит…");
    await say(GREETING(sir));
    if (aborted()) return;

    /* обязательно погасить TTS — иначе Chrome ASR не слышит пилота */
    stopSpeaking();
    await delay(450);
    if (aborted()) return;

    if (!webSpeechAvailable()) {
      await say(
        `Нужен Chrome или Edge с распознаванием речи, ${sir}. Без него я вас не услышу.`,
      );
      return;
    }

    status("Разрешите микрофон…");
    const mic = await ensureMicPermission();
    if (aborted()) return;
    if (mic === "denied") {
      await say(
        `Микрофон запрещён, ${sir}. Разрешите доступ в адресной строке браузера и вызовите меня снова.`,
      );
      return;
    }

    handlers.onPhase?.("listening");
    status("Слушаю по-русски — говорите…");
    const result = await listenPhrase({
      expected: "",
      lang: "ru-RU",
      maxMs: 12_000,
      waitStartMs: 400,
      silenceMs: 1300,
      onInterim: (t) => {
        handlers.onHeard?.(t);
        if (t) status(`Слышу: ${t}`);
      },
      onStarted: () => status("Микрофон включён — говорите…"),
      onSounding: (on) => {
        if (on) status("Слышу речь…");
      },
      onReadyStop: (stop) => {
        handlers.signal?.addEventListener("abort", () => stop(), { once: true });
      },
    }).catch(() => ({
      transcript: "",
      alternatives: [] as string[],
      error: "asr-fail" as string | undefined,
    }));

    if (aborted()) return;

    const heard = (result.transcript || result.alternatives[0] || "").trim();
    if (heard) {
      handlers.onHeard?.(heard);
      status(`Распознано: ${heard}`);
    }

    handlers.onPhase?.("acting");
    const cmd = parseOrionCommand(heard);

    if (cmd === "joke") {
      const ok = useGuide.getState().tellJokeNow();
      if (!ok) {
        await say(`Простите, ${sir}, анекдотов в буфере нет.`);
        return;
      }
      status("Рассказываю…");
      await waitGuidePopupDone(handlers.signal);
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

    if (result.error === "not-allowed") {
      await say(`Микрофон запрещён, ${sir}. Разрешите доступ и повторите.`);
      return;
    }
    if (result.error === "network" || result.error === "no-webspeech") {
      await say(
        `Нет связи с распознаванием речи, ${sir}. Нужен интернет и Chrome или Edge.`,
      );
      return;
    }
    if (!heard || result.error) {
      await say(`Не расслышал, ${sir}. Скажите по-русски: «дай шутку» или «смени волну».`);
    } else {
      await say(`Пока умею шутку и смену волны, ${sir}. Вы сказали: ${heard}.`);
    }
  } finally {
    useRadio.getState().releaseMute(MUTE_REASON);
    handlers.onPhase?.("idle");
    status("");
  }
}
