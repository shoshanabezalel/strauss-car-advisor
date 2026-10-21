import { LIMITS } from "@/lib/security/rate-limit";

/**
 * Server only (kept out of upload.ts, which the browser imports). Per IP, and the environment's daily cap on LLM
 * calls (`budgetKey` from llmBudgetKey): every read is one.
 */
export const payslipLimits = (ip: string, budgetKey: string) => [
  { limit: LIMITS.payslipIp, key: ip },
  { limit: LIMITS.chatGlobalDay, key: budgetKey },
];
