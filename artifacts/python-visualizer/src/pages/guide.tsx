import { useEffect } from "react";
import { ArrowRight, Code2 } from "lucide-react";
import { Link } from "wouter";
import GuideContent from "../content/guide.mdx";
import { ThemeToggle, useTheme } from "@/components/site-chrome";

export default function GuidePage() {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = description?.content;

    document.title = "How to read a Python trace — little by little";
    if (description) {
      description.content =
        "A short guide to running a Python snippet, reading its trace, and following changes to variables and output.";
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) {
        description.content = previousDescription;
      }
    };
  }, []);

  return (
    <main className="guide-shell">
      <header className="guide-topbar">
        <Link
          className="guide-brand"
          href="/"
          aria-label="Back to the visualizer"
        >
          <span className="brand-mark">
            <Code2 size={19} strokeWidth={2.2} />
          </span>
          <span>
            <span className="brand-name">little by little</span>
            <span className="brand-subtitle">A small Python workbench</span>
          </span>
        </Link>
        <div className="topbar-actions">
          <Link className="guide-link" href="/">
            Back to the visualizer
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <div className="guide-kicker">
        <span>FIELD NOTES</span>
        <span className="guide-kicker-dot" />
        <span>ABOUT 3 MINUTES</span>
      </div>
      <article className="guide-article">
        <GuideContent />
      </article>
      <footer className="guide-footer">
        <span>Ready to trace a few lines?</span>
        <Link href="/">
          Open the visualizer <ArrowRight size={15} />
        </Link>
      </footer>
    </main>
  );
}
