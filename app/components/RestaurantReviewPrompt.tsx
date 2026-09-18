"use client";

import { useEffect, useMemo, useState } from "react";
import ReviewComposer from "./ReviewComposer";

interface RestaurantReviewPromptProps {
  kitchenSlug: string;
}

const TIME_THRESHOLD_MS = 25_000;
const SCROLL_THRESHOLD = 0.6;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STORAGE_DISMISS_UNTIL = "pluto_bar_review_prompt_dismiss_until";

export default function RestaurantReviewPrompt({
  kitchenSlug,
}: RestaurantReviewPromptProps) {
  const [timeMet, setTimeMet] = useState(false);
  const [scrollMet, setScrollMet] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissUntilRaw = localStorage.getItem(STORAGE_DISMISS_UNTIL);
    const dismissUntil = dismissUntilRaw ? Number(dismissUntilRaw) : 0;

    if (dismissUntil > Date.now()) {
      setIsDismissed(true);
      return;
    }

    const timer = window.setTimeout(() => setTimeMet(true), TIME_THRESHOLD_MS);

    const onScroll = () => {
      const scrollTop = window.scrollY;
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;

      if (scrollTop / scrollable >= SCROLL_THRESHOLD) {
        setScrollMet(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!isDismissed && timeMet && scrollMet) {
      setIsOpen(true);
    }
  }, [isDismissed, timeMet, scrollMet]);

  const shouldRender = useMemo(
    () => !isDismissed && isOpen,
    [isDismissed, isOpen],
  );

  function dismissPrompt() {
    setIsOpen(false);
    setIsDismissed(true);
    localStorage.setItem(
      STORAGE_DISMISS_UNTIL,
      String(Date.now() + COOLDOWN_MS),
    );
  }

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-3 z-40 px-3 sm:bottom-4 sm:px-6">
      <div className="mx-auto w-full max-w-xl border border-[var(--tan)]/60 bg-white p-4 shadow-[0_14px_38px_rgba(46,38,27,0.18)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--brown)]">
              Your feedback helps
            </p>
            <h3 className="font-display mt-1 text-base text-[var(--ink)]">
              How was your experience at Pluto Bar?
            </h3>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            Dismiss
          </button>
        </div>

        <ReviewComposer
          kitchenSlug={kitchenSlug}
          defaultTarget="restaurant"
          triggerSource="restaurant_smart_prompt"
          onSubmitted={dismissPrompt}
        />
      </div>
    </div>
  );
}
