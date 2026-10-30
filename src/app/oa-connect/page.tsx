import type { Metadata } from "next";

import { oaMessageOrigins } from "@/lib/oa/config";

import { OaConnectClient } from "./OaConnectClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect Outdoor Analytics",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function OaConnectPage() {
  return <OaConnectClient allowedOrigins={oaMessageOrigins()} />;
}
