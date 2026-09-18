"use client";

import { useCallback, useEffect, useState } from "react";
import ReviewComposer from "./ReviewComposer";
import SmartImage from "./smart-images";

type Addon = {
  id: string;
  name: string;
  price: number;
};

type PriceOption = {
  id: string;
  label: string;
  price_amount: number;
  sort_order: number;
};

export type ModalMenuItem = {
  name: string;
  description: string | null;
  price_mode: string;
  price_amount: number | null;
  image_url: string | null;
  sku: string;
  category_name: string;
  kitchen_slug: string;
  addons?: Addon[];
  price_options?: PriceOption[];
};

function formatPrice(item: ModalMenuItem): string {
  if (item.price_mode === "tbd") return "Price on request";

  if (item.price_mode === "variable") {
    const sorted = [...(item.price_options ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    if (sorted.length === 0) return "Variable pricing";
    const lowest = sorted[0].price_amount;
    const highest = sorted[sorted.length - 1].price_amount;
    if (lowest === highest) return `₦${lowest.toLocaleString()}`;
    return `₦${lowest.toLocaleString()} – ₦${highest.toLocaleString()}`;
  }

  if (item.price_amount === null) return "–";
  return `₦${item.price_amount.toLocaleString()}`;
}

interface MenuItemModalProps {
  item: ModalMenuItem | null;
  onClose: () => void;
}

export default function MenuItemModal({ item, onClose }: MenuItemModalProps) {
  const [isApprovedOpen, setIsApprovedOpen] = useState(false);
  const [approvedReviews, setApprovedReviews] = useState<
    Array<{
      id: string;
      rating: number;
      feedback: string;
      reviewer_name?: string | null;
      created_at: string;
    }>
  >([]);

  const [isLoadingApprovedReviews, setIsLoadingApprovedReviews] =
    useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!item) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [item, handleKeyDown]);

  useEffect(() => {
    if (!item) return;
    setIsApprovedOpen(false);

    let cancelled = false;
    setIsLoadingApprovedReviews(true);

    async function loadApprovedReviews() {
      try {
        const response = await fetch(
          `/api/landing/pluto/reviews?target=item&kitchenSlug=${item?.kitchen_slug}&itemSku=${encodeURIComponent(item?.sku ?? "")}&limit=8`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          if (!cancelled) {
            setApprovedReviews([]);
          }
          return;
        }

        const payload = (await response.json()) as {
          reviews?: Array<{
            id: string;
            rating: number;
            feedback: string;
            reviewer_name?: string | null;
            created_at: string;
          }>;
        };

        if (!cancelled) {
          setApprovedReviews(payload.reviews ?? []);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingApprovedReviews(false);
        }
      }
    }

    void loadApprovedReviews();

    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const sortedOptions = [...(item.price_options ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const addons = item.addons ?? [];

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-clip sm:items-center"
      onClick={onClose}
    >
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto overflow-hidden
                   border border-[var(--tan)]/50 bg-white
                   shadow-[0_20px_60px_rgba(46,38,27,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hero image ── */}
        <div className="relative w-full aspect-[16/9] bg-[var(--tan-soft)]">
          <SmartImage
            src={item.image_url ?? "/placeholder.png"}
            alt={item.name}
            fill
            className="object-cover"
            fallbackVariant="initials"
            label={item.name}
            wrapperClassName="w-full h-full"
          />

          {/* Category pill on top-left */}
          <span className="absolute left-4 top-4 border border-white/50 bg-[var(--ink)]/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-white backdrop-blur-sm">
            {item.category_name}
          </span>

          {/* Close button */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center
                       rounded-full bg-[var(--ink)]/60 text-white backdrop-blur-sm
                       transition-colors hover:bg-[var(--ink)]/80"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-4 w-4"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* Price badge on bottom-right of image */}
          <div className="absolute bottom-4 right-4 border border-white/40 bg-[var(--ink)]/70 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-base font-light tracking-wide text-white">
              {formatPrice(item)}
            </span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="space-y-4 px-6 py-5">
          {/* Name */}
          <h2 className="font-display text-2xl font-light leading-snug tracking-wide text-[var(--ink)]">
            {item.name}
          </h2>

          {/* Divider */}
          <div className="h-px w-12 bg-[var(--tan)]" />

          {/* Description */}
          {item.description && (
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              {item.description}
            </p>
          )}

          {/* Variable price options */}
          {item.price_mode === "variable" && sortedOptions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--brown)]">
                Options
              </p>
              <ul className="divide-y divide-[var(--tan)]/25">
                {sortedOptions.map((opt) => (
                  <li
                    key={opt.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-[var(--ink)]">{opt.label}</span>
                    <span className="text-sm text-[var(--ink)]">
                      ₦{opt.price_amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add-ons */}
          {addons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--brown)]">
                Choice of
              </p>
              <div className="flex flex-wrap gap-2">
                {addons.map((addon) => (
                  <span
                    key={addon.id}
                    className="inline-flex items-center gap-1 border border-[var(--tan)]/50 px-2.5 py-1 text-xs text-[var(--ink)]"
                  >
                    {addon.name}
                    {addon.price > 0 && (
                      <span className="text-[var(--ink-soft)]">
                        +₦{addon.price.toLocaleString()}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-[var(--tan)]/30 pt-4">
            <button
              type="button"
              onClick={() => setIsApprovedOpen((prev) => !prev)}
              className="group flex w-full items-center justify-between border border-[var(--tan)]/50 bg-[var(--tan-soft)]/15 px-3 py-2.5 transition hover:border-[var(--brown)]/50 hover:bg-[var(--tan-soft)]/30"
            >
              <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--brown)]">
                Approved Reviews
              </span>
              <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                {isLoadingApprovedReviews
                  ? "Loading"
                  : `${Math.min(approvedReviews.length, 3)} shown`}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isApprovedOpen ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden="true"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            <div
              className={`grid transition-all duration-300 ease-out ${
                isApprovedOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 pt-2">
                  {isLoadingApprovedReviews && (
                    <p className="text-xs text-[var(--ink-soft)]">
                      Loading recent reviews...
                    </p>
                  )}

                  {!isLoadingApprovedReviews &&
                    approvedReviews.length === 0 && (
                      <p className="text-xs text-[var(--ink-soft)]">
                        No approved reviews yet. Be the first to share feedback.
                      </p>
                    )}

                  {!isLoadingApprovedReviews && approvedReviews.length > 0 && (
                    <ul className="space-y-2">
                      {approvedReviews.slice(0, 3).map((review) => (
                        <li
                          key={review.id}
                          className="border border-[var(--tan)]/40 bg-[var(--tan-soft)]/10 p-2.5"
                        >
                          <p className="text-xs text-[var(--brown)]">
                            ★ {review.rating.toFixed(1)}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">
                            {review.feedback}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ink)]">
                            {review.reviewer_name ?? "Anonymous"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <p className="pt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--brown)]/80">
              Leave your review
            </p>
            <ReviewComposer
              kitchenSlug={item.kitchen_slug}
              itemSku={item.sku}
              itemName={item.name}
              defaultTarget="item"
              allowTargetSwitch
              triggerSource="item_modal"
            />
          </div>

          {/* SKU — subtle footer */}
          <p className="pt-1 text-[10px] uppercase tracking-widest text-[var(--ink-soft)]/70">
            Ref: {item.sku}
          </p>
        </div>
      </div>
    </div>
  );
}
