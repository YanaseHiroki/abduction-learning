import { lazy, Suspense, useState } from "react";
import { HashRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { CircleHelp, MessageSquareText, Settings, Sprout } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { Home } from "@/pages/Home";
import { HelpPage } from "@/pages/HelpPage";
import { InquiryPage } from "@/pages/InquiryPage";
import { Notes } from "@/pages/Notes";
import { SettingsPage } from "@/pages/SettingsPage";
import { BenchPage } from "@/pages/BenchPage";
import { PROXY_URL } from "@/lib/llm/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Demo data for the help screenshots; dropped from production builds.
const SeedPage = import.meta.env.DEV ? lazy(() => import("@/dev/SeedPage")) : null;

function Nav() {
  const t = useT();
  const [feedback, setFeedback] = useState(false);
  const item = ({ isActive }: { isActive: boolean }) =>
    cn("inline-flex shrink-0 items-center gap-1 rounded-md whitespace-nowrap px-2 py-1.5 text-sm sm:gap-1.5 sm:px-2.5", isActive ? "bg-white/15 font-medium" : "text-header-foreground/75 hover:text-header-foreground");
  return (
    <header className="sticky top-0 z-30 bg-header text-header-foreground">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4 sm:gap-2">
        <Link to="/" className="mr-auto flex min-w-0 items-center gap-2 text-sm font-semibold whitespace-nowrap sm:text-base"><Sprout className="size-5 shrink-0 text-lime-400" /><span className="truncate">Abduction Learning</span></Link>
        <NavLink to="/help" className={item}><CircleHelp className="size-4" />{t({ ja: "ヘルプ", en: "Help" })}</NavLink>
        {/* feedback goes out through the proxy, so there is nowhere to send it without one; icon only on phones to leave room for the name */}
        {PROXY_URL && (
          <button type="button" onClick={() => setFeedback(true)} aria-label={t({ ja: "ご意見", en: "Feedback" })} className={item({ isActive: feedback })}>
            <MessageSquareText className="size-4" /><span className="hidden sm:inline">{t({ ja: "ご意見", en: "Feedback" })}</span>
          </button>
        )}
        <NavLink to="/settings" className={item}><Settings className="size-4" />{t({ ja: "設定", en: "Settings" })}</NavLink>
      </div>
      <FeedbackDialog open={feedback} onOpenChange={setFeedback} />
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main>
        <ErrorBoundary>
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
        </ErrorBoundary>
      </main>
    </HashRouter>
  );
}
