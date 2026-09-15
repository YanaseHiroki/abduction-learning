import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { DEMO_INQUIRY_ID, seedDemo } from "./demo";

/**
 * Development-only page (/#/dev/seed, not in production builds): replaces the local data with
 * the demo inquiry used for the help screenshots. `?lang=ja|en&auto=1` seeds without a click,
 * which is how scripts/help-shots.ts uses it.
 */
export default function SeedPage() {
  const [params] = useSearchParams();
  const [done, setDone] = useState<"ja" | "en" | null>(null);

  async function seed(lang: "ja" | "en") {
    await seedDemo(lang);
    setDone(lang);
  }

  useEffect(() => {
    if (params.get("auto") === "1") seed(params.get("lang") === "en" ? "en" : "ja");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-2 text-xl font-semibold">🧪 Demo data</h1>
      <p className="text-sm whitespace-pre-line text-muted-foreground">
        {"This replaces every inquiry and note in this browser with the demo inquiry.\nThe help screenshots are taken in this state."}
      </p>
      <ButtonRow className="pt-6">
        <Button variant="outline" onClick={() => seed("ja")}>🇯🇵 日本語の画面で入れる</Button>
        <Button variant="outline" onClick={() => seed("en")}>🇬🇧 Seed with the English screen</Button>
      </ButtonRow>
      {done && (
        <p data-seeded={done} className="pt-6 text-sm">
          ✅ Seeded ({done}). <Link className="underline" to="/">Home</Link> · <Link className="underline" to={`/inquiry/${DEMO_INQUIRY_ID}`}>Demo inquiry</Link> · <Link className="underline" to="/help">Help</Link>
        </p>
      )}
    </div>
  );
}
