import raw from "../../../data/strauss-rules.json";
import { parseWith } from "./parse";
import { RulesSchema, type Rules } from "./schemas";

export function parseRules(input: unknown): Rules {
  return parseWith(RulesSchema, input, "data/strauss-rules.json");
}

let cached: Rules | undefined;
export function getRules(): Rules {
  return (cached ??= parseRules(raw));
}
