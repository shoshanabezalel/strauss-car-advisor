"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TourHelpButton, useTour } from "@/components/tour/tour";
import { Button } from "@/components/ui/button";
import { REP_TOUR } from "@/lib/tour/steps";
import { GapsPanel } from "./gaps-panel";
import { RepQueue, type RepOptions } from "./rep-queue";

type Tab = "questions" | "gaps";
const TABS: { id: Tab; label: string }[] = [
  { id: "questions", label: "שאלות פתוחות" },
  { id: "gaps", label: "פערי מידע" },
];

/** The rep screen behind the access code: open questions, and the information gaps log (G). The tab is in the URL. */
export function RepScreen({ mock, options }: { mock: boolean; options: RepOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "gaps" ? "gaps" : "questions";
  const tour = useTour("rep", REP_TOUR);

  function select(next: Tab) {
    router.replace(next === "questions" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  async function logout() {
    await fetch("/api/rep/logout", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-4">
      <nav className="flex items-center justify-between gap-2 border-b" aria-label="מסכי צוות הרכב" data-tour="rep-welcome">
        <div className="flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => select(t.id)}
              data-testid={`rep-tab-${t.id}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <TourHelpButton onClick={tour.start} />
          <Button variant="ghost" size="sm" onClick={() => void logout()} data-testid="rep-logout">
            <LogOut /> יציאה
          </Button>
        </div>
      </nav>
      {tab === "questions" ? <RepQueue mock={mock} options={options} /> : <div className="pb-6"><GapsPanel /></div>}
      {tour.node}
    </div>
  );
}
