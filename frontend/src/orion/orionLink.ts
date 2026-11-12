/** Статус связи с бортовым ИИ-агентом (зелёный / жёлтый / красный / серый). */
import type { CrewAgent, OrionConfig } from "./orionApi";

export type LinkTone = "ok" | "busy" | "down" | "off";

export type OrionHealth = {
  available: boolean;
  reason: string;
  state?: string;
  kind?: string;
  agent_id?: string;
  cached?: boolean;
};

export type LinkView = {
  tone: LinkTone;
  reason: string;
  labelKey: string;
  tipKey: string;
};

/** Человекочитаемая причина → ключ i18n. */
export function reasonLabelKey(reason: string): string {
  const map: Record<string, string> = {
    bridge_down: "link_r_bridge_down",
    no_cli: "link_r_no_cli",
    no_key: "link_r_no_key",
    no_url: "link_r_no_url",
    bad_key: "link_r_bad_key",
    bad_url: "link_r_bad_url",
    timeout: "link_r_timeout",
    provider_error: "link_r_provider",
    agent_off: "link_r_off",
    no_agent: "link_r_none",
    login: "link_r_login",
    github_bridge_later: "link_r_github",
    agent_not_configured: "link_r_no_key",
    byo_not_configured: "link_r_no_key",
    opencode_bridge_down: "link_r_bridge_down",
    opencode_timeout: "link_r_timeout",
  };
  return map[reason] || (reason ? "link_r_unknown" : "link_r_ok");
}

/** Подсказка «как починить» для красного индикатора. */
export function reasonTipKey(reason: string): string {
  const map: Record<string, string> = {
    bridge_down: "link_tip_bridge",
    opencode_bridge_down: "link_tip_bridge",
    no_cli: "link_tip_cli",
    no_key: "link_tip_key",
    bad_key: "link_tip_key",
    agent_not_configured: "link_tip_key",
    byo_not_configured: "link_tip_key",
    no_url: "link_tip_url",
    bad_url: "link_tip_url",
    timeout: "link_tip_timeout",
    opencode_timeout: "link_tip_timeout",
    provider_error: "link_tip_provider",
    login: "link_tip_login",
    agent_off: "link_tip_off",
    no_agent: "link_tip_none",
    github_bridge_later: "link_tip_github",
  };
  return map[reason] || "link_tip_generic";
}

export function deriveLinkView(opts: {
  cfg: OrionConfig | null;
  agent: CrewAgent | null | undefined;
  health: OrionHealth | null;
  busy?: boolean;
  checking?: boolean;
  chatReason?: string;
}): LinkView {
  const { cfg, agent, health, busy, checking, chatReason } = opts;
  if (!cfg?.logged_in) {
    return { tone: "off", reason: "login", labelKey: reasonLabelKey("login"), tipKey: reasonTipKey("login") };
  }
  if (!agent) {
    return { tone: "off", reason: "no_agent", labelKey: reasonLabelKey("no_agent"), tipKey: reasonTipKey("no_agent") };
  }
  if (!agent.enabled) {
    return { tone: "off", reason: "agent_off", labelKey: reasonLabelKey("agent_off"), tipKey: reasonTipKey("agent_off") };
  }
  if (busy || checking) {
    const reason = health?.reason || "";
    return {
      tone: "busy",
      reason,
      labelKey: busy ? "link_busy" : "link_checking",
      tipKey: reason ? reasonTipKey(reason) : "link_checking",
    };
  }

  // Мгновенный сигнал после ошибки чата
  if (chatReason) {
    return {
      tone: "down",
      reason: chatReason,
      labelKey: reasonLabelKey(chatReason),
      tipKey: reasonTipKey(chatReason),
    };
  }

  if (agent.kind === "opencode") {
    const oc = cfg.opencode;
    const available = health?.available ?? oc?.available ?? false;
    const reason = available ? "" : (health?.reason || oc?.reason || "bridge_down");
    return {
      tone: available ? "ok" : "down",
      reason,
      labelKey: available ? "link_ok" : reasonLabelKey(reason),
      tipKey: available ? "link_ok" : reasonTipKey(reason),
    };
  }

  if (agent.kind === "github_bridge") {
    return {
      tone: "down",
      reason: "github_bridge_later",
      labelKey: reasonLabelKey("github_bridge_later"),
      tipKey: reasonTipKey("github_bridge_later"),
    };
  }

  // openai_compat
  if (health) {
    const available = !!health.available;
    const reason = available ? "" : (health.reason || "provider_error");
    return {
      tone: available ? "ok" : "down",
      reason,
      labelKey: available ? "link_ok" : reasonLabelKey(reason),
      tipKey: available ? "link_ok" : reasonTipKey(reason),
    };
  }

  if (agent.needs_key) {
    return {
      tone: "busy",
      reason: "",
      labelKey: "link_checking",
      tipKey: "link_checking",
    };
  }

  return { tone: "busy", reason: "", labelKey: "link_checking", tipKey: "link_checking" };
}

/** Локальная оценка для строки списка (без remote probe). */
export function listLinkTone(agent: CrewAgent, cfg: OrionConfig, hasKey: boolean): LinkTone {
  if (!agent.enabled) return "off";
  if (agent.kind === "opencode") return cfg.opencode?.available ? "ok" : "down";
  if (agent.kind === "github_bridge") return "down";
  if (agent.kind === "openai_compat") return hasKey ? "ok" : "down";
  return "off";
}
