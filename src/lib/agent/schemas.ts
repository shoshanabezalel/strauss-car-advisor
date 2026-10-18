import { z } from "zod";
import { CarSchema, DriveSchema, GroupSchema, ParticipationSourceSchema, SituationSchema } from "@/lib/config/schemas";

/**
 * Zod schemas for every agent tool's input and output. Inputs are what the LLM may send; outputs are checked
 * before they reach the LLM, so a tool can never hand it an unexpected shape (CLAUDE.md rule 1: numbers only
 * come from these outputs).
 */

const money = z.number().nonnegative();

// ---------- shared ----------

export const PROFILE_FIELDS = [
  "occupation",
  "group",
  "baseSalary",
  "commissions",
  "bonus",
  "pensionPct",
  "studyFundPct",
  "creditPoints",
  "childrenUnder23",
  "current",
] as const;
export const ProfileFieldSchema = z.enum(PROFILE_FIELDS);
export type ProfileField = z.infer<typeof ProfileFieldSchema>;

export const MissingFieldSchema = z.enum([...PROFILE_FIELDS, "carId"]);

/** Where a profile value came from. catalog_default is never a profile source — only the engine sets it. */
export const PROFILE_SOURCES = ["employee", "rep", "payslip"] as const;
export const ProfileSourceSchema = z.enum(PROFILE_SOURCES);
export type ProfileSource = z.infer<typeof ProfileSourceSchema>;

export const ProfileSchema = z.object({
  occupation: z.string().optional(),
  group: GroupSchema.optional(),
  baseSalary: money.optional(),
  commissions: money.optional(),
  bonus: money.optional(),
  pensionPct: z.number().min(0).max(1).optional(),
  studyFundPct: z.number().min(0).max(1).optional(),
  creditPoints: z.number().nonnegative().optional(),
  childrenUnder23: z.number().int().nonnegative().optional(),
  current: SituationSchema.optional(),
});

export const EligibilitySchema = z.object({
  eligible: z.boolean(),
  track: z.enum(["regular", "family", "waiver"]),
  reason: z.string(),
  missing: z.array(MissingFieldSchema),
});

export const NetBreakdownSchema = z.object({
  cash: z.number(),
  pension: z.number(),
  studyFund: z.number(),
  taxable: z.number(),
  taxBrackets: z.number(),
  creditPointsValue: z.number(),
  pensionCredit: z.number(),
  tax: z.number(),
  nationalInsurance: z.number(),
  health: z.number(),
  net: z.number(),
});

export const ChangeSchema = z.object({
  kind: z.enum(["valueOfUse", "maintenance", "participation", "electric", "familyGap"]),
  from: z.number(),
  to: z.number(),
});

export const OptionResultSchema = z.object({
  situation: SituationSchema,
  eligibility: EligibilitySchema,
  car: CarSchema.optional(),
  budget: z.number().optional(),
  carCost: z.number(),
  participation: z.number(),
  participationSource: ParticipationSourceSchema.optional(),
  needsConfirmation: z.boolean(),
  valueOfUse: z.number(),
  maintenance: z.number(),
  electricGross: z.number(),
  familyGapEmployee: z.number(),
  breakdown: NetBreakdownSchema.optional(),
  diffVsToday: z.number().optional(),
  changes: z.array(ChangeSchema),
  missing: z.array(MissingFieldSchema),
});

const shekel = z.number().int();

/** The option's amounts rounded for display, so the comparison table renders them without arithmetic. */
export const AmountsDisplaySchema = z.object({
  valueOfUse: shekel,
  participation: shekel,
  carCost: shekel,
  budget: shekel.optional(),
  electricGross: shekel,
  maintenance: shekel,
  familyGapEmployee: shekel,
});

/** Ready-to-quote values, rounded for display by src/lib/format/money.ts. net/diff are absent when the engine gave no net. */
export const DisplaySchema = AmountsDisplaySchema.extend({
  net: z.number().int().optional(),
  diffVsToday: z.number().int().optional(),
  /** Sign of diffVsToday as a word, so the reply says עלייה / ירידה instead of a minus sign. */
  direction: z.enum(["up", "down", "none"]).optional(),
});

export const DisplayedOptionSchema = OptionResultSchema.extend({ display: DisplaySchema });

export const VouRecordSchema = z.object({
  taxYear: z.number().int(),
  regYear: z.number().int(),
  vehicleTypeCode: z.string(),
  makeCode: z.string(),
  makeName: z.string(),
  modelCode: z.string(),
  modelName: z.string(),
  tradeName: z.string(),
  driveCode: z.string(),
  drive: DriveSchema,
  listPrice: z.number(),
  valueOfUse: z.number(),
  raw: z.object({
    fuelType: z.string(),
    automatic: z.string(),
    greenScore: z.string(),
    pollutionLevel: z.string(),
    engineCc: z.string(),
    weight: z.string(),
    effectiveDate: z.string(),
    adjustedPrice: z.number(),
  }),
});

// ---------- getCatalog ----------

/** allowed (default): own group and lower + family when eligible (F3). all: every catalog car, for name → id lookup. */
export const GetCatalogInput = z.object({ scope: z.enum(["allowed", "all"]).optional() });
export const GetCatalogOutput = z.object({ cars: z.array(CarSchema), missing: z.array(MissingFieldSchema) });

// ---------- checkEligibility ----------

export const CheckEligibilityInput = z.object({ option: SituationSchema });
export const CheckEligibilityOutput = EligibilitySchema;

// ---------- getValueOfUse / searchValueOfUse ----------

const code5 = z.string().regex(/^\d{5}$/, "5-digit code with leading zeros");

export const GetValueOfUseInput = z.object({
  makeCode: code5,
  modelCode: code5,
  regYear: z.number().int().min(2000).max(2100).optional(),
  vehicleTypeCode: z.string().regex(/^\d+$/).optional(),
  taxYear: z.number().int().min(2000).max(2100).optional(),
});
export const GetValueOfUseOutput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    value: z.number(),
    record: VouRecordSchema,
    matchedBy: z.enum(["key", "partial"]),
    /** True for a partial match: show make/model/year to the employee and confirm before using the value. */
    mustConfirm: z.boolean(),
  }),
  z.object({ status: z.literal("ambiguous"), candidates: z.array(VouRecordSchema), truncated: z.boolean() }),
  z.object({ status: z.literal("not_found") }),
]);

export const SearchValueOfUseInput = z.object({
  query: z.string().trim().min(1),
  regYear: z.number().int().min(2000).max(2100).optional(),
  makeCode: code5.optional(),
});
export const SearchValueOfUseOutput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("candidates"), candidates: z.array(VouRecordSchema), truncated: z.boolean() }),
  z.object({ status: z.literal("not_found") }),
]);

// ---------- updateProfile ----------

/** Percent fields arrive as the employee said them (6 for 6%); the tool converts to a fraction, never the LLM. */
const percent = z.number().min(0).max(100);

const update = <F extends ProfileField, V extends z.ZodType>(field: F, value: V) =>
  z.object({ field: z.literal(field), value, source: ProfileSourceSchema });

export const ProfileUpdateSchema = z.discriminatedUnion("field", [
  update("occupation", z.string().trim().min(1)),
  update("group", z.string().trim().min(1)),
  update("baseSalary", money),
  update("commissions", money),
  update("bonus", money),
  update("pensionPct", percent),
  update("studyFundPct", percent),
  update("creditPoints", z.number().nonnegative()),
  update("childrenUnder23", z.number().int().nonnegative()),
  update("current", SituationSchema),
]);
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

export const UpdateProfileInput = z.object({ updates: z.array(ProfileUpdateSchema).min(1) });
export const UpdateProfileOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    profile: ProfileSchema,
    sources: z.partialRecord(ProfileFieldSchema, ProfileSourceSchema),
    missing: z.array(MissingFieldSchema),
  }),
  z.object({
    ok: z.literal(false),
    errors: z.array(
      z.object({
        field: ProfileFieldSchema,
        error: z.enum(["unknown_group", "unknown_occupation", "unknown_car"]),
        options: z.array(z.string()).optional(),
      }),
    ),
  }),
]);

// ---------- compareOptions ----------

export const CompareOptionsInput = z.object({ options: z.array(SituationSchema).min(1).max(4) });
export const CompareOptionsOutput = z.object({
  today: OptionResultSchema.extend({ display: DisplaySchema.omit({ diffVsToday: true, direction: true }) }),
  options: z.array(DisplayedOptionSchema),
});

// ---------- askRepresentative ----------

/**
 * What a representative can answer as data (M5). Each field maps to one tool path, so an answer is applied by
 * updateProfile / compareOptions and never reaches the employee as free text.
 * - participation: the participation in a specific catalog car (`carId`), usually the requested one
 * - current: the employee's current car (+ participation) or waiver, e.g. a car that is not in the catalog
 * - group / occupation: picked from the rules / occupations lists
 */
export const REP_FIELDS = ["participation", "current", "group", "occupation"] as const;
export const RepFieldSchema = z.enum(REP_FIELDS);
export type RepField = z.infer<typeof RepFieldSchema>;

export const AskRepresentativeInput = z
  .object({
    question: z.string().trim().min(1),
    field: RepFieldSchema,
    /** Required for participation: the catalog car the question is about. */
    carId: z.string().trim().min(1).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((q) => q.field !== "participation" || q.carId !== undefined, { message: "participation needs carId", path: ["carId"] });
export const AskRepresentativeOutput = z.object({ questionId: z.string().min(1), status: z.literal("open") });

/** A representative's answer: typed per field. Range checks that depend on the car live in the rep-answer service. */
export const RepAnswerSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("participation"), carId: z.string().min(1), value: money }),
  z.object({ field: z.literal("current"), situation: SituationSchema }),
  z.object({ field: z.literal("group"), value: z.string().trim().min(1) }),
  z.object({ field: z.literal("occupation"), value: z.string().trim().min(1) }),
]);
export type RepAnswer = z.infer<typeof RepAnswerSchema>;
