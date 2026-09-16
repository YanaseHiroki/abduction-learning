import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COST_PER_INQUIRY_USD } from "@/lib/support";
import { candidates } from "./candidates";

const root = path.resolve(import.meta.dirname, "../../..");
const WRANGLER = "worker/wrangler.toml";
const BENCH_DOC = "docs/model-bench-2026-09.md";

/**
 * The [vars] of wrangler.toml, read line by line. The file only holds flat `KEY = "value"` strings
 * there, so a TOML parser would be a dependency for nothing.
 */
function wranglerVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  let inVars = false;
  for (const line of readFileSync(path.join(root, WRANGLER), "utf8").split("\n")) {
    const section = line.match(/^\s*\[+([^\]]+)\]+/);
    if (section) inVars = section[1].trim() === "vars";
    const kv = inVars && line.match(/^\s*([A-Z_]+)\s*=\s*"([^"]*)"/);
    if (kv) vars[kv[1]] = kv[2];
  }
  return vars;
}

describe("free-tier model and prices", () => {
  const vars = wranglerVars();
  const model = vars.MODEL;
  const row = candidates.find((c) => c.model === model);

  it("names a model the bench page compares", () => {
    expect(model, `${WRANGLER} has no MODEL in [vars]`).toBeTruthy();
    expect(row, `MODEL "${model}" in ${WRANGLER} is not in src/lib/llm/candidates.ts. Add it there with its price (and bench it on #/bench) before switching the Worker to it.`).toBeDefined();
    expect(vars.PROVIDER, `PROVIDER in ${WRANGLER} must be the provider of MODEL "${model}" in src/lib/llm/candidates.ts`).toBe(row!.provider);
  });

  // The Worker reserves and settles every call at these prices, so a stale one silently moves the
  // real spending cap away from DAILY_BUDGET_USD while the bench page keeps reporting the right costs.
  it("charges the Worker the same price the bench page uses", () => {
    const fix = `Set PRICE_INPUT_PER_M / PRICE_OUTPUT_PER_M in ${WRANGLER} and the "${model}" row in src/lib/llm/candidates.ts to the provider's current list price`;
    expect(Number(vars.PRICE_INPUT_PER_M), `input price differs. ${fix}`).toBe(row!.inputPrice);
    expect(Number(vars.PRICE_OUTPUT_PER_M), `output price differs. ${fix}`).toBe(row!.outputPrice);
  });

  // The support page explains the budget in inquiries with this average; it is measured, not derived
  // from the price, so the check is against the benchmark write-up it was copied from.
  it("explains the budget with the benchmarked cost per inquiry of that model", () => {
    const doc = readFileSync(path.join(root, BENCH_DOC), "utf8");
    const heading = doc.indexOf("## 探究1つあたりの概算");
    expect(heading, `${BENCH_DOC} no longer has the "## 探究1つあたりの概算" table; point COST_PER_INQUIRY_USD in src/lib/support.ts (and this test) at where the per-inquiry cost now lives`).toBeGreaterThanOrEqual(0);
    const section = doc.slice(heading).split(/\n## /)[0];
    const docRow = section.split("\n").find((l) => l.split("|")[1]?.trim() === model);
    expect(docRow, `${BENCH_DOC} has no per-inquiry cost for MODEL "${model}". Bench it on #/bench, add its row, and set COST_PER_INQUIRY_USD in src/lib/support.ts from it`).toBeDefined();
    const usd = Number(docRow!.split("|")[2]);
    expect(COST_PER_INQUIRY_USD, `COST_PER_INQUIRY_USD in src/lib/support.ts must be "${model}"'s USD / 探究 in ${BENCH_DOC}`).toBe(usd);
  });
});
