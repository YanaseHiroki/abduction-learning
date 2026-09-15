import { lazy, Suspense } from "react";
import { HashRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { CircleHelp, Settings, Sprout } from "lucide-react";
import { Home } from "@/pages/Home";
import { HelpPage } from "@/pages/HelpPage";
import { InquiryPage } from "@/pages/InquiryPage";
import { Notes } from "@/pages/Notes";
import { SettingsPage } from "@/pages/SettingsPage";
import { BenchPage } from "@/pages/BenchPage";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Demo data for the help screenshots; dropped from production builds.
const SeedPage = import.meta.env.DEV ? lazy(() => import("@/dev/SeedPage")) : null;

function Nav() {
  const t = useT();
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex shrink-0 items-center gap-1.5 rounded-md whitespace-nowrap px-2.5 py-1.5 text-sm", isActive ? "bg-white/15 font-medium" : "text-header-foreground/75 hover:text-header-foreground");
  return (
    <header className="sticky top-0 z-30 bg-header text-header-foreground">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4 sm:gap-2">
        <Link to="/" className="mr-auto flex items-center gap-2 font-semibold whitespace-nowrap"><Sprout className="size-5 text-lime-400" />Abduction Lab</Link>
        <NavLink to="/help" className={item}><CircleHelp className="size-4" />{t({ ja: "ヘルプ", en: "Help" })}</NavLink>
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
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* unlinked developer page: model comparison for the free tier */}
          <Route path="/bench" element={<BenchPage />} />
          {SeedPage && <Route path="/dev/seed" element={<Suspense><SeedPage /></Suspense>} />}
        </Routes>
      </main>
    </HashRouter>
  );
}
