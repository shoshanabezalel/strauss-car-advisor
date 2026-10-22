"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** The rep screen's access code (M7, demo scope). A correct code sets an httpOnly session cookie; the page re-renders. */
export function RepLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/rep/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        return setError(body.message ?? "לא הצלחתי להיכנס.");
      }
      router.refresh();
    } catch {
      setError("לא הצלחתי להתחבר לשרת. אפשר לנסות שוב.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col px-4 py-10">
      <Card data-testid="rep-login">
        <CardHeader>
          <CardTitle>כניסה לנציגי הרכב</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <label className="flex flex-col gap-1 text-sm">
              קוד גישה
              <input
                type="password"
                autoComplete="current-password"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                data-testid="rep-code"
              />
            </label>
            {error && (
              <Alert variant="destructive" data-testid="rep-login-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" variant="brand" disabled={sending || !code} data-testid="rep-login-submit">
              <LogIn /> כניסה
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
