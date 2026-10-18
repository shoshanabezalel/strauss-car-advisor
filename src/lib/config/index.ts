import { getCatalog, parseCatalog } from "./catalog";
import { getChallengeScript, parseChallengeScript } from "./challenge-script";
import { getOccupations, parseOccupations } from "./occupations";
import { ConfigError } from "./parse";
import { getRules, parseRules } from "./rules";
import { getSampleEmployees, parseSampleEmployees } from "./sample-employees";
import { validateConfig, type Config } from "./validate";

export * from "./schemas";
export { ConfigError, validateConfig, type Config };
export { parseRules, parseCatalog, parseOccupations, parseSampleEmployees, parseChallengeScript };
export { getRules, getCatalog, getOccupations, getSampleEmployees, getChallengeScript };

let cached: Config | undefined;
/** Load and validate all data/*.json files (cached per process). */
export function loadConfig(): Config {
  return (cached ??= validateConfig({
    rules: getRules(),
    catalog: getCatalog(),
    occupations: getOccupations(),
    employees: getSampleEmployees(),
    challenge: getChallengeScript(),
  }));
}
