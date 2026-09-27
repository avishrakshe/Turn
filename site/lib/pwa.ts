"use client";

import { useSyncExternalStore } from "react";

// Installing Turn to the home screen. Chrome and Edge (Android and desktop) fire
// `beforeinstallprompt`, which we keep so a button can open the native install dialog later;
// an inline script in the root layout catches it if it fires before this module loads.
// iOS never fires it: there the only way is Share → Add to Home Screen. Apps' built-in
// browsers (WhatsApp, Instagram…) can't install at all, so we say to open the link in a browser.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __turnInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export type InstallPlatform = "ios" | "android" | "desktop";

export interface InstallState {
  /** False during server render and hydration. */
  ready: boolean;
  /** Already running as the installed app. */
  standalone: boolean;
  platform: InstallPlatform;
  /** Opened inside another app's browser, which can't install web apps. */
  inAppBrowser: boolean;
  /** The native install dialog is available (Chrome, Edge). */
  canPrompt: boolean;
  /** Installed during this visit. */
  justInstalled: boolean;
}

const SERVER: InstallState = { ready: false, standalone: false, platform: "desktop", inAppBrowser: false, canPrompt: false, justInstalled: false };

let state = SERVER;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function detect(): InstallState {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    ready: true,
    standalone,
    platform: ios ? "ios" : /Android/.test(ua) ? "android" : "desktop",
    inAppBrowser: /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|; wv\)/.test(ua),
    canPrompt: !!window.__turnInstallPrompt,
    justInstalled: state.justInstalled,
  };
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  state = detect();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__turnInstallPrompt = e as BeforeInstallPromptEvent;
    state = { ...state, canPrompt: true };
    emit();
  });
  window.addEventListener("appinstalled", () => {
    window.__turnInstallPrompt = undefined;
    state = { ...state, canPrompt: false, justInstalled: true };
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
    state = detect();
    emit();
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    subscribe,
    () => (start(), state),
    () => SERVER,
  );
}

/** Opens the browser's install dialog. Resolves true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  const e = window.__turnInstallPrompt;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  // A prompt event can only be used once.
  window.__turnInstallPrompt = undefined;
  state = { ...state, canPrompt: false, justInstalled: outcome === "accepted" };
  emit();
  return outcome === "accepted";
}

/** Asks the service worker to keep a copy of an app page, so it opens offline later. */
export function cachePage(path: string) {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  navigator.serviceWorker?.controller?.postMessage({ type: "cache-page", path });
}

/** Registers the service worker, in production only (in dev it would cache stale code). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}
