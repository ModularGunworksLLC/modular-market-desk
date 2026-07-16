import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";

import { AppShell } from "@/components/desk/AppShell";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-desk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gun Value Desk",
  description: "Market comps + your fees = max bid. Local or GunBroker exit.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
