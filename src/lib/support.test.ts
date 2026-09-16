import { describe, expect, it } from "vitest";
import { dailyBudget, hasSupportLinks, SUPPORT_GITHUB, SUPPORT_KOFI } from "./support";

/** The test env (vitest.config.ts) sets the GitHub link and leaves Ko-fi unset. */
describe("support links", () => {
  it("reads each link from the build environment, and leaves an unset one empty", () => {
    expect(SUPPORT_GITHUB).toBe("https://github.com/sponsors/test");
    expect(SUPPORT_KOFI).toBe("");
  });

  it("offers the support page as soon as one link is configured", () => {
    expect(hasSupportLinks()).toBe(true);
  });
});

describe("dailyBudget", () => {
  it("states the proxy's own spending cap when it reports one, since that is what stops the calls", () => {
    expect(dailyBudget({ global: { limit: 330 }, rules: { dailyBudgetUsd: 3 } })).toEqual({ usd: "3.00", capped: true });
  });

  it("estimates from the inquiry limit for an older proxy that sends no cap, in cents so a small one does not read as free", () => {
    expect(dailyBudget({ global: { limit: 50 }, rules: {} })).toEqual({ usd: "0.45", capped: false });
    expect(dailyBudget({ global: { limit: 50 }, rules: { dailyBudgetUsd: 0 } })).toEqual({ usd: "0.45", capped: false });
  });
});
