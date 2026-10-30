import type { Metadata } from "next";

import { oaAdminConfirmConfig } from "@/lib/oa/admin-confirm";
import { oaMessageOrigins } from "@/lib/oa/config";

import { OaConnectClient } from "./OaConnectClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect Outdoor Analytics",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function OaConnectPage() {
  const confirm = oaAdminConfirmConfig();
  return (
    <OaConnectClient
      allowedOrigins={oaMessageOrigins()}
      confirmRequired={confirm.required}
      confirmLabel={confirm.label}
    />
  );
}
