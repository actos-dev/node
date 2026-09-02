import fs from "node:fs";
import path from "node:path";
import openapiTS, { astToString, type OpenAPI3 } from "openapi-typescript";

const HEADER = `/**
 * BU DOSYA OTOMATİK OLARAK ÜRETİLMİŞTİR — ELLE DÜZENLEMEYİNİZ.
 * Kaynak: Actos OpenAPI 3.1 Spec
 * Üretim: npm run generate:types
 */

`;

async function loadFromUrlOrFile(source: string): Promise<{ spec: OpenAPI3; sourceName: string }> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${source}: ${res.status} ${res.statusText}`,
      );
    }
    const spec = (await res.json()) as OpenAPI3;
    return { spec, sourceName: source };
  }

  const resolved = path.resolve(process.cwd(), source);
  if (!fs.existsSync(resolved)) {
    throw new Error(`OpenAPI spec file does not exist at: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf-8");
  return { spec: JSON.parse(content) as OpenAPI3, sourceName: resolved };
}

async function resolveSpec(
  explicitSource?: string,
): Promise<{ spec: OpenAPI3; sourceName: string }> {
  if (explicitSource) {
    return loadFromUrlOrFile(explicitSource);
  }

  if (process.env.ACTOS_OPENAPI_SOURCE) {
    return loadFromUrlOrFile(process.env.ACTOS_OPENAPI_SOURCE);
  }

  // Try live server at default local port
  try {
    const liveUrl = "http://127.0.0.1:3100/openapi.json";
    const res = await fetch(liveUrl, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const spec = (await res.json()) as OpenAPI3;
      return { spec, sourceName: liveUrl };
    }
  } catch {
    // Live server not running, fall back to local file
  }

  // Fallback to local openapi.json
  const localPath = path.resolve(process.cwd(), "openapi.json");
  if (fs.existsSync(localPath)) {
    const content = fs.readFileSync(localPath, "utf-8");
    return { spec: JSON.parse(content) as OpenAPI3, sourceName: localPath };
  }

  throw new Error(
    "Could not resolve OpenAPI spec. Provide --source <url-or-file>, set ACTOS_OPENAPI_SOURCE, or ensure openapi.json exists.",
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");

  let sourceArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source" && i + 1 < args.length) {
      sourceArg = args[i + 1];
      i++;
    } else if (arg?.startsWith("--source=")) {
      sourceArg = arg.slice("--source=".length);
    }
  }

  const { spec, sourceName } = await resolveSpec(sourceArg);
  const ast = await openapiTS(spec);
  const generatedCode = `${HEADER}${astToString(ast).trim()}\n`;

  const targetPath = path.resolve(process.cwd(), "src/generated/schema.d.ts");

  if (check) {
    if (!fs.existsSync(targetPath)) {
      console.error(`✗ Schema file missing at: ${targetPath}`);
      console.error("  Run 'npm run generate:types' to generate it.");
      process.exit(1);
    }

    const currentContent = fs.readFileSync(targetPath, "utf-8");
    if (currentContent.trim() === generatedCode.trim()) {
      console.log(`✓ Schema types in ${targetPath} are up-to-date with ${sourceName}`);
      process.exit(0);
    } else {
      console.error(`✗ Schema types in ${targetPath} are out of date with ${sourceName}!`);
      console.error("  Run 'npm run generate:types' to update them.");
      process.exit(1);
    }
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, generatedCode, "utf-8");
  console.log(`✓ Successfully generated types in ${targetPath} (source: ${sourceName})`);
}

main().catch((err: unknown) => {
  console.error("Error generating types:", err);
  process.exit(1);
});
