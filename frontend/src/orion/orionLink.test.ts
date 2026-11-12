import { describe, expect, it } from "vitest";
import { deriveLinkView, listLinkTone, reasonLabelKey, reasonTipKey } from "./orionLink";
import type { CrewAgent, OrionConfig } from "./orionApi";

const baseCfg = (opencodeAvailable: boolean, reason = "bridge_down"): OrionConfig => ({
  mode: "guide",
  modes: [{ id: "guide", available: true, reason: "", capabilities: { text: true, images: false } }],
  roles: [],
  logged_in: true,
  pilot: "Test",
  max_images: 3,
  max_image_bytes: 2_000_000,
  opencode: {
    available: opencodeAvailable,
    cli: opencodeAvailable ? "/usr/bin/opencode" : "",
    model: "opencode/deepseek-v4.1-flash-free",
    reason: opencodeAvailable ? "" : reason,
  },
});

const orion: CrewAgent = {
  id: 1,
  agent_id: "orion",
  name: "Орион",
  kind: "opencode",
  access: "commander",
  enabled: true,
  provider: "openai",
  base_url: "",
  model: "opencode/deepseek-v4.1-flash-free",
  vision: false,
  manners: "",
  note: "",
  voice: "ship",
  needs_key: false,
};

describe("orion link indicator", () => {
  it("green when opencode.available=true", () => {
    const v = deriveLinkView({ cfg: baseCfg(true), agent: orion, health: { available: true, reason: "" } });
    expect(v.tone).toBe("ok");
    expect(v.labelKey).toBe("link_ok");
  });

  it("red when opencode.available=false with bridge_down", () => {
    const v = deriveLinkView({
      cfg: baseCfg(false, "bridge_down"),
      agent: orion,
      health: { available: false, reason: "bridge_down" },
    });
    expect(v.tone).toBe("down");
    expect(v.reason).toBe("bridge_down");
    expect(reasonLabelKey(v.reason)).toBe("link_r_bridge_down");
    expect(reasonTipKey(v.reason)).toBe("link_tip_bridge");
  });

  it("yellow while checking or busy", () => {
    expect(deriveLinkView({ cfg: baseCfg(true), agent: orion, health: null, checking: true }).tone).toBe("busy");
    expect(deriveLinkView({ cfg: baseCfg(true), agent: orion, health: { available: true, reason: "" }, busy: true }).tone).toBe("busy");
  });

  it("grey when agent off or missing", () => {
    expect(deriveLinkView({ cfg: baseCfg(true), agent: { ...orion, enabled: false }, health: null }).tone).toBe("off");
    expect(deriveLinkView({ cfg: baseCfg(true), agent: null, health: null }).tone).toBe("off");
  });

  it("listLinkTone mirrors config for opencode", () => {
    expect(listLinkTone(orion, baseCfg(true), false)).toBe("ok");
    expect(listLinkTone(orion, baseCfg(false), false)).toBe("down");
  });
});
