import { createAgentModel, isMockMode } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { createModelExtractor } from "@/lib/payslip/extract";
import { createMockExtractor } from "@/lib/payslip/mock";
import { handlePayslipUpload } from "@/lib/payslip/upload";
import { NO_STORE } from "@/lib/security/http";

// One vision call, plus one retry and the fallback model (fallback-model.ts); the read stops at READ_BUDGET_MS.
export const maxDuration = 60;
const READ_BUDGET_MS = 45_000;

/**
 * POST /api/payslip (F6): multipart with one `file` → the six salary fields for the employee to confirm.
 * Nothing is saved here: confirmed values go through POST /api/profile like any edit. The file is never stored.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const config = loadConfig();
  const extract = isMockMode() ? createMockExtractor(config) : createModelExtractor(createAgentModel(), config.rules.payslip.ranges);
  const res = await handlePayslipUpload({
    file: file instanceof File ? file : null,
    extract,
    abortSignal: AbortSignal.timeout(READ_BUDGET_MS),
  });
  return Response.json(res.body, { status: res.status, headers: NO_STORE });
}
