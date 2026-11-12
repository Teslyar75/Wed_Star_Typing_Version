import { useCallback, useEffect, useRef, useState } from "react";
import { loadAgentKey, orionApi, type CrewAgent, type OrionConfig } from "./orionApi";
import { deriveLinkView, type LinkView, type OrionHealth } from "./orionLink";

const POLL_MS = 20_000;

type Opts = {
  cfg: OrionConfig | null;
  agent: CrewAgent | null | undefined;
  busy?: boolean;
  /** Причина сбоя чата — мгновенно красный. */
  chatFailReason?: string;
  /** Успешный ответ чата без fallback — мгновенно зелёный. */
  chatOkTick?: number;
};

export function useOrionLink({ cfg, agent, busy, chatFailReason, chatOkTick }: Opts): {
  view: LinkView;
  health: OrionHealth | null;
  recheck: () => Promise<void>;
  markOk: () => void;
  markDown: (reason: string) => void;
} {
  const [health, setHealth] = useState<OrionHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [localFail, setLocalFail] = useState("");
  const [forceOk, setForceOk] = useState(false);
  const alive = useRef(true);

  const pull = useCallback(async (refresh = false) => {
    if (!cfg?.logged_in || !agent?.enabled) {
      setHealth(null);
      return;
    }
    setChecking(true);
    try {
      const key = loadAgentKey(cfg.pilot, agent.agent_id);
      const h = await orionApi.health(agent.agent_id, key, refresh);
      if (!alive.current) return;
      setHealth(h);
      if (h.available) setLocalFail("");
      setForceOk(false);
    } catch {
      if (!alive.current) return;
      setHealth({ available: false, reason: "provider_error", state: "down", agent_id: agent.agent_id });
    } finally {
      if (alive.current) setChecking(false);
    }
  }, [cfg?.logged_in, cfg?.pilot, agent?.agent_id, agent?.enabled]);

  useEffect(() => {
    alive.current = true;
    void pull(false);
    const tick = () => {
      if (document.hidden) return;
      void pull(false);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void pull(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pull]);

  useEffect(() => {
    if (chatFailReason) {
      setLocalFail(chatFailReason);
      setForceOk(false);
    }
  }, [chatFailReason]);

  useEffect(() => {
    if (chatOkTick) {
      setLocalFail("");
      setForceOk(true);
      setHealth((h) => (h ? { ...h, available: true, reason: "", state: "ok" } : { available: true, reason: "", state: "ok" }));
      // обновить cfg.opencode через лёгкий recheck
      void pull(true);
    }
  }, [chatOkTick, pull]);

  const recheck = useCallback(async () => {
    setLocalFail("");
    setForceOk(false);
    await pull(true);
  }, [pull]);

  const markOk = useCallback(() => {
    setLocalFail("");
    setForceOk(true);
  }, []);

  const markDown = useCallback((reason: string) => {
    setForceOk(false);
    setLocalFail(reason || "provider_error");
  }, []);

  const view = deriveLinkView({
    cfg,
    agent,
    health: forceOk && health ? { ...health, available: true, reason: "" } : health,
    busy: !!busy,
    checking: checking && !health && !localFail,
    chatReason: localFail,
  });

  // opencode: даже без /health опираемся на cfg.opencode
  const patched =
    agent?.kind === "opencode" && cfg && !localFail && !busy
      ? deriveLinkView({
          cfg,
          agent,
          health: forceOk ? { available: true, reason: "" } : health,
          busy: !!busy,
          checking: checking && !cfg.opencode && !health,
          chatReason: localFail,
        })
      : view;

  return { view: patched, health, recheck, markOk, markDown };
}
