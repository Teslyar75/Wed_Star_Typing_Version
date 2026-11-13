/** F1 на экране «ВХОД В КАБИНУ»: полное описание по текущему режиму. */
import { getLang } from "../i18n";
import { voiceLookup } from "../theme/voice";

export type EntryView = "roster" | "first" | "wizard" | "import" | "honor";
type Sec = { h: string; p: string[] };

const RU: Record<EntryView | "keys", Sec[]> = {
  roster: [
    { h: "Что это", p: ["Экран выбора пилота. У каждого пилота свой прогресс: карточки английского, склад, статистика полётов, миссии, библиотека, избранные станции радио и скин кабины.", "Данные хранятся на сервере веб-версии, поэтому пилот доступен из любого браузера."] },
    { h: "Карточка пилота", p: ["Эмблема и цвет, позывной, звание и полоса опыта до следующего звания. 🔒 — вход по коду доступа.", "Справа — подробности выбранного пилота: полёты, лучшая скорость, последний вход и ряд иконок скинов."] },
    { h: "Вход", p: ["Enter или кнопка «ВЗЛЁТ». Если у пилота есть код, курсор встаёт в поле кода — просто наберите цифры и Enter.", "После 3 неверных кодов ввод блокируется на 30 с, затем пауза растёт (до 5 минут). Перебор кода бессмыслен.", "Код, заданный в десктопе и перенесённый сюда, работает как есть."] },
    { h: "Скин", p: ["Скин выбирается иконками справа (или S / Shift+S). Превью меняется сразу. Для пилота без кода или после входа скин сохраняется в профиль пилота и включается при каждом его входе.", "Скин — это целый мир: меняются не только цвета, но и формы панелей и кнопок, шрифты, звуки и слова интерфейса (например, в «Старой Англии» вы клерк редакции на Флит-стрит, а «ВЗЛЁТ» — «В ПУТЬ!»)."] },
    { h: "Новый пилот, перенос, гость", p: ["N — зачислить нового пилота (мастер из 3 шагов).", "I — перенести пилотов с десктопа (.stpilot, zip или папка %APPDATA%\\Stamina).", "G — полетать гостем: прогресс не переносится между устройствами."] },
    { h: "Списание", p: ["Del — списать пилота. Нужно ввести его позывной. Пилота с кодом можно списать, только войдя в него."] },
  ],
  first: [
    { h: "Первый запуск", p: ["Экипаж пуст. Три пути: создать пилота, перенести существующих пилотов с десктопа или полетать гостем.", "1 / 2 / 3 или стрелки + Enter."] },
  ],
  wizard: [
    { h: "Шаг 1 — позывной", p: ["Позывной — 2–16 символов: буквы (рус/укр/лат), цифры, пробел, дефис. Он виден в экипаже и на доске почёта.", "Имя — необязательно, показывается под позывным."] },
    { h: "Шаг 2 — эмблема и цвет", p: ["16 эмблем — те же, что в десктопе. ←→ — эмблема, Tab — к цветам, ←→ — цвет."] },
    { h: "Шаг 3 — скин и код", p: ["Скин — оформление кабины: Звездолёт, Батискаф, Стимпанк, Скрипторий, Неон-Сити, Сад дзен, Старая Англия. Превью справа меняется сразу.", "Код доступа необязателен (4–8 цифр). Без кода пилота может открыть любой, кто сидит за этим браузером."] },
    { h: "Клавиши", p: ["Enter — далее / зачислить, Esc — шаг назад, Tab — следующее поле."] },
  ],
  import: [
    { h: "Перенос по имени", p: ["Главный путь: введите позывной, под которым летали в десктопной версии, и PIN/код доступа. Данные читаются с этого же компьютера (папка %APPDATA%\\Stamina) только для чтения.", "Сначала войдите в своего веб-пилота: прогресс перенесётся в него. Если позывные различаются, перенос попросит подтверждение — прогресс пойдёт в текущего веб-пилота.", "Когда данные собраны, вы увидите отчёт: опыт, слова, карточки, полёты, библиотека."] },
    { h: "Файловый запасной путь", p: ["Кнопка «Другой способ» (F) открывает прежний импорт: .stpilot, zip или папку %APPDATA%\\Stamina целиком.", "Превью по-прежнему ничего не записывает до подтверждения; повреждённый .stpilot не принимается."] },
    { h: "Ошибки", p: ["desktop_data_unavailable — на сервере нет доступа к папке десктопа (запустите локально start-скриптом).", "bad_pin / pin_locked — неверный код или слишком много попыток; not_found — позывной не найден; callsign_mismatch — разные позывные."] },
    { h: "Что переносится", p: ["Английский: карточки повторения (SM-2), «знаю», свои переводы, отсеки и избранное, склад, попытки с микрофоном, опыт.", "Набор: забеги, статистика клавиш, миссии, опыт и звание. Скорочтение, радио, библиотека, Lounge и Шульте.", "Кэши (idle_cache, vocab_lazy_v1, backups, cache, logs) не читаются. Повторный перенос не создаёт дублей."] },
  ],
  honor: [{ h: "Доска почёта", p: ["Пилоты по опыту, лучшей скорости и числу полётов. Esc или H — назад."] }],
  keys: [
    { h: "Все клавиши экрана", p: ["←→↑↓ — выбор пилота · PgUp/PgDn — страница · Enter — взлёт · цифры — код", "N — новый · I — перенос · G — гость · S / Shift+S — скин · H — доска почёта · Del — списать", "F1 — эта справка · Esc — назад / закрыть"] },
  ],
};

const UK: typeof RU = {
  roster: [
    { h: "Що це", p: ["Екран вибору пілота. У кожного пілота свій прогрес: картки англійської, склад, статистика польотів, місії, бібліотека, обрані радіостанції та скін кабіни.", "Дані зберігаються на сервері веб-версії, тож пілот доступний з будь-якого браузера."] },
    { h: "Картка пілота", p: ["Емблема і колір, позивний, звання і смуга досвіду. 🔒 — вхід за кодом.", "Праворуч — подробиці: польоти, найкраща швидкість, останній вхід і ряд іконок скінів."] },
    { h: "Вхід", p: ["Enter або «ЗЛІТ». Якщо є код — курсор у полі коду, наберіть цифри й Enter.", "Після 3 невірних кодів введення блокується на 30 с, далі пауза зростає (до 5 хв).", "Код із десктопа, перенесений сюди, працює як є."] },
    { h: "Скін", p: ["Іконки праворуч (або S / Shift+S). Прев'ю змінюється одразу; після входу скін зберігається у профілі пілота."] },
    { h: "Новий пілот, перенос, гість", p: ["N — новий пілот (3 кроки). I — перенести з десктопа. G — гість."] },
    { h: "Списання", p: ["Del — списати пілота (введіть позивний). Пілота з кодом можна списати лише увійшовши в нього."] },
  ],
  first: [{ h: "Перший запуск", p: ["Екіпаж порожній: створити пілота, перенести з десктопа або політати гостем. 1 / 2 / 3 або стрілки + Enter."] }],
  wizard: [
    { h: "Крок 1 — позивний", p: ["2–16 символів: літери, цифри, пробіл, дефіс. Ім'я — необов'язково."] },
    { h: "Крок 2 — емблема і колір", p: ["16 емблем, як у десктопі. ←→ — вибір, Tab — до кольорів."] },
    { h: "Крок 3 — скін і код", p: ["Скін — оформлення кабіни, прев'ю змінюється одразу. Код (4–8 цифр) — необов'язковий."] },
    { h: "Клавіші", p: ["Enter — далі, Esc — назад, Tab — наступне поле."] },
  ],
  import: [
    { h: "Перенесення за іменем", p: ["Головний шлях: введіть позивний, під яким літали в десктопній версії, і PIN/код доступу. Дані читаються з цього ж комп'ютера (тека %APPDATA%\\Stamina) лише для читання.", "Спершу увійдіть у свого веб-пілота: прогрес перенесеться в нього. Якщо позивні різняться, перенесення попросить підтвердження — прогрес піде в поточного веб-пілота.", "Після збору даних буде звіт: досвід, слова, картки, польоти, бібліотека."] },
    { h: "Файловий запасний шлях", p: ["Кнопка «Інший спосіб» (F) відкриває попередній імпорт: .stpilot, zip або теку %APPDATA%\\Stamina цілком.", "Прев'ю нічого не записує до підтвердження; пошкоджений .stpilot не приймається."] },
    { h: "Помилки", p: ["desktop_data_unavailable — сервер не бачить теки десктопа (запустіть локально start-скриптом).", "bad_pin / pin_locked — невірний код або забагато спроб; not_found — позивний не знайдено; callsign_mismatch — різні позивні."] },
    { h: "Що переноситься", p: ["Англійська: картки SM-2, «знаю», свої переклади, відсіки, склад, спроби з мікрофоном, досвід. Набір: забіги, клавіші, місії, досвід. Швидкочитання, радіо, бібліотека, Lounge і Шульте.", "Кеші (idle_cache, vocab_lazy_v1, backups, cache, logs) не читаються. Повторне перенесення не створює дублів."] },
  ],
  honor: [{ h: "Дошка пошани", p: ["Пілоти за досвідом, швидкістю і польотами. Esc або H — назад."] }],
  keys: [{ h: "Усі клавіші", p: ["←→↑↓ вибір · PgUp/PgDn сторінка · Enter зліт · цифри — код", "N новий · I перенос · G гість · S/Shift+S скін · H пошана · Del списати", "F1 довідка · Esc назад"] }],
};

const EN: typeof RU = {
  roster: [
    { h: "What is this", p: ["Pilot selection. Each pilot has its own progress: English cards, warehouse, flight stats, missions, library, favorite radio stations and cockpit skin.", "Data lives on the web server, so a pilot is available from any browser."] },
    { h: "Pilot card", p: ["Emblem and color, callsign, rank and XP bar. 🔒 means an access code.", "The right panel shows details: flights, best speed, last seen and the skin icons."] },
    { h: "Entering", p: ["Enter or TAKE OFF. With a code, the cursor jumps to the code field — type digits and Enter.", "After 3 wrong codes input is locked for 30 s, then longer (up to 5 min).", "A code set on desktop and brought here works as is."] },
    { h: "Skin", p: ["Pick with the icons (or S / Shift+S). The preview changes instantly; after entering it is saved to the pilot."] },
    { h: "New, import, guest", p: ["N — enroll (3-step wizard). I — bring pilots from desktop. G — fly as guest."] },
    { h: "Dismiss", p: ["Del — dismiss a pilot (type the callsign). A PIN-protected pilot can be dismissed only from inside."] },
  ],
  first: [{ h: "First launch", p: ["The crew is empty: create a pilot, bring pilots from desktop, or fly as a guest. 1 / 2 / 3 or arrows + Enter."] }],
  wizard: [
    { h: "Step 1 — callsign", p: ["2–16 chars: letters, digits, space, hyphen. Name is optional."] },
    { h: "Step 2 — emblem & color", p: ["16 emblems, same as desktop. ←→ pick, Tab to colors."] },
    { h: "Step 3 — skin & code", p: ["Skin is the cockpit look; preview updates instantly. A skin is a whole world: shapes, fonts, sounds and interface words change too (e.g. “Old England” — a Fleet Street newsroom clerk). Code (4–8 digits) is optional."] },
    { h: "Keys", p: ["Enter next, Esc back, Tab next field."] },
  ],
  import: [
    { h: "Transfer by name", p: ["Main path: enter the callsign you used on desktop and its PIN/access code. Data is read from this machine’s %APPDATA%\\Stamina folder, read-only.", "Enter your web pilot first: progress is merged into it. If the callsigns differ, the transfer asks for confirmation and goes into the current web pilot.", "When the package is collected you will see a report: XP, words, cards, flights, library."] },
    { h: "File fallback", p: ["The “Other way” button (F) opens the previous import: .stpilot, zip or the whole %APPDATA%\\Stamina folder.", "Preview still writes nothing before confirmation; a corrupted .stpilot is rejected."] },
    { h: "Errors", p: ["desktop_data_unavailable — the server cannot see the desktop folder (run locally with the start script).", "bad_pin / pin_locked — wrong code or too many attempts; not_found — callsign not found; callsign_mismatch — different callsigns."] },
    { h: "What is carried over", p: ["English: SM-2 cards, known words, own translations, compartments, warehouse, mic attempts, XP. Typing: runs, key stats, missions, XP. Speed reading, radio, library, Lounge and Schulte.", "Caches (idle_cache, vocab_lazy_v1, backups, cache, logs) are skipped. Repeating the transfer never duplicates rows."] },
  ],
  honor: [{ h: "Honor board", p: ["Pilots by XP, best speed and flights. Esc or H — back."] }],
  keys: [{ h: "All keys", p: ["←→↑↓ select · PgUp/PgDn page · Enter take off · digits — code", "N new · I import · G guest · S/Shift+S skin · H honor · Del dismiss", "F1 help · Esc back"] }],
};

const DE: typeof RU = {
  roster: [
    { h: "Was ist das", p: ["Pilotenauswahl. Jeder Pilot hat eigenen Fortschritt: Englisch-Karten, Lager, Flugstatistik, Missionen, Bibliothek, Lieblingssender und Cockpit-Skin.", "Die Daten liegen auf dem Webserver — der Pilot ist in jedem Browser verfügbar."] },
    { h: "Pilotenkarte", p: ["Emblem und Farbe, Rufzeichen, Rang und XP-Balken. 🔒 = Zugangscode.", "Rechts: Flüge, Bestes Tempo, zuletzt, Skin-Symbole."] },
    { h: "Einstieg", p: ["Enter oder START. Mit Code springt der Cursor ins Codefeld — Ziffern tippen, Enter.", "Nach 3 Fehlern 30 s Sperre, danach länger (bis 5 min).", "Ein am Desktop gesetzter Code funktioniert unverändert."] },
    { h: "Skin", p: ["Symbole rechts (oder S / Shift+S). Vorschau sofort; nach dem Einstieg wird er beim Piloten gespeichert."] },
    { h: "Neu, Import, Gast", p: ["N — anmelden (3 Schritte). I — vom Desktop übernehmen. G — als Gast."] },
    { h: "Entlassen", p: ["Entf — Pilot entlassen (Rufzeichen eingeben). Mit Code nur von innen."] },
  ],
  first: [{ h: "Erster Start", p: ["Die Crew ist leer: Pilot anlegen, vom Desktop übernehmen oder als Gast fliegen. 1 / 2 / 3 oder Pfeile + Enter."] }],
  wizard: [
    { h: "Schritt 1 — Rufzeichen", p: ["2–16 Zeichen: Buchstaben, Ziffern, Leerzeichen, Bindestrich. Name optional."] },
    { h: "Schritt 2 — Emblem & Farbe", p: ["16 Embleme wie am Desktop. ←→ wählen, Tab zu Farben."] },
    { h: "Schritt 3 — Skin & Code", p: ["Skin = Cockpit-Look, Vorschau sofort. Code (4–8 Ziffern) optional."] },
    { h: "Tasten", p: ["Enter weiter, Esc zurück, Tab nächstes Feld."] },
  ],
  import: [
    { h: "Übernahme nach Namen", p: ["Hauptweg: Rufzeichen aus der Desktop-Version und PIN/Zugangscode eingeben. Gelesen wird der Ordner %APPDATA%\\Stamina dieses Rechners — nur lesend.", "Zuerst als eigener Web-Pilot einsteigen: der Fortschritt wird dort zusammengeführt. Bei abweichenden Rufzeichen wird die Übernahme bestätigt und geht in den aktuellen Web-Piloten.", "Danach erscheint ein Bericht: XP, Wörter, Karten, Flüge, Bibliothek."] },
    { h: "Datei-Ersatzweg", p: ["Die Schaltfläche „Anderer Weg“ (F) öffnet den bisherigen Import: .stpilot, ZIP oder den ganzen Ordner %APPDATA%\\Stamina.", "Die Vorschau schreibt nichts vor der Bestätigung; beschädigte .stpilot werden abgelehnt."] },
    { h: "Fehler", p: ["desktop_data_unavailable — der Server sieht den Desktop-Ordner nicht (lokal mit Startskript starten).", "bad_pin / pin_locked — falscher Code oder zu viele Versuche; not_found — Rufzeichen nicht gefunden; callsign_mismatch — verschiedene Rufzeichen."] },
    { h: "Was übernommen wird", p: ["Englisch: SM-2-Karten, bekannte Wörter, eigene Übersetzungen, Fächer, Lager, Mikrofonversuche, XP. Tippen: Läufe, Tastenstatistik, Missionen, XP. Schnelllesen, Radio, Bibliothek, Lounge und Schulte.", "Caches (idle_cache, vocab_lazy_v1, backups, cache, logs) werden übersprungen. Wiederholte Übernahme erzeugt keine Duplikate."] },
  ],
  honor: [{ h: "Ehrentafel", p: ["Piloten nach XP, Tempo und Flügen. Esc oder H — zurück."] }],
  keys: [{ h: "Alle Tasten", p: ["←→↑↓ wählen · Bild↑/↓ Seite · Enter Start · Ziffern — Code", "N neu · I Import · G Gast · S/Shift+S Skin · H Ehre · Entf entlassen", "F1 Hilfe · Esc zurück"] }],
};

const ALL: Record<string, typeof RU> = { ru: RU, uk: UK, en: EN, de: DE };

export function entryHelp(view: EntryView): Sec[] {
  const d = ALL[getLang()] || EN;
  const skin = voiceLookup("skin.help", getLang());
  return [...d[view], ...(skin ? [{ h: "☎ / ✦", p: [skin] }] : []), ...d.keys];
}
export const ENTRY_HELP = ALL;
