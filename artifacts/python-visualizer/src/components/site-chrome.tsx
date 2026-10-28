import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeMode = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const themeOverride = new URLSearchParams(window.location.search).get(
      "theme",
    );
    if (themeOverride === "light" || themeOverride === "dark")
      return themeOverride;

    try {
      return localStorage.getItem("python-visualizer-theme") === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", theme === "dark");
    try {
      localStorage.setItem("python-visualizer-theme", theme);
    } catch {
      // The visualizer still works when browser storage is unavailable.
    }
  }, [theme]);

  return {
    theme,
    toggleTheme: () =>
      setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: ThemeMode;
  onToggle: () => void;
}) {
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
      data-testid="button-theme-toggle"
      onClick={onToggle}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
