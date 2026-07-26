import { CatalogSearchClient } from "./CatalogSearchClient";

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Master catalog</h1>
        <p className="text-xs text-desk-muted">
          Search all imported distributors for the best dealer price — firearms and parts.
          Keeps Evaluate&apos;s firearm-only wholesale filters out of this path.
        </p>
      </div>
      <CatalogSearchClient />
    </main>
  );
}
