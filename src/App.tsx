import { HashRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { BookMarked, Settings, Sprout } from "lucide-react";
import { Home } from "@/pages/Home";
import { InquiryPage } from "@/pages/InquiryPage";
import { Notes } from "@/pages/Notes";
import { SettingsPage } from "@/pages/SettingsPage";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Nav() {
  const t = useT();
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm", isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground");
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4">
        <Link to="/" className="mr-3 flex items-center gap-2 font-semibold"><Sprout className="size-5 text-emerald-600" />Abduction Lab</Link>
        <NavLink to="/notes" className={item}><BookMarked className="size-4" />{t({ ja: "気づきノート", en: "Notes" })}</NavLink>
        <NavLink to="/settings" className={item}><Settings className="size-4" />{t({ ja: "設定", en: "Settings" })}</NavLink>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{t({ ja: "非公式ファンメイド", en: "Unofficial fan project" })}</span>
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
        </Routes>
      </main>
    </HashRouter>
  );
}
