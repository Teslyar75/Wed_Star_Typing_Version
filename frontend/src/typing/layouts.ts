/** Упрощённый порт stamina/layouts.py — подсветка клавиш EN/RU. */

type Key = [id: string, en: string, ru: string, width: number, finger: number];

export const ROWS: Key[][] = [
  [
    ["`", "`", "ё", 1, 0], ["1", "1", "1", 1, 0], ["2", "2", "2", 1, 1], ["3", "3", "3", 1, 2],
    ["4", "4", "4", 1, 3], ["5", "5", "5", 1, 3], ["6", "6", "6", 1, 4], ["7", "7", "7", 1, 4],
    ["8", "8", "8", 1, 5], ["9", "9", "9", 1, 6], ["0", "0", "0", 1, 7], ["-", "-", "-", 1, 7],
    ["=", "=", "=", 1, 7], ["bksp", "⌫", "⌫", 2, 9],
  ],
  [
    ["tab", "Tab", "Tab", 1.5, 9], ["q", "Q", "Й", 1, 0], ["w", "W", "Ц", 1, 1], ["e", "E", "У", 1, 2],
    ["r", "R", "К", 1, 3], ["t", "T", "Е", 1, 3], ["y", "Y", "Н", 1, 4], ["u", "U", "Г", 1, 4],
    ["i", "I", "Ш", 1, 5], ["o", "O", "Щ", 1, 6], ["p", "P", "З", 1, 7], ["[", "[", "Х", 1, 7],
    ["]", "]", "Ъ", 1, 7], ["\\", "\\", "\\", 1.5, 7],
  ],
  [
    ["caps", "Caps", "Caps", 1.75, 9], ["a", "A", "Ф", 1, 0], ["s", "S", "Ы", 1, 1], ["d", "D", "В", 1, 2],
    ["f", "F", "А", 1, 3], ["g", "G", "П", 1, 3], ["h", "H", "Р", 1, 4], ["j", "J", "О", 1, 4],
    ["k", "K", "Л", 1, 5], ["l", "L", "Д", 1, 6], [";", ";", "Ж", 1, 7], ["'", "'", "Э", 1, 7],
    ["enter", "Enter", "Enter", 2.25, 9],
  ],
  [
    ["lshift", "Shift", "Shift", 2.25, 9], ["z", "Z", "Я", 1, 0], ["x", "X", "Ч", 1, 1], ["c", "C", "С", 1, 2],
    ["v", "V", "М", 1, 3], ["b", "B", "И", 1, 3], ["n", "N", "Т", 1, 4], ["m", "M", "Ь", 1, 4],
    [",", ",", "Б", 1, 5], [".", ".", "Ю", 1, 6], ["/", "/", ".", 1, 7], ["rshift", "Shift", "Shift", 2.75, 9],
  ],
  [
    ["lctrl", "Ctrl", "Ctrl", 1.5, 9], ["lwin", "Win", "Win", 1.25, 9], ["lalt", "Alt", "Alt", 1.25, 9],
    ["space", "", "", 7, 8], ["ralt", "Alt", "Alt", 1.25, 9], ["rwin", "Win", "Win", 1.25, 9],
    ["rctrl", "Ctrl", "Ctrl", 1.5, 9],
  ],
];

const CHAR_TO_KEY: Record<string, string> = { " ": "space" };
for (const row of ROWS) {
  for (const [kid, en, ru, , f] of row) {
    if (f === 9 || kid === "space") continue;
    CHAR_TO_KEY[en.toLowerCase()] ??= kid;
    if (ru !== en) CHAR_TO_KEY[ru.toLowerCase()] ??= kid;
  }
}

const SHIFTED_EN: Record<string, string> = {
  "~": "`", "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7",
  "*": "8", "(": "9", ")": "0", _: "-", "+": "=", "{": "[", "}": "]", "|": "\\",
  ":": ";", '"': "'", "<": ",", ">": ".", "?": "/",
};

const PUNCT_RU: Record<string, [string, boolean]> = {
  ".": ["/", false], ",": ["/", true], "!": ["1", true], '"': ["2", true],
  "№": ["3", true], ";": ["4", true], "%": ["5", true], ":": ["6", true],
  "?": ["7", true], "*": ["8", true], "(": ["9", true], ")": ["0", true],
};

export function keyForChar(char: string | null, lang = "en"): string | null {
  if (!char) return null;
  if (lang === "ru" && char in PUNCT_RU) return PUNCT_RU[char]![0];
  if (char in SHIFTED_EN) return SHIFTED_EN[char]!;
  return CHAR_TO_KEY[char.toLowerCase()] ?? null;
}

/** Cyrillic letter — для подсказки смены раскладки при ошибке. */
export function isCyrillic(ch: string): boolean {
  return /[\u0400-\u04FF]/.test(ch);
}

export const FINGER_COLORS = [
  "#FF4FA3", "#FFD84A", "#4CFF8F", "#2ED8FF", "#B76BFF", "#4CFF8F", "#FFD84A", "#FF4FA3", "#8FA6BF", "#4A6580",
];

/** stamina/layouts.HOME_BUMPS — рисочки на F/J */
export const HOME_BUMPS = new Set(["f", "j"]);

export const MOD_FINGER = 9;
