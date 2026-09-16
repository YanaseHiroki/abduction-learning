import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { getSettings } from "@/lib/settings";

/**
 * A crash anywhere below here would otherwise leave a blank white page with no way out.
 * The learner's inquiries live in IndexedDB and are untouched by this, so reloading is safe;
 * going home is the way out of a single bad screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const ja = getSettings().uiLang === "ja";
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="text-5xl">😵</div>
        <h1 className="mt-4 text-xl font-semibold">{ja ? "画面の表示に失敗しました" : "This screen failed to render"}</h1>
        <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">
          {ja
            ? "学習データは消えていません。このブラウザの中にそのまま残っています。\n読み込み直すか、ホームに戻ってください。"
            : "Your inquiries are safe: they are still in this browser.\nReload, or go back Home."}
        </p>
        <ButtonRow className="pt-6">
          <Button variant="recommended" onClick={() => location.reload()}>{ja ? "🔄 読み込み直す" : "🔄 Reload"}</Button>
          <Button variant="outline" onClick={() => { location.hash = "#/"; location.reload(); }}>{ja ? "🏠 ホームへ" : "🏠 Go Home"}</Button>
        </ButtonRow>
        <details className="mt-8 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{ja ? "詳細（ご意見フォームに貼れます）" : "Details (paste into the feedback form)"}</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{error.message}</pre>
        </details>
      </div>
    );
  }
}
