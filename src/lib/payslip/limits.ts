import { LIMITS } from "@/lib/security/rate-limit";

/** Server only (kept out of upload.ts, which the browser imports). Per IP, and the daily cap on LLM calls: every read is one. */
export const payslipLimits = (ip: string) => [
  { limit: LIMITS.payslipIp, key: ip },
  { limit: LIMITS.chatGlobalDay, key: "all" },
];
