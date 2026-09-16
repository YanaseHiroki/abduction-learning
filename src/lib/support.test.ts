import { describe, expect, it } from "vitest";
import { hasSupportLinks, SUPPORT_GITHUB, SUPPORT_KOFI } from "./support";

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
