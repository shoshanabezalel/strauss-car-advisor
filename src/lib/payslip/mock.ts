import type { Config } from "@/lib/config";
import type { Extractor } from "./extract";

/**
 * AGENT_MODEL=mock (local dev / e2e): the scripted chat model can't read files, so the payslip gets a fixed answer:
 * E-001's salary fields with the bonus unread (to show "לא זוהה"), or not a payslip for a file named *not-payslip*.
 */
export function createMockExtractor(config: Config): Extractor {
  if (process.env.NODE_ENV === "production") throw new Error("the mock payslip extractor is not allowed in production");
  const p = config.employees.employees[0].profile;
  // The data keeps fractions; a payslip prints percents. Rounded only to drop float noise in the fixture.
  const printed = (fraction: number) => Math.round(fraction * 10000) / 100;
  return async (file) => {
    if (file.name.toLowerCase().includes("not-payslip")) return { status: "not_payslip" };
    return {
      status: "ok",
      fields: {
        baseSalary: p.baseSalary ?? null,
        commissions: p.commissions ?? null,
        bonus: null,
        pensionPct: p.pensionPct === undefined ? null : printed(p.pensionPct),
        studyFundPct: p.studyFundPct === undefined ? null : printed(p.studyFundPct),
        creditPoints: p.creditPoints ?? null,
      },
    };
  };
}
