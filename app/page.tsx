"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import MenuError from "./components/menuError";
import MenuItemModal, { type ModalMenuItem } from "./components/MenuItemModal";
import RestaurantReviewPrompt from "./components/RestaurantReviewPrompt";
import ScrollTop from "./components/scrollTop";
import SmartImage from "./components/smart-images";

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

type MenuItem = {
  id: string;
  category_name: string;
  name: string;
  description: string | null;
  price_mode: string;
  price_amount: number | null;
  price_options?: PriceOption[] | null;
  image_url: string | null;
  sku: string | null;
  category_sort_order: number;
  parent_category_id: string | null;
  parent_category_name: string | null;
  parent_category_sort_order: number | null;
  kitchen_slug: string;
  addons: Addon[];
  review_count?: number;
  review_avg?: number | null;
};

type PlutoMenuResponse = {
  kitchenSlug: string;
  count: number;
  items: MenuItem[];
};

type SubCategoryGroup = {
  categoryName: string;
  categorySortOrder: number;
  items: MenuItem[];
};

type GroupedCategory = {
  categoryName: string;
  categorySortOrder: number;
  subCategories: SubCategoryGroup[];
};

const DRINK_CATEGORY =
  /cocktail|mocktail|milkshake|shake|shisha|drink|juice|wine|beer|spirit|coffee|\btea\b|smoothie|whisk|champagne|brandy|tequila|vodka|\bgin\b/i;

const NAV_LABELS: Record<string, string> = {
  "classic cocktails": "Cocktails",
  "classic mocktails": "Mocktails",
  "signature cocktails": "Signature",
  milkshakes: "Shakes",
};

/** The printed menu labels the FOOD category's own items "Starters". */
function displayCategoryName(name: string): string {
  return name === "FOOD" ? "Starters" : name;
}

function isDrinkCategory(name: string): boolean {
  return DRINK_CATEGORY.test(name);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function navLabel(name: string): string {
  return NAV_LABELS[name.toLowerCase()] ?? displayCategoryName(name);
}

/** Under a "Pizza" heading, "Margherita Pizza" reads as just "Margherita". */
function shortItemName(name: string, categoryName: string): string {
  const singular = categoryName.trim().toLowerCase().replace(/s$/, "");
  if (!singular || singular.includes(" ")) return name;
  const suffix = ` ${singular}`;
  if (name.toLowerCase().endsWith(suffix) && name.length > suffix.length) {
    return name.slice(0, -suffix.length);
  }
  return name;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString()}`;
}

function formatPrice(item: MenuItem): string {
  if (item.price_mode === "tbd") return "On request";

  if (item.price_mode === "variable") {
    const prices = (item.price_options ?? [])
      .map((option) => Number(option.price_amount))
      .filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length > 0) return `From ${formatNaira(Math.min(...prices))}`;
    if (item.price_amount !== null)
      return `From ${formatNaira(item.price_amount)}`;
    return "Variable pricing";
  }

  if (item.price_amount === null) return "—";
  return formatNaira(item.price_amount);
}

function allItems(category: GroupedCategory): MenuItem[] {
  return category.subCategories.flatMap((sub) => sub.items);
}

/** "All ₦12,000" when every item in the category is one fixed price. */
function sharedPrice(category: GroupedCategory): string | null {
  const items = allItems(category);
  if (items.length < 2) return null;
  const first = items[0];
  if (first.price_mode !== "fixed" || first.price_amount === null) return null;
  const same = items.every(
    (item) =>
      item.price_mode === "fixed" && item.price_amount === first.price_amount,
  );
  return same ? formatNaira(first.price_amount) : null;
}

function groupItems(items: MenuItem[]): GroupedCategory[] {
  const sections = new Map<
    string,
    {
      categoryName: string;
      categorySortOrder: number;
      subCategories: Map<string, SubCategoryGroup>;
    }
  >();

  for (const item of items) {
    const hasParent = item.parent_category_name !== null;
    const sectionName = hasParent
      ? item.parent_category_name!
      : item.category_name;
    const sectionSortOrder = hasParent
      ? (item.parent_category_sort_order ?? item.category_sort_order)
      : item.category_sort_order;
    const sectionKey = `${sectionSortOrder}-${sectionName}`;

    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        categoryName: sectionName,
        categorySortOrder: sectionSortOrder,
        subCategories: new Map(),
      });
    }

    const section = sections.get(sectionKey)!;
    const subKey = `${item.category_sort_order}-${item.category_name}`;
    if (!section.subCategories.has(subKey)) {
      section.subCategories.set(subKey, {
        categoryName: item.category_name,
        categorySortOrder: item.category_sort_order,
        items: [],
      });
    }
    section.subCategories.get(subKey)?.items.push(item);
  }

  return Array.from(sections.values())
    .sort((a, b) => a.categorySortOrder - b.categorySortOrder)
    .map((section) => ({
      categoryName: section.categoryName,
      categorySortOrder: section.categorySortOrder,
      subCategories: Array.from(section.subCategories.values()).sort(
        (a, b) => a.categorySortOrder - b.categorySortOrder,
      ),
    }));
}

/**
 * Long drink lists get a full-width, two-column block; short ones pair up
 * side by side so a three-item list never sits alone on a wide row.
 */
function layoutDrinkRows(categories: GroupedCategory[]): GroupedCategory[][] {
  const rows: GroupedCategory[][] = [];
  let pending: GroupedCategory | null = null;

  for (const category of categories) {
    if (allItems(category).length >= 8) {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([category]);
    } else if (pending) {
      rows.push([pending, category]);
      pending = null;
    } else {
      pending = category;
    }
  }

  if (pending) rows.push([pending]);
  return rows;
}

async function fetchPlutoMenu(): Promise<PlutoMenuResponse> {
  const response = await fetch("/api/landing/pluto", { method: "GET" });
  if (!response.ok) throw new Error("Could not load Pluto Bar menu");
  return response.json() as Promise<PlutoMenuResponse>;
}

/* ─── Pieces ──────────────────────────────────────────────── */

function Wordmark({ size }: { size: "sm" | "md" }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span
        className={`font-display leading-none tracking-[0.3em] text-[var(--ink)] ${
          size === "md" ? "text-[30px]" : "text-[19px] lg:text-[22px]"
        }`}
      >
        PLUTO
      </span>
      <span
        className={`uppercase tracking-[0.5em] text-[var(--brown)] ${
          size === "md" ? "text-[9px]" : "text-[7px] lg:text-[8px]"
        }`}
      >
        Bar
      </span>
    </span>
  );
}

function ItemRow({
  item,
  categoryName,
  index,
  onSelect,
  tone = "light",
}: {
  item: MenuItem;
  categoryName: string;
  index?: number;
  onSelect: (item: MenuItem) => void;
  tone?: "light" | "dark";
}) {
  const onRequest = item.price_mode === "tbd";
  const hasReviews = (item.review_count ?? 0) > 0;
  const isDark = tone === "dark";
  const textColor = isDark ? "text-[#f8f0df]" : "text-[#5c2c19]";
  const mutedColor = isDark ? "text-[#f8f0df]/75" : "text-[#5c2c19]/72";
  const priceColor = isDark ? "text-[#f8f0df]" : "text-[#5c2c19]";
  const leaderColor = isDark ? "border-[#f8f0df]/50" : "border-[#4c2619]/45";
  const hoverBg = isDark ? "hover:bg-white/8" : "hover:bg-[#4c2619]/5";

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(item);
      }}
      aria-label={`Open details for ${item.name}`}
      className={`group flex cursor-pointer select-none items-start gap-3 rounded-sm border-b border-transparent py-3 transition-colors ${hoverBg} focus-visible:outline-none focus-visible:bg-white/10`}
    >
      {typeof index === "number" && (
        <span
          className={`mt-[1px] shrink-0 text-[12px] tabular-nums ${mutedColor} lg:text-[13px]`}
        >
          .{String(index).padStart(2, "0")}
        </span>
      )}
      {item.image_url && (
        <SmartImage
          src={item.image_url}
          alt={item.name}
          width={52}
          height={52}
          className="aspect-square w-[44px] rounded-sm object-cover object-center transition-transform group-hover:scale-[1.04] lg:w-[52px]"
          wrapperClassName="block shrink-0 self-start w-[44px] h-[44px] rounded-sm lg:w-[52px] lg:h-[52px]"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline font-[500]">
          <span
            className={`text-[15px]  lg:text-[16px] ${textColor}`}
          >
            {shortItemName(item.name, categoryName)}
          </span>
          <span className={`leader ${leaderColor}`} aria-hidden="true" />
          <span
            className={
              onRequest
                ? `shrink-0 text-[14px] ${mutedColor}`
                : `shrink-0 text-[15px] tabular-nums ${priceColor} lg:text-[16px]`
            }
          >
            {formatPrice(item)}
          </span>
        </div>
        {item.description && (
          <p
            className={`mt-1.5 max-w-[480px] text-[13px] font-light leading-[1.6] ${mutedColor} lg:text-[13.5px]`}
          >
            {item.description}
          </p>
        )}
        {hasReviews && (
          <p
            className={`mt-1.5 text-[12px] ${isDark ? "text-[#f8f0df]/85" : "text-[#8a6e4c]"}`}
          >
            ★ {item.review_avg?.toFixed(1)} ({item.review_count} review
            {item.review_count === 1 ? "" : "s"})
          </p>
        )}

        <div className="mt-2 flex items-center justify-end">
          <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] ${isDark ? "text-[#f8f0df]/80" : "text-[#8a6e4c]"} sm:hidden`}
          >
            Tap for details
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path
                d="M9 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span
            className={`hidden items-center gap-1 text-[10px] uppercase tracking-[0.25em] ${isDark ? "text-[#f8f0df]/80" : "text-[#8a6e4c]"} opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline-flex`}
          >
            View details
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <path
                d="M9 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </li>
  );
}

function SubCategoryList({
  category,
  onSelect,
  tone = "light",
}: {
  category: GroupedCategory;
  onSelect: (item: MenuItem) => void;
  tone?: "light" | "dark";
}) {
  return (
    <>
      {category.subCategories.map((sub) => {
        const showHeading =
          displayCategoryName(sub.categoryName) !==
          displayCategoryName(category.categoryName);
        const hasDescriptions = sub.items.some((item) => item.description);
        const headingColor =
          tone === "dark" ? "text-[#f8f0df]" : "text-[#4c2619]";
        const mutedColor =
          tone === "dark" ? "text-[#f8f0df]/75" : "text-[#4c2619]/72";
        return (
          <div
            key={`${sub.categorySortOrder}-${sub.categoryName}`}
            className="mb-10 last:mb-0"
          >
            {showHeading && (
              <h4
                className={`font-display mb-4 text-[19px] uppercase tracking-[0.2em] ${headingColor}`}
              >
                {displayCategoryName(sub.categoryName)}
              </h4>
            )}
            <ul
              className={`flex flex-col ${hasDescriptions ? "gap-1" : "gap-[6px]"}`}
              style={{ color: mutedColor }}
            >
              {sub.items.map((item, itemIndex) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categoryName={sub.categoryName}
                  index={itemIndex + 1}
                  onSelect={onSelect}
                  tone={tone}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function DrinkHeading({
  category,
  tone = "light",
}: {
  category: GroupedCategory;
  tone?: "light" | "dark";
}) {
  const price = sharedPrice(category);
  const titleColor = tone === "dark" ? "text-[#f8f0df]" : "text-[#4c2619]";
  const subColor = tone === "dark" ? "text-[#f8f0df]/75" : "text-[#4c2619]/75";
  const dividerColor = tone === "dark" ? "bg-[#f8f0df]/45" : "bg-[#4c2619]/45";

  return (
    <div className="flex flex-col items-center gap-2.5">
      <h3
        className={`font-display text-center text-[22px] uppercase tracking-[0.32em] ${titleColor} lg:text-[25px]`}
      >
        {category.categoryName}
      </h3>
      {price ? (
        <span
          className={`text-[10px] uppercase tracking-[0.26em] ${subColor} lg:text-[11px]`}
        >
          All {price}
        </span>
      ) : (
        <span className={`block h-px w-8 ${dividerColor}`} />
      )}
    </div>
  );
}

/* ─── Sections ─────────────────────────────────────────────── */

function Cover() {
  return (
    <section
      id="top"
      className="relative flex h-[46vh] min-h-[300px] max-h-[520px] flex-col items-center justify-center overflow-hidden bg-[#4c2619] px-4 text-center lg:h-[68vh] lg:px-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-black/15" />
      <div className="pointer-events-none absolute inset-4 border border-[#f8f0df]/45 sm:inset-10" />

      <div className="relative z-10 flex w-full max-w-[90vw] flex-col items-center">
        <div className="mb-3 flex items-center gap-[14px] sm:mb-4 sm:gap-[18px]">
          <span className="block h-px w-7 bg-[#f5e9d4]/70 sm:w-[46px]" />
          <span className="pl-[0.32em] text-[8px] uppercase tracking-[0.28em] text-[#f5e9d4]/90 sm:pl-[0.42em] sm:text-[11px] sm:tracking-[0.42em]">
            Est. Casalavoro
          </span>
          <span className="block h-px w-7 bg-[#f5e9d4]/70 sm:w-[46px]" />
        </div>

        <h1 className="font-display pl-[0.12em] text-[clamp(52px,18vw,146px)] font-light leading-none tracking-[0.08em] text-[#f7ebd4] sm:tracking-[0.18em]">
          PLUTO
        </h1>

        <div className="mt-3 flex items-center gap-[18px] sm:mt-5 sm:gap-[22px]">
          <span className="block h-px w-8 bg-[#f2d7b6]/90 sm:w-14" />
          <span className="font-display pl-[0.42em] text-[15px] uppercase tracking-[0.38em] text-[#f2d7b6] sm:pl-[0.62em] sm:text-[21px] sm:tracking-[0.62em]">
            Bar
          </span>
          <span className="block h-px w-8 bg-[#f2d7b6]/90 sm:w-14" />
        </div>

        <p className="mt-6 pl-[0.2em] text-[9px] uppercase tracking-[0.22em] text-[#f5e9d4]/90 sm:mt-8 sm:pl-[0.3em] sm:text-[13px] sm:tracking-[0.3em]">
          Food · Cocktails · Shisha
        </p>

        <a
          href="#menu"
          className="mt-7 inline-flex items-center gap-3 border border-[#f7ebd4]/80 bg-white/10 px-6 py-[12px] text-[9px] uppercase tracking-[0.22em] text-[#f7ebd4] transition-colors hover:bg-white/20 sm:mt-10 sm:gap-3.5 sm:px-9 sm:py-[17px] sm:text-[12px] sm:tracking-[0.28em]"
        >
          View the menu
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>

      <p className="absolute inset-x-0 bottom-4 z-10 text-center text-[8px] uppercase tracking-[0.22em] text-[#f7ebd4]/85 sm:bottom-10 sm:text-[11px] sm:tracking-[0.34em] pt-1 pb-2">
        36 Bangui Street, Wuse II, Abuja
      </p>
    </section>
  );
}

function Welcome() {
  return (
    <section className="relative overflow-hidden bg-[#faf0e3]">
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 px-6 py-16 sm:px-12 lg:min-h-[560px] lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:px-28 lg:py-20">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-4">
            <span className="block h-px w-[38px] bg-[#4c2619]" />
            <span className="pl-[0.4em] text-[11px] uppercase tracking-[0.4em] text-[#4c2619]">
              Welcome
            </span>
          </div>

          <h2 className="font-display mt-6 text-[clamp(38px,5vw,54px)] font-light italic leading-[1.15] text-[#3a2d22]">
            We&rsquo;re delighted
            <br />
            to have you
          </h2>

          <p className="mt-8 max-w-[500px] text-[15px] leading-[1.85] text-[#5c4336] lg:text-[16px]">
            Pluto Bar offers a refined escape within Casalavoro, where relaxed
            drinks, carefully prepared bites, and an easy atmosphere come
            together. Whether you are unwinding by the pool, enjoying an evening
            with friends, or taking a quiet moment for yourself, Pluto Bar is
            made for laid-back luxury and effortless comfort.
          </p>

          <div className="mt-9 border-l border-[#4c2619]/45 pl-5">
            <p className="max-w-[430px] text-[14px] leading-[1.75] text-[#5c4336]/90">
              If you have any dietary requirements, food allergies or
              intolerance, please inform our associates when placing your order.
            </p>
          </div>

          <p className="mt-9 pl-[0.22em] text-[11px] uppercase tracking-[0.22em] text-[#7c5a46]">
            All prices subject to 7.5% VAT &amp; 5% entertainment tax
          </p>
        </div>

        <div className="relative flex items-center justify-center">
          <Image
            src="/pluto-image.jpg"
            alt="Illustration of the Pluto Bar counter and terrace seating"
            width={560}
            height={658}
            className="h-auto w-full max-w-[560px] rounded-[18px] object-cover shadow-[0_18px_50px_rgba(60,34,20,0.12)]"
          />
        </div>
      </div>
    </section>
  );
}

function MenuSection() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pluto-menu"],
    queryFn: fetchPlutoMenu,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [activeId, setActiveId] = useState("food");
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);

  const allCategories = useMemo(
    () => (data ? groupItems(data.items) : []),
    [data],
  );

  const navItems = useMemo(() => {
    const drinks = allCategories
      .filter((category) => isDrinkCategory(category.categoryName))
      .map((category) => ({
        id: slugify(category.categoryName),
        label: navLabel(category.categoryName),
      }));
    const hasFood = allCategories.some(
      (category) => !isDrinkCategory(category.categoryName),
    );
    return [...(hasFood ? [{ id: "food", label: "Food" }] : []), ...drinks];
  }, [allCategories]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!data || !query) return allCategories;
    return groupItems(
      data.items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.category_name.toLowerCase().includes(query) ||
          (item.description ?? "").toLowerCase().includes(query),
      ),
    );
  }, [data, allCategories, searchTerm]);

  const foodCategories = filtered.filter(
    (category) => !isDrinkCategory(category.categoryName),
  );
  const drinkRows = layoutDrinkRows(
    filtered.filter((category) => isDrinkCategory(category.categoryName)),
  );

  useEffect(() => {
    const targets = navItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [navItems, filtered]);

  useEffect(() => {
    document
      .getElementById(`chip-${activeId}`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  const searchField = (id: string, className: string) => (
    <div className={className}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <label htmlFor={id} className="sr-only">
        Search the menu
      </label>
      <input
        id={id}
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search the menu"
        className="w-full min-w-0 bg-transparent text-[14px] font-light outline-none placeholder:text-current/75 lg:text-[13px]"
      />
    </div>
  );

  return (
    <div id="menu" className="bg-[#faf0e3]">
      <header className="sticky top-0 z-30 border-b border-[#4c2619]/25 bg-[#f4e9d4]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[66px] max-w-[1440px] items-center justify-between px-5 lg:h-[78px] lg:px-16">
          <a href="#top" aria-label="Pluto Bar, back to top">
            <Wordmark size="sm" />
          </a>

          <nav
            aria-label="Menu sections"
            className="hidden items-center gap-[34px] lg:flex"
          >
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={activeId === item.id ? "true" : undefined}
                className={`border-b py-[15px] text-[11px] uppercase leading-4 tracking-[0.24em] transition-colors hover:text-[#4c2619] ${
                  activeId === item.id
                    ? "border-[#4c2619] text-[#2e261b]"
                    : "border-transparent text-[#5c4336]/75"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {searchField(
            "menu-search",
            "hidden w-[200px] items-center gap-2.5 border-b border-[#4c2619]/35 px-0.5 py-3 text-[#5c4336] lg:flex",
          )}
        </div>

        <nav
          aria-label="Menu sections"
          className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden"
        >
          {navItems.map((item) => (
            <a
              key={item.id}
              id={`chip-${item.id}`}
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "true" : undefined}
              className={`inline-flex h-11 shrink-0 items-center px-4 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                activeId === item.id
                  ? "bg-[#4c2619] text-[#f8f0df]"
                  : "border border-[#4c2619]/60 text-[#5c4336]"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative overflow-hidden">
        <div className="mx-auto max-w-[1440px] px-5 pt-5 lg:hidden">
          {searchField(
            "menu-search-mobile",
            "flex h-[46px] items-center gap-2.5 border border-[#4c2619]/60 bg-[#f5e9d4] px-3.5 text-[#5c4336]",
          )}
        </div>

        {isLoading && (
          <p className="py-32 text-center text-[12px] uppercase tracking-[0.24em] text-[#5c4336]/80">
            Loading the menu
          </p>
        )}

        {isError && (
          <div className="mx-auto max-w-2xl px-6 py-16">
            <MenuError
              message={
                error instanceof Error
                  ? error.message
                  : "Could not load the Pluto Bar menu."
              }
            />
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="py-28 text-center">
            <p className="font-display text-[24px] italic text-[#3a2d22]">
              Nothing matches &ldquo;{searchTerm.trim()}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-5 h-11 px-4 text-[11px] uppercase tracking-[0.24em] text-[#4c2619] hover:text-[#2e261b]"
            >
              Clear search
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8 lg:px-12 xl:px-20">
            {foodCategories.map((category, categoryIndex) => {
              const isAlt = categoryIndex % 2 === 1;
              const sectionBg = isAlt ? "#4c2619" : "#faf0e3";
              const fg = isAlt ? "#f8f0df" : "#5c2c19";
              const muted = isAlt
                ? "rgba(248,240,223,0.8)"
                : "rgba(92,44,25,0.7)";
              const divider = isAlt
                ? "rgba(248,240,223,0.28)"
                : "rgba(92,44,25,0.12)";

              return (
                <section
                  key={`${category.categorySortOrder}-${category.categoryName}`}
                  id={slugify(category.categoryName)}
                  className="scroll-mt-28 py-8 sm:py-10 lg:py-12"
                  style={{ backgroundColor: sectionBg, marginInline: "-1rem" }}
                >
                  <div className="mx-auto max-w-[1180px] px-4 sm:px-8">
                    <div className="mb-6 flex items-center gap-4">
                      <h2
                        className="font-display text-[20px] uppercase tracking-[0.2em] sm:text-[22px]"
                        style={{ color: fg }}
                      >
                        {displayCategoryName(category.categoryName)}
                      </h2>
                      <span
                        className="h-px flex-1"
                        style={{ backgroundColor: divider }}
                      />
                    </div>

                    <div>
                      {category.subCategories.map((subCategory) => {
                        const showSubHeading =
                          category.subCategories.length > 1 ||
                          subCategory.categoryName !== category.categoryName;

                        return (
                          <div
                            key={`${subCategory.categorySortOrder}-${subCategory.categoryName}`}
                            className="mb-10 last:mb-0"
                          >
                            {showSubHeading && (
                              <h3
                                className="mb-4 text-[10px] uppercase tracking-[0.3em]"
                                style={{ color: muted }}
                              >
                                {displayCategoryName(subCategory.categoryName)}
                              </h3>
                            )}
                            <ul className="flex flex-col gap-1">
                              {subCategory.items.map((item, itemIndex) => (
                                <ItemRow
                                  key={item.id}
                                  item={item}
                                  categoryName={subCategory.categoryName}
                                  index={itemIndex + 1}
                                  onSelect={setActiveItem}
                                  tone={isAlt ? "dark" : "light"}
                                />
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}

            {drinkRows.length > 0 && (
              <div className="mt-10 pb-20">
                {drinkRows.map((row) => {
                  if (row.length === 1 && allItems(row[0]).length >= 8) {
                    const category = row[0];
                    const items = allItems(category);
                    const mid = Math.ceil(items.length / 2);
                    const columns = [items.slice(0, mid), items.slice(mid)];
                    const tone = "dark";
                    return (
                      <section
                        key={category.categoryName}
                        id={slugify(category.categoryName)}
                        className="scroll-mt-32 pt-10"
                      >
                        <div className="rounded-none bg-[#4c2619] px-4 py-8 sm:px-8">
                          <DrinkHeading category={category} tone={tone} />
                          <div className="relative mt-8 grid gap-x-8 gap-y-4 lg:grid-cols-2">
                            <span className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px bg-[#f8f0df]/35 lg:block" />
                            {columns.map((column, columnIndex) => (
                              <ul
                                key={columnIndex}
                                className="flex flex-col gap-1"
                              >
                                {column.map((item, itemIndex) => (
                                  <ItemRow
                                    key={item.id}
                                    item={item}
                                    categoryName={category.categoryName}
                                    index={columnIndex * mid + itemIndex + 1}
                                    onSelect={setActiveItem}
                                    tone={tone}
                                  />
                                ))}
                              </ul>
                            ))}
                          </div>
                        </div>
                      </section>
                    );
                  }

                  return (
                    <div
                      key={row
                        .map((category) => category.categoryName)
                        .join("|")}
                      className={`mt-10 grid gap-x-8 gap-y-10 ${row.length === 1 ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}
                    >
                      {row.map((category) => (
                        <section
                          key={category.categoryName}
                          id={slugify(category.categoryName)}
                          className="scroll-mt-32 rounded-none bg-[#4c2619] p-4 sm:p-8"
                        >
                          <DrinkHeading category={category} tone="dark" />
                          <div className="mt-6">
                            <SubCategoryList
                              category={category}
                              onSelect={setActiveItem}
                              tone="dark"
                            />
                          </div>
                        </section>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[#4c2619]/25 bg-[#faf0e3]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-14 sm:px-12 lg:h-[220px] lg:flex-row lg:items-center lg:justify-between lg:px-28 lg:py-0">
          <a href="#top" aria-label="Pluto Bar, back to top">
            <Wordmark size="md" />
          </a>
          <div className="flex flex-col gap-2.5 lg:items-end lg:text-right">
            <span className="text-[11px] uppercase tracking-[0.22em] text-[#5c4336] lg:text-[12px]">
              36 Bangui Street, Wuse II, Abuja
            </span>
            <span className="text-[11px] font-light text-[#5c4336]/75">
              All prices subject to 7.5% VAT and 5% entertainment tax
            </span>
          </div>
        </div>
      </footer>

      <MenuItemModal
        item={
          activeItem && activeItem.sku
            ? ({
                name: activeItem.name,
                description: activeItem.description,
                price_mode: activeItem.price_mode,
                price_amount: activeItem.price_amount,
                image_url: activeItem.image_url,
                sku: activeItem.sku,
                category_name: activeItem.category_name,
                kitchen_slug: activeItem.kitchen_slug,
                addons: activeItem.addons,
                price_options: activeItem.price_options ?? undefined,
              } satisfies ModalMenuItem)
            : null
        }
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}

function PlutoPage() {
  return (
    <div className="min-h-screen bg-white">
      <Cover />
      <Welcome />
      <MenuSection />
      <RestaurantReviewPrompt kitchenSlug="pluto-bar" />
      <ScrollTop />
    </div>
  );
}

const queryClient = new QueryClient();

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlutoPage />
    </QueryClientProvider>
  );
}
