import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { TopBar } from "@/components/top-bar";
import { isMockMode } from "@/lib/agent/model";
import { loadConfig } from "@/lib/config";
import { appSecret } from "@/lib/env";
import { REP_COOKIE, verifyRepSession } from "@/lib/security/rep-session";
import { RepLogin } from "./rep-login";
import type { RepOptions } from "./rep-queue";
import { RepScreen } from "./rep-screen";

export const metadata: Metadata = { title: "יועץ הרכב – צוות הרכב" };

export default function RepPage() {
  return (
    <main className="flex flex-1 flex-col">
      <TopBar title="צוות הרכב" subtitle="שאלות של עובדים ופערי מידע" />
      {/* cookies() is request data: with Cache Components it must sit inside a Suspense boundary. */}
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">טוען…</p>}>
        <RepGate />
      </Suspense>
    </main>
  );
}

/** The rep screen (questions + information gaps) for a valid rep session (M7 access code), the login form otherwise. The API checks the same cookie. */
async function RepGate() {
  // Session checks read the clock: wait for a real request (never prerendered or prefetched).
  await connection();
  const session = (await cookies()).get(REP_COOKIE)?.value;
  if (!verifyRepSession(session, appSecret())) return <RepLogin />;

  const config = loadConfig();
  // Choices for the answer forms come from the data files, so the rep can only pick known values.
  const options: RepOptions = {
    cars: config.catalog.cars.map((c) => ({ id: c.id, label: `${c.make} ${c.model}`, group: c.group })),
    groups: config.rules.groupOrder,
    occupations: config.occupations.occupations.map((o) => o.name),
  };
  return <RepScreen mock={isMockMode()} options={options} />;
}
