/** Строки модуля простоя (ru / uk / en / de). */
import { getLang } from "../i18n";

type D = Record<string, string>;
const RU: D = {
  title: "Простой: слайдшоу и радио",
  desc: "Если долго не трогать клавиатуру, включается слайдшоу в стиле скина и радио той же тематики. Первое нажатие закрывает его и не засчитывается в набор.",
  after: "Через сколько минут",
  off: "Выкл",
  min: "{0} мин",
  radio: "Радио под скин",
  radio_desc: "Станция подбирается по жанрам скина, громкость плавно растёт до ~30 %. Если радио уже играет — его не трогаем.",
  keep: "Оставить радио",
  stop: "Выключить радио",
  after_close: "После закрытия",
  source: "Источник картинок",
  auto: "Авто",
  src_wiki: "Wikimedia Commons — бесплатно, без ключа (по умолчанию).",
  src_unsplash_on: "Unsplash — ключ подключён на сервере.",
  src_unsplash_off: "Unsplash — ключ не задан. Бесплатный ключ: unsplash.com/developers → в backend/.env строка UNSPLASH_ACCESS_KEY=… (ключ хранится только на сервере).",
  src_pexels: "Pexels — выдача ключей сейчас приостановлена; при наличии ключа: PEXELS_API_KEY в backend/.env.",
  src_paid: "Платные сервисы (позже):",
  try: "Показать сейчас",
  hint: "Любая клавиша — вернуться",
  photo: "Фото",
  help: "Простой: через N минут без клавиатуры (Конторка/Настройки → Дополнительно) включается слайдшоу в стиле скина и радио той же тематики. Любая клавиша закрывает — это нажатие не попадает в набор. Картинки: Wikimedia Commons (или Unsplash, если ключ задан на сервере), автор и лицензия — в углу.",
};
const EN: D = {
  title: "Idle: slideshow & radio",
  desc: "If the keyboard is idle for a while, a skin-themed slideshow and matching radio start. The first keypress closes it and is not counted as typing.",
  after: "After minutes",
  off: "Off",
  min: "{0} min",
  radio: "Skin radio",
  radio_desc: "A station is picked by the skin's genres; volume fades in to ~30%. If radio is already playing, it is left alone.",
  keep: "Keep radio",
  stop: "Stop radio",
  after_close: "After closing",
  source: "Image source",
  auto: "Auto",
  src_wiki: "Wikimedia Commons — free, no key (default).",
  src_unsplash_on: "Unsplash — key configured on the server.",
  src_unsplash_off: "Unsplash — no key. Get a free one at unsplash.com/developers → UNSPLASH_ACCESS_KEY=… in backend/.env (server-side only).",
  src_pexels: "Pexels — key issuance is currently paused; if you have one: PEXELS_API_KEY in backend/.env.",
  src_paid: "Paid services (later):",
  try: "Show now",
  hint: "Any key — back",
  photo: "Photo",
  help: "Idle: after N minutes without keyboard (Settings → More) a skin-themed slideshow and radio start. Any key closes it; that keypress is not typed. Images: Wikimedia Commons (or Unsplash if a server key is set), author and license shown in the corner.",
};
const UK: D = {
  ...EN,
  title: "Простій: слайдшоу і радіо",
  desc: "Якщо довго не торкатися клавіатури, вмикається слайдшоу в стилі скіна та радіо тієї ж тематики. Перше натискання закриває його і не зараховується в набір.",
  after: "Через скільки хвилин",
  off: "Вимк",
  min: "{0} хв",
  radio: "Радіо під скін",
  keep: "Залишити радіо",
  stop: "Вимкнути радіо",
  after_close: "Після закриття",
  source: "Джерело картинок",
  auto: "Авто",
  try: "Показати зараз",
  hint: "Будь-яка клавіша — повернутися",
  photo: "Фото",
};
const DE: D = {
  ...EN,
  title: "Leerlauf: Diashow & Radio",
  desc: "Bleibt die Tastatur eine Weile unberührt, starten eine Diashow im Stil des Skins und passendes Radio. Der erste Tastendruck schließt sie und zählt nicht als Eingabe.",
  after: "Nach Minuten",
  off: "Aus",
  min: "{0} Min",
  radio: "Skin-Radio",
  keep: "Radio weiterlaufen",
  stop: "Radio stoppen",
  after_close: "Nach dem Schließen",
  source: "Bildquelle",
  auto: "Auto",
  try: "Jetzt zeigen",
  hint: "Beliebige Taste — zurück",
  photo: "Foto",
};
const ALL: Record<string, D> = { ru: RU, uk: UK, en: EN, de: DE };

export function ti(key: string, ...args: (string | number)[]): string {
  let s = (ALL[getLang()] || EN)[key] ?? EN[key] ?? key;
  args.forEach((a, i) => (s = s.replace(`{${i}}`, String(a))));
  return s;
}
export const IDLE_DICTS = ALL;
