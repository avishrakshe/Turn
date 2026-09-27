import type { Metadata } from "next";
import QRCode from "qrcode";
import { InstallPanel } from "@/components/app/InstallPanel";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Add Turn to your phone's home screen. It opens like any app, with nothing to download from a store.",
  robots: { index: true },
};

export default async function GetAppPage() {
  const url = `${SITE_URL}/app/get`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2b211aff", light: "#00000000" } });
  return <InstallPanel qrSvg={qrSvg} url={url} />;
}
