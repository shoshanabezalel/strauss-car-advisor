import type { Metadata } from "next";
import { isMockMode } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { RepQueue, type RepOptions } from "./rep-queue";

export const metadata: Metadata = { title: "יועץ הרכב – נציג/ת" };

export default function RepPage() {
  const config = loadConfig();
  // Choices for the answer forms come from the data files, so the rep can only pick known values.
  const options: RepOptions = {
    cars: config.catalog.cars.map((c) => ({ id: c.id, label: `${c.make} ${c.model}`, group: c.group })),
    groups: config.rules.groupOrder,
    occupations: config.occupations.occupations.map((o) => o.name),
  };
  return (
    <main className="flex flex-1 flex-col">
      <RepQueue mock={isMockMode()} options={options} />
    </main>
  );
}
