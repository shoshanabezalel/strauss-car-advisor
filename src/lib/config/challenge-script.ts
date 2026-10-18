import raw from "../../../data/challenge-script.json";
import { parseWith } from "./parse";
import { ChallengeScriptSchema, type ChallengeScript } from "./schemas";

export function parseChallengeScript(input: unknown): ChallengeScript {
  return parseWith(ChallengeScriptSchema, input, "data/challenge-script.json");
}

let cached: ChallengeScript | undefined;
export function getChallengeScript(): ChallengeScript {
  return (cached ??= parseChallengeScript(raw));
}
