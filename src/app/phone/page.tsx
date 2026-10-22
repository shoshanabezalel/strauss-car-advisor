import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "יועץ הרכב – תצוגת טלפון" };

/**
 * The real app in a phone-sized frame, for a demo on a desktop screen (user, 22/10). An iframe of the same origin,
 * so the phone breakpoints apply inside it and the conversation and tour work as on a phone. Nothing new inside.
 */
export default function PhonePage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4">
      <Link href="/" className="text-sm text-brand-blue-ink underline underline-offset-4 hover:no-underline">
        חזרה לתצוגת מחשב
      </Link>
      <div className="rounded-[2.5rem] border-[10px] border-foreground bg-foreground shadow-lg">
        <iframe
          src="/"
          title="יועץ הרכב בתצוגת טלפון"
          width={390}
          height={844}
          className="block h-[844px] w-[390px] rounded-[1.75rem] bg-background"
          data-testid="phone-frame"
        />
      </div>
    </main>
  );
}
