import raw from "../../../data/occupations.json";
import { parseWith } from "./parse";
import { OccupationsSchema, type Occupations } from "./schemas";

export function parseOccupations(input: unknown): Occupations {
  return parseWith(OccupationsSchema, input, "data/occupations.json");
}

let cached: Occupations | undefined;
export function getOccupations(): Occupations {
  return (cached ??= parseOccupations(raw));
}
