import type { Metadata } from "next";
import { Suspense } from "react";
import { createAgentState } from "@/lib/agent";
import { isMockMode } from "@/lib/agent/model";
import { demoPrompts } from "@/lib/agent/mock-model";
import { toProfileView } from "@/lib/chat/profile-view";
import { loadConfig } from "@/lib/config";
import { EmployeeChat } from "./employee-chat";

export const metadata: Metadata = { title: "יועץ הרכב – עובד/ת" };

export default function EmployeePage() {
  const config = loadConfig();
  const mock = isMockMode();
  const carLabels = Object.fromEntries(config.catalog.cars.map((c) => [c.id, `${c.make} ${c.model}`]));

  return (
    <main className="flex flex-1 flex-col">
      {/* useSearchParams (?c=) needs a Suspense boundary with Cache Components. */}
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">טוען…</p>}>
        <EmployeeChat
          mock={mock}
          demoPrompts={mock ? demoPrompts(config) : []}
          carLabels={carLabels}
          emptyProfile={toProfileView(createAgentState(), config)}
        />
      </Suspense>
    </main>
  );
}
