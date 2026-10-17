import raw from "../../../data/catalog.json";
import { parseWith } from "./parse";
import { CatalogSchema, type Catalog } from "./schemas";

export function parseCatalog(input: unknown): Catalog {
  return parseWith(CatalogSchema, input, "data/catalog.json");
}

let cached: Catalog | undefined;
export function getCatalog(): Catalog {
  return (cached ??= parseCatalog(raw));
}
