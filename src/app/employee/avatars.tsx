import { UserRound } from "lucide-react";

/** The assistant: the logo's petal fan (the right part of the logo image) in a light blue circle. */
export function AssistantAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-11" : "size-8";
  return (
    <span aria-hidden className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand-blue),white_88%)]`}>
      <span
        className="block size-[70%] bg-no-repeat"
        style={{ backgroundImage: "url(/brand/strauss-logo.png)", backgroundSize: "236% auto", backgroundPosition: "100% 45%" }}
      />
    </span>
  );
}

export function UserAvatar() {
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
      <UserRound className="size-4" />
    </span>
  );
}
