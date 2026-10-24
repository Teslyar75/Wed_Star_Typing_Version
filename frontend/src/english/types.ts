/** Общие типы вкладки АНГЛИЙСКИЙ. */

export type EnPage =
  | "overview"
  | "sets"
  | "scanner"
  | "practice"
  | "review"
  | "warehouse"
  | "book"
  | "lists"
  | "log"
  | "settings";

export type EnWord = {
  id: number;
  word: string;
  translation: string;
  example: string;
  slug?: string;
  rank?: number;
  pos?: string;
  difficulty?: string;
  definition?: string;
  ipa?: string;
  respelling?: string;
  guide?: string;
  notes?: string[];
  example_ru?: string;
  sentences?: { en: string; ru?: string | null }[];
  sets?: string[];
  my_tr?: string;
  known?: boolean;
  wh_state?: string;
  wh_runs?: number;
  wh_goal?: number;
  wh_stars?: number;
  wh_avg?: number;
  sounds_like?: string[];
  wh_current?: Record<string, number>;
  wh_sel?: boolean[];
};

export type EnProgress = {
  xp: number;
  rank: string;
  favorite: number;
  learned: number;
  inbox: number;
  due: number;
  streak_days?: number;
  best_streak?: number;
  day_flags?: boolean[];
  daily_goal?: number;
  xp_today?: number;
  new_available?: number;
  level?: number;
  level_lo?: number;
  level_hi?: number;
  vocab_total?: number;
};

export type EnSettings = {
  tts_rate: number;
  auto_speak: boolean;
  asr: boolean;
  self_score: boolean;
  current_set: string;
  daily_goal: number;
  new_per_day: number;
  mission_len: number;
  reverse_cards: boolean;
  xp_to_rank: boolean;
  warehouse_passes: number;
};

export type MissionTask = {
  type: string;
  title: string;
  word_id: number;
  word: string;
  translation: string;
  definition?: string;
  pos?: string;
  sentence?: { en: string; ru?: string };
  cloze?: string;
  options?: string[];
  answer?: number;
  prompt?: string;
  revealed?: number;
};
