import { useEffect, useState } from "react";

function prefersDark() {
  if (typeof window === "undefined") return false;

  try {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function useThemePreference() {
  const [isDark, setIsDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.classList.toggle("dark", isDark);
      localStorage.setItem("theme", isDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("theme-toggle", { detail: { dark: isDark } }));
    } catch {
      // Theme persistence is a convenience; rendering should continue without it.
    }
  }, [isDark]);

  return [isDark, setIsDark] as const;
}
