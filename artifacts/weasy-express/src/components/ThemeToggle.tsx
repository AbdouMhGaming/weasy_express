import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Exported for the document bootstrap script and other theme-aware controls. */
export const THEME_STORAGE_KEY = "weasy-theme";
const THEME_EVENT = "weasy-theme-change";

type ThemeToggleProps = {
  className?: string;
  /** Display a short text label beside the icon. Defaults to icon-only. */
  showLabel?: boolean;
};

function currentTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Opt-in theme control: no system preference is applied without an explicit choice. */
export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(currentTheme);

  useEffect(() => {
    const sync = () => setIsDark(currentTheme());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      document.documentElement.classList.toggle("dark", event.newValue === "dark");
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const label = isDark ? t("theme.activateLight") : t("theme.activateDark");
  const toggle = () => {
    const next = !currentTheme();
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage can be blocked; this tab can still switch themes.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      data-testid="button-theme-toggle"
      onClick={toggle}
      className={`inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      {isDark ? <Sun aria-hidden="true" className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" className="h-[18px] w-[18px]" />}
      {showLabel && <span className="text-xs font-semibold">{isDark ? t("theme.light") : t("theme.dark")}</span>}
    </button>
  );
}

export default ThemeToggle;