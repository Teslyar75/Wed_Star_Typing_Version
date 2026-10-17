import { describe, expect, it } from "vitest";
import { parseOrionCommand } from "./orionCommands";

describe("parseOrionCommand", () => {
  it("шутка", () => {
    expect(parseOrionCommand("дай шутку")).toBe("joke");
    expect(parseOrionCommand("Расскажи анекдот")).toBe("joke");
    expect(parseOrionCommand("joke please")).toBe("joke");
  });
  it("смена волны", () => {
    expect(parseOrionCommand("смени волну")).toBe("radio_next");
    expect(parseOrionCommand("переключи станцию")).toBe("radio_next");
    expect(parseOrionCommand("next station")).toBe("radio_next");
  });
  it("назад", () => {
    expect(parseOrionCommand("предыдущую волну")).toBe("radio_prev");
  });
  it("неизвестно", () => {
    expect(parseOrionCommand("")).toBe("unknown");
    expect(parseOrionCommand("какая погода")).toBe("unknown");
  });
});
