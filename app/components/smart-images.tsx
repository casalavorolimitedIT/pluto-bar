"use client";

import NextImage, { ImageProps as NextImageProps } from "next/image";
import { useState, useCallback, CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FallbackVariant = "blur" | "icon" | "initials" | "custom";

interface SmartImageProps extends Omit<NextImageProps, "onLoad" | "onError"> {
  /** Text used to generate initials fallback (e.g. item name) */
  label?: string;

  /** Which fallback style to show on error */
  fallbackVariant?: FallbackVariant;

  /** Custom fallback node rendered when fallbackVariant is "custom" */
  customFallback?: React.ReactNode;

  /**
   * Class applied to the fallback container div.
   * The container already has `position: absolute; inset: 0` as a base —
   * use this to override background, border-radius, padding, etc.
   */
  fallbackClassName?: string;

  /**
   * Inline styles merged into the fallback container div.
   * Merged AFTER the base `position/inset` defaults so you can override them.
   */
  fallbackStyle?: CSSProperties;

  /** Extra classes applied to the outer wrapper div */
  wrapperClassName?: string;

  /** Inline styles applied to the outer wrapper div */
  wrapperStyle?: CSSProperties;

  /** Show shimmer skeleton while loading (default: true) */
  showLoader?: boolean;

  /**
   * Class applied to the spinner container div.
   * The container already has `position: absolute; inset: 0` as a base.
   */
  spinnerClassName?: string;

  /**
   * Inline styles merged into the spinner container div.
   * Useful for overriding background colour, border-radius, etc.
   */
  spinnerStyle?: CSSProperties;

  /**
   * Inline styles merged into the spinning ring element itself.
   * Use to change the ring size, colour, or border width.
   * e.g. { width: 48, height: 48, borderTopColor: "#6366f1" }
   */
  spinnerRingStyle?: CSSProperties;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(label: string): string {
  return label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Deterministic hue from a string so initials always get the same colour */
function labelToHue(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ─── Keyframe styles (injected once) ─────────────────────────────────────────

const KEYFRAMES = `
  @keyframes smartimage-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes smartimage-spin {
    to { transform: rotate(360deg); }
  }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SpinnerProps {
  containerClassName?: string;
  containerStyle?: CSSProperties;
  ringStyle?: CSSProperties;
}

function LoadingSpinner({
  containerClassName,
  containerStyle,
  ringStyle,
}: SpinnerProps) {
  return (
    <div
      aria-label="Loading image"
      role="status"
      className={containerClassName}
      style={{
        // ── base (always applied) ──
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%)",
        // ── caller overrides ──
        ...containerStyle,
      }}
    >
      {/* Shimmer sweep */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
          animation: "smartimage-shimmer 1.6s infinite",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Spinning ring */}
      <div
        style={{
          // ── base ──
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid rgba(0,0,0,0.08)",
          borderTopColor: "rgba(0,0,0,0.35)",
          animation: "smartimage-spin 0.75s linear infinite",
          zIndex: 1,
          flexShrink: 0,
          // ── caller overrides ──
          ...ringStyle,
        }}
      />

      <style>{KEYFRAMES}</style>
    </div>
  );
}

// ── Shared wrapper for all built-in fallback containers ───────────────────────

interface FallbackShellProps {
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}

function FallbackShell({
  ariaLabel,
  className,
  style,
  children,
}: FallbackShellProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={className}
      style={{
        // ── base ──
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        // ── caller overrides ──
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Built-in fallback variants ────────────────────────────────────────────────

interface BuiltInFallbackProps {
  className?: string;
  style?: CSSProperties;
}

function BlurFallback({ className, style }: BuiltInFallbackProps) {
  return (
    <FallbackShell
      ariaLabel="Image unavailable"
      className={className}
      style={{
        backdropFilter: "blur(12px)",
        background:
          "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 50%, #64748b 100%)",
        ...style,
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.75)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Image unavailable
      </span>
    </FallbackShell>
  );
}

function IconFallback({ className, style }: BuiltInFallbackProps) {
  return (
    <FallbackShell
      ariaLabel="Image unavailable"
      className={className}
      style={{
        background: "#f8fafc",
        border: "2px dashed #cbd5e1",
        gap: 10,
        ...style,
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
        <line
          x1="1"
          y1="1"
          x2="23"
          y2="23"
          stroke="#f87171"
          strokeWidth="1.5"
        />
      </svg>
      <span
        style={{
          fontSize: 11,
          color: "#94a3b8",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Broken image
      </span>
    </FallbackShell>
  );
}

function InitialsFallback({
  label,
  className,
  style,
}: BuiltInFallbackProps & { label: string }) {
  const initials = getInitials(label);
  const hue = labelToHue(label);
  return (
    <FallbackShell
      ariaLabel={`Image for ${label}`}
      className={className}
      style={{
        background: `linear-gradient(135deg, hsl(${hue},65%,55%) 0%, hsl(${
          (hue + 40) % 360
        },70%,40%) 100%)`,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: "clamp(1.25rem, 5cqi, 2.5rem)",
          fontWeight: 700,
          color: "rgba(255,255,255,0.92)",
          letterSpacing: "-0.02em",
          userSelect: "none",
          textShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        {initials}
      </span>
    </FallbackShell>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * SmartImage — drop-in next/image replacement with loading, error & fallback states.
 *
 * @example Basic
 * ```tsx
 * <SmartImage
 *   src={item.image}
 *   alt={item.name}
 *   width={640}
 *   height={384}
 *   className="w-full h-48 object-cover"
 *   label={item.name}
 *   fallbackVariant="initials"
 * />
 * ```
 *
 * @example Override spinner background + ring colour
 * ```tsx
 * <SmartImage
 *   src={src}
 *   alt={alt}
 *   spinnerStyle={{ background: "#1e293b" }}
 *   spinnerRingStyle={{ borderTopColor: "#6366f1", width: 48, height: 48 }}
 * />
 * ```
 *
 * @example Override fallback container
 * ```tsx
 * <SmartImage
 *   src={src}
 *   alt={alt}
 *   fallbackVariant="blur"
 *   fallbackClassName="rounded-2xl"
 *   fallbackStyle={{ background: "#0f172a", borderRadius: 16 }}
 * />
 * ```
 */
export default function SmartImage({
  label = "",
  fallbackVariant = "blur",
  customFallback,
  fallbackClassName,
  fallbackStyle,
  wrapperClassName = "",
  wrapperStyle,
  showLoader = true,
  spinnerClassName,
  spinnerStyle,
  spinnerRingStyle,
  className = "",
  style,
  ...imageProps
}: SmartImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  const handleLoad = useCallback(() => setStatus("loaded"), []);
  const handleError = useCallback(() => setStatus("error"), []);

  const showFallback = status === "error";
  const showSpinner = status === "loading" && showLoader;

  return (
    <div
      className={wrapperClassName}
      style={{
        position: "relative",
        overflow: "hidden",
        ...wrapperStyle,
        ...style,
      }}
    >
      {/* ── Loading state ── */}
      {showSpinner && (
        <LoadingSpinner
          containerClassName={spinnerClassName}
          containerStyle={spinnerStyle}
          ringStyle={spinnerRingStyle}
        />
      )}

      {/* ── Error / fallback state ── */}
      {showFallback &&
        (fallbackVariant === "custom" && customFallback ? (
          <>{customFallback}</>
        ) : fallbackVariant === "initials" && label ? (
          <InitialsFallback
            label={label}
            className={fallbackClassName}
            style={fallbackStyle}
          />
        ) : fallbackVariant === "icon" ? (
          <IconFallback className={fallbackClassName} style={fallbackStyle} />
        ) : (
          <BlurFallback className={fallbackClassName} style={fallbackStyle} />
        ))}

      {/* ── Actual Next.js Image ── */}
      {!showFallback && (
        <NextImage
          {...imageProps}
          className={className}
          style={{
            opacity: status === "loaded" ? 1 : 0,
            transition: "opacity 0.35s ease",
          }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}

export type { SmartImageProps, FallbackVariant };
