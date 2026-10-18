import type { Car, Rules } from "@/lib/config/schemas";

/** Highest participation a representative may enter for this car: the rules cap or the car's monthly cost, whichever is lower. */
export function maxParticipation(car: Pick<Car, "monthlyCost">, rules: Pick<Rules, "participation">): number {
  return Math.min(rules.participation.max, car.monthlyCost);
}
