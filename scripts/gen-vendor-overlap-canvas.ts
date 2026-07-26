import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("data/vendor-overlap-slim.json", "utf8")) as {
  generatedAt: string;
  vendorRowCounts: Record<string, number>;
  vendorUpcCounts: Record<string, number>;
  upcCoverage: { only1: number; overlap2: number; overlap3: number; overlap4: number };
  pairwiseUpc: Array<{ a: string; b: string; shared: number }>;
  topUpcBrands: Array<{ brand: string; count: number }>;
  cheapestWins: Record<string, number>;
  upcAll4Count: number;
  upcAll4: Array<{
    upc: string;
    manufacturer: string;
    model: string;
    prices: Record<string, number>;
    spread: number;
    cheapest: string;
  }>;
  biggestUpcSpreads: Array<{
    upc: string;
    manufacturer: string;
    model: string;
    prices: Record<string, number>;
    spread: number;
    cheapest: string;
  }>;
};

const labels: Record<string, string> = {
  lipseys: "Lipsey's",
  zanders: "Zanders",
  davidsons: "Davidson's",
  chattanooga: "Chattanooga",
};

const usd = (n: number) =>
  "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

const brandCats = d.topUpcBrands
  .slice(0, 12)
  .map((b) => b.brand.replace(/ REPEATING$/, "").slice(0, 18));
const brandVals = d.topUpcBrands.slice(0, 12).map((b) => b.count);
const pairCats = d.pairwiseUpc.map(
  (p) => `${labels[p.a]!.slice(0, 4)}/${labels[p.b]!.slice(0, 4)}`,
);
const pairVals = d.pairwiseUpc.map((p) => p.shared);
const winCats = Object.keys(d.cheapestWins).map((k) => labels[k]!);
const winVals = Object.values(d.cheapestWins);

const tableRows = d.upcAll4.slice(0, 80).map((r) => ({
  cells: [
    r.manufacturer,
    r.model,
    r.upc,
    usd(r.prices.lipseys!),
    usd(r.prices.zanders!),
    usd(r.prices.davidsons!),
    usd(r.prices.chattanooga!),
    usd(r.spread),
    labels[r.cheapest]!,
  ],
}));

const spreadRows = d.biggestUpcSpreads.slice(0, 15).map((r) => ({
  cells: [
    r.manufacturer,
    r.model,
    usd(r.spread),
    labels[r.cheapest]!,
    usd(r.prices.lipseys!),
    usd(r.prices.zanders!),
    usd(r.prices.davidsons!),
    usd(r.prices.chattanooga!),
  ],
}));

const covTotal =
  d.upcCoverage.only1 +
  d.upcCoverage.overlap2 +
  d.upcCoverage.overlap3 +
  d.upcCoverage.overlap4;
const pct4 = ((d.upcCoverage.overlap4 / covTotal) * 100).toFixed(1);

const src = `import {
  BarChart,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

const COVERAGE = ${JSON.stringify(d.upcCoverage)};
const VENDOR_UPCS = ${JSON.stringify(d.vendorUpcCounts)};
const VENDOR_ROWS = ${JSON.stringify(d.vendorRowCounts)};
const BRAND_CATS = ${JSON.stringify(brandCats)};
const BRAND_VALS = ${JSON.stringify(brandVals)};
const PAIR_CATS = ${JSON.stringify(pairCats)};
const PAIR_VALS = ${JSON.stringify(pairVals)};
const WIN_CATS = ${JSON.stringify(winCats)};
const WIN_VALS = ${JSON.stringify(winVals)};
const ALL4_ROWS = ${JSON.stringify(tableRows)};
const SPREAD_ROWS = ${JSON.stringify(spreadRows)};
const ALL4_COUNT = ${d.upcAll4Count};
const PCT4 = ${JSON.stringify(pct4)};
const GENERATED = ${JSON.stringify(d.generatedAt.slice(0, 10))};

export default function VendorOverlapCanvas() {
  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1100 }}>
      <Stack gap={6}>
        <H1>Vendor catalog overlap</H1>
        <Text tone="secondary" size="small">
          Matched by UPC across Lipsey&apos;s, Zanders, Davidson&apos;s, and Chattanooga. Make/model
          strings alone barely overlap (vendors spell identity differently). Source: local desk.db ·{" "}
          {GENERATED}
        </Text>
      </Stack>

      <Callout tone="warning" title="They do not all carry the same guns">
        Only {ALL4_COUNT.toLocaleString()} UPCs ({PCT4}% of distinct priced UPCs) appear at all four
        distributors. Most SKUs ({COVERAGE.only1.toLocaleString()}) are exclusive to a single vendor.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat label="All 4 vendors" value={ALL4_COUNT.toLocaleString()} tone="success" />
        <Stat label="At 3 vendors" value={COVERAGE.overlap3.toLocaleString()} />
        <Stat label="At 2 vendors" value={COVERAGE.overlap2.toLocaleString()} />
        <Stat label="Exclusive (1)" value={COVERAGE.only1.toLocaleString()} tone="warning" />
      </Grid>

      <Grid columns={4} gap={12}>
        <Card>
          <CardHeader>Lipsey&apos;s</CardHeader>
          <CardBody>
            <Text weight="semibold">{VENDOR_UPCS.lipseys.toLocaleString()} UPCs</Text>
            <Text tone="secondary" size="small">
              {VENDOR_ROWS.lipseys.toLocaleString()} rows
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Zanders</CardHeader>
          <CardBody>
            <Text weight="semibold">{VENDOR_UPCS.zanders.toLocaleString()} UPCs</Text>
            <Text tone="secondary" size="small">
              {VENDOR_ROWS.zanders.toLocaleString()} rows
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Davidson&apos;s</CardHeader>
          <CardBody>
            <Text weight="semibold">{VENDOR_UPCS.davidsons.toLocaleString()} UPCs</Text>
            <Text tone="secondary" size="small">
              {VENDOR_ROWS.davidsons.toLocaleString()} rows
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Chattanooga</CardHeader>
          <CardBody>
            <Text weight="semibold">{VENDOR_UPCS.chattanooga.toLocaleString()} UPCs</Text>
            <Text tone="secondary" size="small">
              {VENDOR_ROWS.chattanooga.toLocaleString()} rows
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <H2>Who wins on shared SKUs?</H2>
      <Text tone="secondary" size="small">
        Among the {ALL4_COUNT} all-four UPCs, which distributor has the lowest dealer price.
      </Text>
      <BarChart
        categories={WIN_CATS}
        series={[{ name: "Cheapest wins", data: WIN_VALS, tone: "info" }]}
        height={180}
      />
      <Text tone="secondary" size="small">
        Davidson&apos;s never uniquely undercuts on this set (often matches Lipsey&apos;s / Chatt pricing).
      </Text>

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H3>Brands on all 4 (by UPC count)</H3>
          <BarChart
            horizontal
            categories={BRAND_CATS}
            series={[{ name: "Shared UPCs", data: BRAND_VALS }]}
            height={280}
          />
        </Stack>
        <Stack gap={8}>
          <H3>Pairwise UPC overlap</H3>
          <BarChart
            horizontal
            categories={PAIR_CATS}
            series={[{ name: "Shared UPCs", data: PAIR_VALS, tone: "success" }]}
            height={280}
          />
          <Text tone="secondary" size="small">
            Strongest pair: Zanders ↔ Davidson&apos;s (~50% of each other&apos;s UPCs). Chattanooga is huge, so
            % of Chatt catalog shared stays low (~6–8%).
          </Text>
        </Stack>
      </Grid>

      <Divider />

      <H2>Largest dealer-price spreads (all 4)</H2>
      <Table
        headers={["Make", "Model", "Spread", "Cheapest", "Lipsey's", "Zanders", "Davidson's", "Chatt"]}
        rows={SPREAD_ROWS}
      />

      <Divider />

      <H2>Guns at all four distributors</H2>
      <Text tone="secondary" size="small">
        First 80 of {ALL4_COUNT} shared UPCs (alphabetical). Prices are min dealer_price per vendor for that
        UPC.
      </Text>
      <Table
        headers={["Make", "Model", "UPC", "Lipsey's", "Zanders", "Davidson's", "Chatt", "Spread", "Cheapest"]}
        rows={ALL4_ROWS}
      />
    </Stack>
  );
}
`;

const out =
  "C:/Users/micha/.cursor/projects/c-Users-micha-Projects-modular-market-desk/canvases/vendor-catalog-overlap.canvas.tsx";
writeFileSync(out, src);
console.log("wrote", out, "bytes", src.length);
