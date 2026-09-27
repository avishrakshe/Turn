"use client";

import { useEffect, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Theme = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  function apply(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("turn-theme");
      else localStorage.setItem("turn-theme", t);
    } catch {
      // Storage can be unavailable (private mode). The choice still applies for this visit.
    }
  }

  return (
    <SegmentedControl
      label="Colour theme"
      value={theme}
      onChange={apply}
      options={[
        { value: "system", label: "Auto" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}
