"use client";

import { CircleQuestionMark } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/tour/steps";
import { DESKTOP_QUERY, hasSeen, markSeen, placeBubble, selectorFor, stepContent, type Rect, type TourScreen } from "@/lib/tour/tour";

const HELP_SELECTOR = '[data-tour="tour-help"]';
/** Space between the target and its spotlight ring. */
const RING = 4;

const storage = () => window.localStorage;

/**
 * Onboarding tour (docs/TOUR.md): starts by itself on the first visit to a screen, `start` restarts it ("?" button).
 * Render `node` once, anywhere on the screen.
 */
export function useTour(screen: TourScreen, steps: TourStep[]): { start: () => void; node: ReactNode } {
  const [index, setIndex] = useState<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const start = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(0);
  }, []);

  const close = useCallback(() => {
    setIndex(null);
    const back = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>(HELP_SELECTOR);
    back?.focus();
  }, []);

  // First visit only. Marked seen as soon as it shows, so skipping or reloading never brings it back by itself.
  // Next frame, after the screen's first paint; checked inside the callback so a cancelled frame marks nothing.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (hasSeen(screen, storage)) return;
      markSeen(screen, storage);
      start();
    });
    return () => cancelAnimationFrame(frame);
  }, [screen, start]);

  const node = index === null ? null : <TourBubble steps={steps} index={index} onIndex={setIndex} onClose={close} />;
  return { start, node };
}

export function TourHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label="הפעלת ההדרכה" title="הפעלת ההדרכה" data-tour="tour-help">
      <CircleQuestionMark />
    </Button>
  );
}

/** The first matching element that is actually laid out (not display:none, e.g. a panel hidden on this breakpoint). */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

interface Layout {
  target: Rect | null;
  bubble: { width: number; height: number };
  viewport: { width: number; height: number };
}

function TourBubble({ steps, index, onIndex, onClose }: { steps: TourStep[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const step = steps[index];
  const last = index === steps.length - 1;
  const [layout, setLayout] = useState<Layout | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const textId = useId();
  const counterId = useId();

  // Find the step's target, bring it into view, and keep the bubble next to it on resize and scroll.
  useLayoutEffect(() => {
    const target = findVisible(selectorFor(step, window.matchMedia(DESKTOP_QUERY).matches));
    target?.scrollIntoView({ block: "center" });
    const measure = () => {
      const r = target?.isConnected ? target.getBoundingClientRect() : null;
      const b = bubbleRef.current;
      setLayout({
        target: r && { top: r.top, left: r.left, width: r.width, height: r.height },
        bubble: { width: b?.offsetWidth ?? 0, height: b?.offsetHeight ?? 0 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Esc closes; Tab stays inside the bubble.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !bubbleRef.current) return;
      const focusable = [...bubbleRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const inside = bubbleRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const target = layout?.target ?? null;
  const { text, centered } = stepContent(step, target !== null);
  const pos = target && layout ? placeBubble(target, layout.viewport, layout.bubble) : null;
  const arrowX = pos && target ? Math.min(Math.max(target.left + target.width / 2 - pos.left, 20), layout!.bubble.width - 20) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="tour-overlay">
      {target && !centered ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary"
          style={{
            top: target.top - RING,
            left: target.left - RING,
            width: target.width + RING * 2,
            height: target.height + RING * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/45" />
      )}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={counterId}
        aria-describedby={textId}
        dir="rtl"
        data-testid="tour"
        data-step={step.id}
        data-centered={centered}
        className={`fixed flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg ${
          pos ? "" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
      >
        {pos && (
          <span
            aria-hidden
            className={`absolute size-3 rotate-45 border bg-popover ${pos.arrow === "up" ? "-top-1.5 border-r-0 border-b-0" : "-bottom-1.5 border-l-0 border-t-0"}`}
            style={{ left: arrowX - 6 }}
          />
        )}
        <p id={counterId} className="text-xs text-muted-foreground">
          {index + 1} מתוך {steps.length}
        </p>
        <p id={textId} className="text-sm leading-relaxed" data-testid="tour-text">
          {text}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} data-testid="tour-skip">
            דילוג
          </Button>
          <span className="flex-1" />
          {index > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => onIndex(index - 1)} data-testid="tour-prev">
              הקודם
            </Button>
          )}
          <Button ref={nextRef} type="button" size="sm" onClick={() => (last ? onClose() : onIndex(index + 1))} data-testid="tour-next">
            {last ? "סיום" : "הבא"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
