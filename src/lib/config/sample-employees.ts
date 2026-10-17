import raw from "../../../data/sample-employees.json";
import { parseWith } from "./parse";
import { SampleEmployeesSchema, type SampleEmployees } from "./schemas";

export function parseSampleEmployees(input: unknown): SampleEmployees {
  return parseWith(SampleEmployeesSchema, input, "data/sample-employees.json");
}

let cached: SampleEmployees | undefined;
export function getSampleEmployees(): SampleEmployees {
  return (cached ??= parseSampleEmployees(raw));
}
