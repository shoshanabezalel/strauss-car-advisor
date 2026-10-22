import { z } from "zod";

/**
 * Zod schemas for everything in data/. Group names are plain strings validated
 * against rules.groupOrder (see validateConfig) so that the data — not the code —
 * defines which groups exist.
 */

const rate = z.number().min(0).max(1);
const money = z.number().nonnegative();
const note = z.string().optional();

// Drive codes follow rules.valueOfUse.driveField: 0 petrol, 1 hybrid, 2 plug-in, 3 electric.
export const DRIVES = ["petrol", "hybrid", "plugin", "electric"] as const;
export const DriveSchema = z.enum(DRIVES);
export type Drive = z.infer<typeof DriveSchema>;

export const GroupSchema = z.string().min(1);
export type Group = z.infer<typeof GroupSchema>;

// ---------- rules ----------

const BracketsSchema = z
  .array(z.tuple([z.number().positive().nullable(), rate]))
  .min(1)
  .superRefine((brackets, ctx) => {
    brackets.forEach(([cap], i) => {
      const isLast = i === brackets.length - 1;
      if (isLast && cap !== null) {
        ctx.addIssue({ code: "custom", message: "last bracket cap must be null (open-ended)", path: [i, 0] });
      }
      if (!isLast && cap === null) {
        ctx.addIssue({ code: "custom", message: "only the last bracket may have a null cap", path: [i, 0] });
      }
      const prev = i > 0 ? brackets[i - 1][0] : null;
      if (cap !== null && prev !== null && cap <= prev) {
        ctx.addIssue({ code: "custom", message: "bracket caps must be strictly ascending", path: [i, 0] });
      }
    });
  });

const TwoTierSchema = z
  .object({ threshold: money, ceiling: money, lowRate: rate, highRate: rate })
  .refine((t) => t.threshold < t.ceiling, { message: "threshold must be below ceiling" });

const PayslipRangeSchema = z
  .object({ min: z.number(), max: z.number(), step: z.number().positive().optional() })
  .refine((r) => r.min <= r.max, { message: "min must not exceed max" });
export type PayslipRange = z.infer<typeof PayslipRangeSchema>;

export const RulesSchema = z
  .object({
    version: z.string().min(1),
    note,
    budgets: z.record(GroupSchema, money),
    groupOrder: z.array(GroupSchema).min(1),
    chooseFrom: z.literal("own_group_or_lower"),
    electric: z.object({
      netBonus: money,
      // gross_up: employer grosses up so the employee nets exactly netBonus; flat: netBonus is paid as taxable gross.
      method: z.enum(["gross_up", "flat"]),
      note,
    }),
    familyTrack: z.object({
      minChildren: z.number().int().positive(),
      childMaxAge: z.number().int().positive(),
      cars: z.array(z.string().min(1)).min(1),
      priceSource: z.literal("catalogue"),
      gapSplitEmployee: rate,
      note,
    }),
    waiver: z.object({
      allowedBy: z.literal("occupation"),
      maintenanceIsTaxable: z.boolean(),
      maintenanceIsPensionable: z.boolean(),
    }),
    unusedBudget: z.literal("not_paid"),
    // Upper bound for a participation a representative enters: min(max, the car's catalog monthlyCost).
    participation: z.object({ max: money.positive(), note }),
    netMethod: z.object({
      basis: z.literal("monthly"),
      taxYear: z.number().int(),
      creditPointValue: money,
      brackets: BracketsSchema,
      nationalInsurance: TwoTierSchema,
      health: TwoTierSchema,
      pensionCredit: z.object({
        rate,
        maxContributionRate: rate,
        incomeCeiling: money,
        note,
      }),
      contributionsBase: z.literal("gross"),
      contributionsNote: note,
      participation: z.object({
        treatment: z.literal("net_deduction"),
        reducesValueOfUse: z.boolean(),
        note,
      }),
      rounding: z.object({
        during: z.literal("none"),
        display: z.literal("shekel"),
        note,
      }),
      note,
    }),
    valueOfUse: z.object({
      source: z.string(),
      taxYear: z.number().int().min(2000).max(2100),
      key: z.array(z.string().min(1)).length(5),
      driveField: z.record(z.string(), z.string().min(1)).refine(
        (m) => {
          const keys = Object.keys(m).sort();
          return keys.length === DRIVES.length && keys.every((k, i) => k === String(i));
        },
        { message: `driveField keys must be exactly 0..${DRIVES.length - 1}` },
      ),
    }),
    // F6: plausible values read from a payslip; outside → not read (null), never fixed. Percents as printed (6 = 6%).
    payslip: z.object({
      ranges: z.object({
        baseSalary: PayslipRangeSchema,
        commissions: PayslipRangeSchema,
        bonus: PayslipRangeSchema,
        pensionPct: PayslipRangeSchema,
        studyFundPct: PayslipRangeSchema,
        creditPoints: PayslipRangeSchema,
      }),
      note,
    }),
    // F8: how many cars a constraint search shows: matches, and the nearest misses when nothing matches.
    search: z.object({ maxMatches: z.number().int().positive(), nearestCount: z.number().int().positive(), note }),
  })
  .superRefine((r, ctx) => {
    for (const g of r.groupOrder) {
      if (!(g in r.budgets)) {
        ctx.addIssue({ code: "custom", message: `missing budget for group "${g}"`, path: ["budgets", g] });
      }
    }
    for (const g of Object.keys(r.budgets)) {
      if (!r.groupOrder.includes(g)) {
        ctx.addIssue({ code: "custom", message: `budget for group "${g}" not in groupOrder`, path: ["budgets", g] });
      }
    }
  });
export type Rules = z.infer<typeof RulesSchema>;

// ---------- catalog ----------

const code5 = z.string().regex(/^\d{5}$/, "must be a 5-digit string (keep leading zeros)");

export const CarSchema = z.object({
  id: z.string().min(1),
  group: GroupSchema,
  make: z.string().min(1),
  makeCode: code5,
  model: z.string().min(1),
  modelCode: code5,
  modelDescription: z.string(),
  vehicleTypeCode: z.string().regex(/^\d+$/),
  regYear: z.number().int().min(2000).max(2100),
  drive: DriveSchema,
  listPrice: money,
  valueOfUse: money,
  monthlyCost: money,
  defaultParticipation: money,
});
export type Car = z.infer<typeof CarSchema>;

export const CatalogSchema = z.object({ source: z.string(), cars: z.array(CarSchema).min(1) });
export type Catalog = z.infer<typeof CatalogSchema>;

// ---------- occupations ----------

export const OccupationSchema = z.object({
  name: z.string().min(1),
  group: GroupSchema,
  carMandatory: z.boolean(),
  waiverAllowed: z.boolean(),
  maintenance: money,
});
export type Occupation = z.infer<typeof OccupationSchema>;

export const OccupationsSchema = z.object({ source: z.string(), occupations: z.array(OccupationSchema).min(1) });
export type Occupations = z.infer<typeof OccupationsSchema>;

// ---------- situations & sample employees ----------

// Where a value came from. catalog_default = not confirmed by anyone yet.
export const PARTICIPATION_SOURCES = ["employee", "rep", "catalog_default"] as const;
export const ParticipationSourceSchema = z.enum(PARTICIPATION_SOURCES);
export type ParticipationSource = z.infer<typeof ParticipationSourceSchema>;

export const SituationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("car"),
    carId: z.string().min(1),
    // Omitted → the engine uses the car's catalog defaultParticipation and flags it as needing confirmation.
    participation: money.optional(),
    participationSource: ParticipationSourceSchema.optional(),
  }),
  z.object({ kind: z.literal("waiver") }), // maintenance derived from occupation
]);
export type Situation = z.infer<typeof SituationSchema>;

export const SampleEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nationalId: z.string().regex(/^\d{9}$/),
  question: z.string(),
  profile: z.object({
    occupation: z.string().min(1),
    group: GroupSchema,
    baseSalary: money,
    commissions: money,
    bonus: money,
    pensionPct: rate, // fraction (6% → 0.06)
    studyFundPct: rate,
    creditPoints: z.number().nonnegative(),
    childrenUnder23: z.number().int().nonnegative(),
    current: SituationSchema,
  }),
  alternative: SituationSchema,
  // Reference data only: marks that the sheet used the catalog default (product rule: TECH-DESIGN §10).
  alternativeParticipationSource: z.literal("catalog_default (reference data)").optional(),
  expected: z.object({
    eligible: z.boolean(),
    reason: z.string(),
    netToday: z.number(),
    netAlt: z.number(),
    diff: z.number(),
    taxToday: z.number(),
    taxAlt: z.number(),
    niHealthToday: z.number(),
    niHealthAlt: z.number(),
    electricGross: z.number(),
    familyGapEmployee: z.number(),
    why: z.string(),
  }),
});
export type SampleEmployee = z.infer<typeof SampleEmployeeSchema>;

export const SampleEmployeesSchema = z.object({
  source: z.string(),
  employees: z.array(SampleEmployeeSchema).min(1),
});
export type SampleEmployees = z.infer<typeof SampleEmployeesSchema>;

// ---------- challenge script (A7) ----------

/** The brief's scripted conversation (data/challenge-script.json): drives the A7 demo and tests. */
export const ChallengeScriptSchema = z.object({
  source: z.string(),
  note,
  /** Fields the brief leaves open; their values were chosen for the demo. */
  assumed: z.array(z.string()),
  profile: SampleEmployeeSchema.shape.profile.extend({ occupation: z.string().min(1).optional() }),
  question: z.string().min(1),
  alternative: SituationSchema,
  repAnswer: z.object({ field: z.literal("participation"), carId: z.string().min(1), value: money }),
});
export type ChallengeScript = z.infer<typeof ChallengeScriptSchema>;
