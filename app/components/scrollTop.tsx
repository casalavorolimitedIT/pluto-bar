"use client";

import { useEffect, useState } from "react";

const ScrollTop = () => {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={scrollToTop}
      className={[
        "fixed bottom-6 right-5 z-40 flex h-12 w-12 items-center justify-center sm:bottom-8 sm:right-6",
        "rounded-full border border-[var(--brown)]/50 bg-[var(--ink)] backdrop-blur-sm",
        "text-white shadow-[0_10px_28px_-6px_rgba(46,38,27,0.5)]",
        "transition-all duration-500 ease-in-out",
        "hover:border-[var(--brown)] hover:shadow-[0_14px_34px_-6px_rgba(46,38,27,0.6)] hover:scale-110",
        "active:scale-95",
        showScrollTop
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-6 opacity-0",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 transition-transform duration-300"
      >
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>

      <span
        className={[
          "absolute inset-0 rounded-full border border-[var(--tan)]/40",
          "transition-all duration-700",
          showScrollTop ? "pluto-spin scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      />
    </button>
  );
};

export default ScrollTop;
