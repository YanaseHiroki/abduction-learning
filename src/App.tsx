import { HashRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { BookMarked, Settings, Sprout } from "lucide-react";
import { Home } from "@/pages/Home";
import { InquiryPage } from "@/pages/InquiryPage";
import { Notes } from "@/pages/Notes";
import { SettingsPage } from "@/pages/SettingsPage";
import { BenchPage } from "@/pages/BenchPage";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Nav() {
  const t = useT();
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex shrink-0 items-center gap-1.5 rounded-md whitespace-nowrap px-2.5 py-1.5 text-sm", isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground");
  // Notes stay grayed out until the first one is saved (a summary card is where they come from).
  const noteCount = useLiveQuery(() => db.schemaNotes.count(), []);
  const notesLabel = <><BookMarked className="size-4" />{t({ ja: "気づきノート", en: "Notes" })}</>;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4 sm:gap-2">
        <Link to="/" className="mr-auto flex items-center gap-2 font-semibold whitespace-nowrap"><Sprout className="size-5 text-emerald-600" />Abduction Lab</Link>
        {noteCount ? (
          <NavLink to="/notes" className={item}>{notesLabel}</NavLink>
        ) : (
          <span role="link" aria-disabled="true" title={t({ ja: "まだノートがありません。まとめカードから保存できます。", en: "No notes yet. Save one from a summary card." })} className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md whitespace-nowrap px-2.5 py-1.5 text-sm text-muted-foreground opacity-50">{notesLabel}</span>
        )}
        <NavLink to="/settings" className={item}><Settings className="size-4" />{t({ ja: "設定", en: "Settings" })}</NavLink>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/inquiry/:id" element={<InquiryPage />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* unlinked developer page: model comparison for the free tier */}
          <Route path="/bench" element={<BenchPage />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
