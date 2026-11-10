"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ReviewLink } from "../lib/review-link";

export default function ReviewBubble({
  reviewLink,
  businessName = "us",
}: {
  reviewLink: ReviewLink;
  businessName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const { qrImage, reviewUrl } = reviewLink;
  if (!qrImage && !reviewUrl) return null;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-8 sm:right-8"
    >
      {isOpen ? (
        <div
          id="review-panel"
          role="dialog"
          aria-label="Leave a review"
          className="w-[17rem] origin-bottom-right rounded-2xl border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(50,25,0,0.18)] backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                Enjoyed your visit?
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                A quick review helps {businessName} a lot.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="-mr-1 -mt-1 cursor-pointer rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Close review panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {qrImage ? (
            <>
              <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white p-3">
                <Image
                  src={qrImage}
                  alt={`Scan to review ${businessName} on Google`}
                  width={220}
                  height={220}
                  unoptimized
                  className="h-auto w-full"
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-zinc-500">
                Scan with your phone camera
              </p>
            </>
          ) : null}

          {/* Already on a phone? The QR is unscannable there, so tap through instead. */}
          {reviewUrl ? (
            <>
              {qrImage ? (
                <div className="my-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-zinc-200" />
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    or
                  </span>
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>
              ) : (
                <div className="mt-3" />
              )}

              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 text-[13px] font-medium text-white shadow-[0_8px_20px_rgba(249,115,22,0.3)] transition hover:bg-orange-600"
              >
                Open Google review
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="review-panel"
        className="flex h-12 cursor-pointer items-center gap-2 rounded-full border border-white/70 bg-white/90 px-4 text-[13px] font-medium text-zinc-700 shadow-[0_12px_32px_rgba(50,25,0,0.16)] backdrop-blur-xl transition hover:bg-white hover:text-zinc-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-orange-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <line x1="14" y1="14" x2="14" y2="14.01" />
          <line x1="18" y1="14" x2="21" y2="14" />
          <line x1="21" y1="17" x2="21" y2="21" />
          <line x1="14" y1="18" x2="14" y2="21" />
          <line x1="17" y1="21" x2="18" y2="21" />
        </svg>
        <span>Review us</span>
      </button>
    </div>
  );
}
