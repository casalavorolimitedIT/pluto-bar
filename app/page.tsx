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
    if (item.price_amount !== null) return `From ${formatNaira(item.price_amount)}`;
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
    const sectionName = hasParent ? item.parent_category_name! : item.category_name;
    const sectionSortOrder = hasParent
      ? item.parent_category_sort_order ?? item.category_sort_order
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
}: {
  item: MenuItem;
  categoryName: string;
  index?: number;
  onSelect: (item: MenuItem) => void;
}) {
  const onRequest = item.price_mode === "tbd";
  const hasReviews = (item.review_count ?? 0) > 0;
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(item);
      }}
      aria-label={`Open details for ${item.name}`}
      className="group flex cursor-pointer select-none items-start gap-3 rounded-sm transition-colors hover:bg-[var(--tan-soft)]/10 focus-visible:outline-none focus-visible:bg-[var(--tan-soft)]/15"
    >
      {typeof index === "number" && (
        <span className="mt-[1px] shrink-0 text-[12px] tabular-nums text-[var(--tan)] lg:text-[13px]">
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
        <div className="flex items-baseline">
          <span className="text-[15px] font-light lg:text-[16px]">
            {shortItemName(item.name, categoryName)}
          </span>
          <span className="leader" aria-hidden="true" />
          <span
            className={
              onRequest
                ? "shrink-0 text-[14px] font-light text-[var(--ink-soft)]"
                : "shrink-0 text-[15px] tabular-nums lg:text-[16px]"
            }
          >
            {formatPrice(item)}
          </span>
        </div>
        {item.description && (
          <p className="mt-1.5 max-w-[480px] text-[13px] font-light leading-[1.6] text-[var(--ink-soft)] lg:text-[13.5px]">
            {item.description}
          </p>
        )}
        {hasReviews && (
          <p className="mt-1.5 text-[12px] text-[var(--brown)]">
            ★ {item.review_avg?.toFixed(1)} ({item.review_count} review
            {item.review_count === 1 ? "" : "s"})
          </p>
        )}

        <div className="mt-2 flex items-center justify-end">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-[var(--brown)] sm:hidden">
            Tap for details
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="hidden items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-[var(--brown)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline-flex">
            View details
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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
}: {
  category: GroupedCategory;
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <>
      {category.subCategories.map((sub) => {
        const showHeading =
          displayCategoryName(sub.categoryName) !==
          displayCategoryName(category.categoryName);
        const hasDescriptions = sub.items.some((item) => item.description);
        return (
          <div
            key={`${sub.categorySortOrder}-${sub.categoryName}`}
            className="mb-10 last:mb-0"
          >
            {showHeading && (
              <h4 className="font-display mb-4 text-[19px] uppercase tracking-[0.2em] text-[var(--ink)]/85">
                {displayCategoryName(sub.categoryName)}
              </h4>
            )}
            <ul
              className={`flex flex-col ${hasDescriptions ? "gap-6" : "gap-[15px]"}`}
            >
              {sub.items.map((item, itemIndex) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categoryName={sub.categoryName}
                  index={itemIndex + 1}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function DrinkHeading({ category }: { category: GroupedCategory }) {
  const price = sharedPrice(category);
  return (
    <div className="flex flex-col items-center gap-2.5">
      <h3 className="font-display text-center text-[22px] uppercase tracking-[0.32em] text-[var(--brown)] lg:text-[25px]">
        {category.categoryName}
      </h3>
      {price ? (
        <span className="text-[10px] uppercase tracking-[0.26em] text-[var(--ink-soft)] lg:text-[11px]">
          All {price}
        </span>
      ) : (
        <span className="block h-px w-8 bg-[var(--tan)]" />
      )}
    </div>
  );
}

/* ─── Sections ─────────────────────────────────────────────── */

function Cover() {
  return (
    <section
      id="top"
      className="relative flex h-[100svh] min-h-[620px] max-h-[1000px] flex-col items-center justify-center overflow-hidden bg-[var(--cover)] px-6 text-center"
    >
      <Image
        src="/menu-cover.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_20%]"
      />
      <div className="pointer-events-none absolute inset-5 border border-white/55 sm:inset-11" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-[18px]">
          <span className="block h-px w-8 bg-[var(--ink)]/50 sm:w-[46px]" />
          <span className="pl-[0.42em] text-[10px] uppercase tracking-[0.42em] text-[#4a3f2e] sm:text-[11px]">
            Est. Casalavoro
          </span>
          <span className="block h-px w-8 bg-[var(--ink)]/50 sm:w-[46px]" />
        </div>

        <h1 className="font-display mt-7 pl-[0.18em] text-[clamp(64px,11vw,146px)] font-light leading-none tracking-[0.18em] text-[var(--ink)]">
          PLUTO
        </h1>

        <div className="mt-5 flex items-center gap-[22px]">
          <span className="block h-px w-10 bg-[var(--brown-deep)] sm:w-14" />
          <span className="font-display pl-[0.62em] text-[17px] uppercase tracking-[0.62em] text-[var(--brown-deep)] sm:text-[21px]">
            Bar
          </span>
          <span className="block h-px w-10 bg-[var(--brown-deep)] sm:w-14" />
        </div>

        <p className="mt-10 pl-[0.3em] text-[11px] uppercase tracking-[0.3em] text-[#4a3f2e] sm:mt-12 sm:text-[13px]">
          Food · Cocktails · Shisha
        </p>

        <a
          href="#menu"
          className="mt-12 inline-flex items-center gap-3.5 border border-[var(--ink)]/60 bg-white/15 px-9 py-[17px] text-[12px] uppercase tracking-[0.28em] text-[var(--ink)] transition-colors hover:bg-white/35 sm:mt-14"
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

      <p className="absolute inset-x-0 bottom-12 z-10 text-center text-[10px] uppercase tracking-[0.34em] text-[var(--ink)]/75 sm:bottom-[78px] sm:text-[11px]">
        39 Bangui Street, Wuse II, Abuja
      </p>
    </section>
  );
}

function Welcome() {
  return (
    <section className="relative overflow-hidden bg-white">
      <Image
        src="/menu-28-top.png"
        alt=""
        width={640}
        height={566}
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-24 w-[340px] opacity-50 lg:-right-[170px] lg:-top-[150px] lg:w-[640px]"
      />
      <Image
        src="/menu-29-bottom.png"
        alt=""
        width={430}
        height={328}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-24 w-[260px] opacity-45 lg:-bottom-[90px] lg:-left-[120px] lg:w-[430px]"
      />

      <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 px-6 py-24 sm:px-12 lg:min-h-[900px] lg:grid-cols-2 lg:gap-20 lg:px-28 lg:py-0">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-4">
            <span className="block h-px w-[38px] bg-[var(--tan)]" />
            <span className="pl-[0.4em] text-[11px] uppercase tracking-[0.4em] text-[var(--brown)]">
              Welcome
            </span>
          </div>

          <h2 className="font-display mt-6 text-[clamp(38px,5vw,54px)] font-light italic leading-[1.15] text-[var(--ink)]">
            We&rsquo;re delighted
            <br />
            to have you
          </h2>

          <p className="mt-8 max-w-[470px] text-[15px] leading-[1.85] text-[var(--ink-mid)] lg:text-[16px]">
            Pluto Bar offers a refined escape within Casalavoro, where relaxed
            drinks, carefully prepared bites, and an easy atmosphere come
            together. Whether you are unwinding by the pool, enjoying an
            evening with friends, or taking a quiet moment for yourself, Pluto
            Bar is made for laid-back luxury and effortless comfort.
          </p>

          <div className="mt-9 border-l border-[var(--tan-soft)] pl-5">
            <p className="max-w-[430px] text-[14px] leading-[1.75] text-[var(--ink-soft)]">
              If you have any dietary requirements, food allergies or
              intolerance, please inform our associates when placing your
              order.
            </p>
          </div>

          <p className="mt-9 pl-[0.22em] text-[11px] uppercase tracking-[0.22em] text-[var(--brown)]">
            All prices subject to 7.5% VAT &amp; 5% entertainment tax
          </p>
        </div>

        <div className="relative flex items-center justify-center">
          <Image
            src="/pluto-image.jpg"
            alt="Illustration of the Pluto Bar counter and terrace seating"
            width={560}
            height={658}
            className="h-auto w-full max-w-[560px] mix-blend-multiply"
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
        stroke="var(--brown)"
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
        className="w-full min-w-0 bg-transparent text-[14px] font-light text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)] lg:text-[13px]"
      />
    </div>
  );

  return (
    <div id="menu">
      <header className="sticky top-0 z-30 border-b border-[var(--tan)]/50 bg-white/95 backdrop-blur-sm">
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
                className={`border-b py-[15px] text-[11px] uppercase leading-4 tracking-[0.24em] transition-colors hover:text-[var(--brown)] ${
                  activeId === item.id
                    ? "border-[var(--brown)] text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-soft)]"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {searchField(
            "menu-search",
            "hidden w-[200px] items-center gap-2.5 border-b border-[var(--tan-soft)] px-0.5 py-3 lg:flex",
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
                  ? "bg-[var(--ink)] text-white"
                  : "border border-[var(--tan)]/80 text-[var(--ink-mid)]"
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
            "flex h-[46px] items-center gap-2.5 border border-[var(--tan)]/70 px-3.5",
          )}
        </div>

        {isLoading && (
          <p className="py-32 text-center text-[12px] uppercase tracking-[0.24em] text-[var(--ink-soft)]">
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
            <p className="font-display text-[24px] italic text-[var(--ink)]">
              Nothing matches &ldquo;{searchTerm.trim()}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-5 h-11 px-4 text-[11px] uppercase tracking-[0.24em] text-[var(--brown)] hover:text-[var(--ink)]"
            >
              Clear search
            </button>
          </div>
        )}

        {!isLoading && !isError && foodCategories.length > 0 && (
          <section
            id="food"
            className="relative scroll-mt-32 lg:scroll-mt-20"
          >
            <Image
              src="/menu-28-top.png"
              alt=""
              width={420}
              height={371}
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-10 hidden w-[300px] opacity-45 sm:block lg:-right-[110px] lg:-top-[70px] lg:w-[420px]"
            />

            <div className="relative z-10 mx-auto max-w-[1440px] px-5 pt-14 sm:px-12 lg:px-28 lg:pt-[78px]">
              <div className="flex flex-col items-center gap-3.5">
                <span className="font-display pl-[0.62em] text-[13px] uppercase tracking-[0.62em] text-[var(--brown)] lg:text-[14px]">
                  Food
                </span>
                <span className="block h-px w-11 bg-[var(--tan)]" />
                <p className="font-display mt-1 text-[15px] italic text-[var(--ink-soft)]">
                  &ldquo;now this sounds like a plan&rdquo;
                </p>
              </div>

              <div className="mt-12 gap-x-[104px] lg:mt-[62px] lg:columns-2">
                {foodCategories.map((category) => (
                  <div
                    key={`${category.categorySortOrder}-${category.categoryName}`}
                    className="mb-12 break-inside-avoid lg:mb-14"
                  >
                    <h3 className="font-display mb-5 border-b border-[var(--tan)]/50 pb-3 text-[20px] uppercase tracking-[0.2em] text-[var(--ink)] lg:mb-[22px] lg:text-[24px]">
                      {displayCategoryName(category.categoryName)}
                    </h3>
                    <SubCategoryList category={category} onSelect={setActiveItem} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isLoading &&
          !isError &&
          foodCategories.length > 0 &&
          drinkRows.length > 0 && (
            <div className="mx-auto mt-10 flex max-w-[1440px] items-center gap-[22px] px-5 sm:px-12 lg:mt-[32px] lg:px-28">
              <span className="h-px flex-1 bg-[var(--tan)]/55" />
              <span className="font-display pl-[0.6em] text-[13px] uppercase tracking-[0.6em] text-[var(--brown)]">
                Bar
              </span>
              <span className="h-px flex-1 bg-[var(--tan)]/55" />
            </div>
          )}

        {!isLoading && !isError && drinkRows.length > 0 && (
          <div className="relative">
            <Image
              src="/menu-31.png"
              alt=""
              width={560}
              height={321}
              aria-hidden="true"
              className="pointer-events-none absolute -left-40 top-[42%] hidden w-[560px] opacity-40 lg:block"
            />

            <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 sm:px-12 lg:px-28 lg:pb-32">
              {drinkRows.map((row) => {
                if (row.length === 1 && allItems(row[0]).length >= 8) {
                  const category = row[0];
                  const items = allItems(category);
                  const mid = Math.ceil(items.length / 2);
                  const columns = [items.slice(0, mid), items.slice(mid)];
                  return (
                    <section
                      key={category.categoryName}
                      id={slugify(category.categoryName)}
                      className="scroll-mt-32 pt-16 lg:scroll-mt-20 lg:pt-[72px]"
                    >
                      <DrinkHeading category={category} />
                      <div className="relative mt-10 grid gap-x-[104px] gap-y-10 lg:mt-[46px] lg:grid-cols-2">
                        <span className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px bg-[var(--tan)]/45 lg:block" />
                        {columns.map((column, columnIndex) => (
                          <ul
                            key={columnIndex}
                            className="flex flex-col gap-y-6 lg:gap-y-[26px]"
                          >
                            {column.map((item, itemIndex) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                categoryName={category.categoryName}
                                index={columnIndex * mid + itemIndex + 1}
                                onSelect={setActiveItem}
                              />
                            ))}
                          </ul>
                        ))}
                      </div>
                    </section>
                  );
                }

                return (
                  <div
                    key={row.map((category) => category.categoryName).join("|")}
                    className={`mt-14 grid gap-x-[104px] gap-y-10 first:mt-0 lg:mt-16 lg:grid-cols-2 lg:first:mt-0 ${
                      row.length === 1 ? "lg:mx-auto lg:w-[calc(50%-52px)] lg:grid-cols-1" : ""
                    }`}
                  >
                    {row.map((category) => (
                      <section
                        key={category.categoryName}
                        id={slugify(category.categoryName)}
                        className="scroll-mt-32 lg:scroll-mt-20"
                      >
                        <DrinkHeading category={category} />
                        <div className="mt-9 lg:mt-[38px]">
                          <SubCategoryList category={category} onSelect={setActiveItem} />
                        </div>
                      </section>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--tan)]/50">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-14 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-28 lg:py-0 lg:h-[250px]">
          <a href="#top" aria-label="Pluto Bar, back to top">
            <Wordmark size="md" />
          </a>
          <div className="flex flex-col gap-2.5 lg:items-end lg:text-right">
            <span className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-mid)] lg:text-[12px]">
              39 Bangui Street, Wuse II, Abuja
            </span>
            <span className="text-[11px] font-light text-[var(--ink-soft)]">
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
