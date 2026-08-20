import { useEffect, useRef, useState } from "react";

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
  const hasMountedRef = useRef(false);

  useEffect(() => {
    let cleanupTimer: number | undefined;
    try {
      const root = document.documentElement;
      const alreadyApplied = root.classList.contains("dark") === isDark;
      if (hasMountedRef.current && !alreadyApplied) {
        root.classList.add("theme-switching");
        cleanupTimer = window.setTimeout(() => {
          root.classList.remove("theme-switching");
        }, 140);
      }
      root.classList.toggle("dark", isDark);
      localStorage.setItem("theme", isDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("theme-toggle", { detail: { dark: isDark } }));
      hasMountedRef.current = true;
    } catch {
      // Theme persistence is a convenience; rendering should continue without it.
    }

    return () => {
      if (cleanupTimer !== undefined) {
        window.clearTimeout(cleanupTimer);
      }
      document.documentElement.classList.remove("theme-switching");
    };
  }, [isDark]);

  return [isDark, setIsDark] as const;
}
