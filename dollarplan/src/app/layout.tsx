import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";

import { AppNav } from "@/components/AppNav";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "DollarPlan",
  description: "Zero-based household budget — manual first, Plaid-ready.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#008361",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen antialiased`}>
        <AppNav />
        <main className="mx-auto max-w-[1400px] px-4 py-5 md:px-6 md:py-6">{children}</main>
      </body>
    </html>
  );
}
