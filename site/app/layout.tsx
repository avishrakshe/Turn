import type { Metadata, Viewport } from "next";
import { dmSans, fraunces } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import { DESCRIPTION, LINKS, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `Turn · ${TAGLINE}`, template: "%s · Turn" },
  description: DESCRIPTION,
  applicationName: "Turn",
  // Installed on iPhone: full screen, named "Turn" on the home screen.
  appleWebApp: { capable: true, title: "Turn", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Turn",
    title: `Turn · ${TAGLINE}`,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", site: LINKS.xHandle, title: `Turn · ${TAGLINE}`, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1612" },
  ],
};

// Applies a saved theme choice before first paint so there's no flash. Without a saved
// choice the CSS follows prefers-color-scheme.
// Also keeps Chrome's install prompt if it fires before the app's code loads (see lib/pwa.ts).
const themeScript = `try{var t=localStorage.getItem("turn-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__turnInstallPrompt=e});`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={cn(fraunces.variable, dmSans.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
