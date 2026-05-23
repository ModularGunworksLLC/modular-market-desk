export interface AppConfig {
  companySiteUrl: string;
  ledgerUrl: string;
  apiUrl: string;
  apiKey: string;
}

const defaults: AppConfig = {
  companySiteUrl: "",
  ledgerUrl: "",
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  apiKey: import.meta.env.VITE_API_KEY ?? "",
};

let cached: AppConfig | null = null;

export function resetConfigCache(): void {
  cached = null;
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as Partial<AppConfig>;
      cached = {
        companySiteUrl: json.companySiteUrl || defaults.companySiteUrl,
        ledgerUrl: json.ledgerUrl || defaults.ledgerUrl,
        apiUrl: json.apiUrl || defaults.apiUrl,
        apiKey: json.apiKey || defaults.apiKey,
      };
      return cached;
    }
  } catch {
    /* use defaults */
  }
  cached = defaults;
  return cached;
}

export function apiBaseUrl(config: AppConfig): string {
  return (config.apiUrl || "").replace(/\/$/, "");
}
