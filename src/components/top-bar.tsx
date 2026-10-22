import Image from "next/image";
import { AssistantAvatar } from "@/app/employee/avatars";

/** The sticky bar on every screen: petal avatar, title and subtitle, the screen's actions, the logo. */
export function TopBar({
  title,
  subtitle,
  start,
  end,
  tour,
}: {
  title: string;
  subtitle?: string;
  /** Before the avatar (the employee's ☰ on phones). */
  start?: React.ReactNode;
  /** Before the logo (help, logout, demo badge). */
  end?: React.ReactNode;
  tour?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 shadow-sm backdrop-blur" data-tour={tour} data-testid="top-bar">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {start}
          <AssistantAvatar size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {end}
          <Image src="/brand/strauss-logo.png" alt="שטראוס" width={48} height={36} priority unoptimized className="hidden sm:block" />
        </div>
      </div>
    </header>
  );
}
