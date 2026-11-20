/**
 * Cross-wire: after a public trade-in is saved in Desk, notify Ledger.
 * Failure must not fail the customer submit — Desk inbox + email still stand.
 */

export type LedgerTradeInPayload = {
  deskRequestId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  caliber?: string | null;
  notes?: string | null;
  estimateLabel?: string | null;
  estimateP25?: number | null;
};

export function ledgerHandoffConfigured(): boolean {
  return Boolean((process.env.LEDGER_INTAKE_URL || "").trim() && (process.env.LEDGER_INTAKE_TOKEN || "").trim());
}

export async function notifyLedgerTradeIn(payload: LedgerTradeInPayload): Promise<{ ok: boolean; error?: string }> {
  const url = (process.env.LEDGER_INTAKE_URL || "").trim();
  const token = (process.env.LEDGER_INTAKE_TOKEN || "").trim();
  if (!url || !token) {
    return { ok: false, error: "LEDGER_INTAKE_URL / LEDGER_INTAKE_TOKEN not set" };
  }

  const deskBase = (process.env.PUBLIC_DESK_URL || "https://desk.modulargunworks.com").replace(/\/$/, "");
  const body = {
    name: payload.customerName,
    email: payload.customerEmail,
    phone: payload.customerPhone,
    manufacturer: payload.manufacturer,
    model: payload.model,
    serialNumber: payload.serialNumber,
    caliber: payload.caliber || "",
    notes: payload.notes || "",
    estimateLabel: payload.estimateLabel || "",
    estimateP25: payload.estimateP25,
    deskRequestId: payload.deskRequestId,
    deskInboxUrl: `${deskBase}/trade-in/inbox?id=${encodeURIComponent(payload.deskRequestId)}`,
    source: "desk_trade_in",
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Intake-Token": token,
        "X-Idempotency-Key": `desk-trade-in-${payload.deskRequestId}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Ledger ${res.status}: ${text.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ledger handoff failed" };
  } finally {
    clearTimeout(t);
  }
}
