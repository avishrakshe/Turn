"use client";

import { createContext, useContext } from "react";

// Screen-reader labels built into the UI primitives. English by default; the app provides its
// translations, so the primitives never pull the whole message catalog into the marketing site.
export interface UiLabels {
  close: string;
  dismiss: string;
  notifications: string;
}

export const UiLabelsContext = createContext<UiLabels>({ close: "Close", dismiss: "Dismiss", notifications: "Notifications" });

export const useUiLabels = () => useContext(UiLabelsContext);
