import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { STORAGE_KEYS } from "@/shared/constants/config";

export type ColorMode = "light" | "dark";

export function preferredColorMode(): ColorMode {
  const saved = localStorage.getItem(STORAGE_KEYS.colorMode);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ColorMode>(() => preferredColorMode());

  useEffect(() => applyColorMode(mode), [mode]);

  function toggle() {
    const next = mode === "light" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEYS.colorMode, next);
    setMode(next);
  }

  const nextLabel = mode === "light" ? "Use dark mode" : "Use light mode";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={nextLabel}
      title={nextLabel}
    >
      {mode === "light" ? <Moon size={15} /> : <Sun size={15} />}
      {!compact ? <span>{mode === "light" ? "Dark" : "Light"}</span> : null}
    </button>
  );
}
