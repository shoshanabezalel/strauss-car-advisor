import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadConfig } from "@/lib/config";

export default function Home() {
  const { catalog, occupations, employees } = loadConfig();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">יועץ הרכב – שטראוס</h1>
      <p className="text-muted-foreground">
        מה יקרה לנטו שלי אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?
      </p>
      <p data-testid="config-status" className="rounded-md border px-4 py-2 text-sm">
        נטענו {catalog.cars.length} רכבים · {occupations.occupations.length} עיסוקים ·{" "}
        {employees.employees.length} עובדים
      </p>
      <Button asChild size="lg">
        <Link href="/employee">להתחלת שיחה</Link>
      </Button>
    </main>
  );
}
