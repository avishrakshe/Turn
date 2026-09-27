"use client";
// Loads the WebGL scene only in the browser, after first paint. Reduced motion gets a still frame; no WebGL gets
// a CSS rendition of the same ring so the hero never looks empty.
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const Scene = dynamic(() => import("./hero-scene"), { ssr: false, loading: () => <Fallback /> });

const noSub = () => () => {};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let webglCache: boolean | null = null;
const hasWebGL = () => {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
};

function Fallback() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-hidden>
      <div className="relative h-64 w-64 [transform:rotateX(62deg)]">
        <div className="absolute inset-0 rounded-full border-2 border-[#3fb79d] shadow-[0_0_40px_#3fb79d]" />
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <span
              key={i}
              className="absolute h-8 w-8 rounded-full"
              style={{ left: 128 + Math.cos(a) * 128 - 16, top: 128 + Math.sin(a) * 128 - 16, background: ["#3fb79d", "#e8784a", "#8b6fd6", "#4d9be0", "#e0609f", "#d9b441"][i] }}
            />
          );
        })}
        <span className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-[#f2a541] shadow-[0_0_50px_#f2a541]" />
      </div>
    </div>
  );
}

export function Hero3D() {
  const still = useSyncExternalStore(noSub, reducedMotion, () => false);
  const webgl = useSyncExternalStore(noSub, hasWebGL, () => true);
  return <div className="h-full w-full">{webgl ? <Scene still={still} /> : <Fallback />}</div>;
}
