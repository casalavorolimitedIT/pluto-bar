import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PLUTO_KITCHEN_SLUG = "pluto-bar";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error:
          "Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      },
      { status: 500 },
    );
  }

  const query = new URLSearchParams({
    kitchen_slug: `eq.${PLUTO_KITCHEN_SLUG}`,
    is_active: "eq.true",
    is_visible: "eq.true",
    select:
      "id,category_name,category_sort_order,parent_category_id,parent_category_name,parent_category_sort_order,name,description,price_mode,price_amount,price_options,image_url,sku,kitchen_slug,addons",
    order: "category_sort_order.asc,name.asc",
  });

  try {
    const [response, reviewsResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/v_menu_full?${query.toString()}`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      }),
      fetch(
        `${SUPABASE_URL}/rest/v1/menu_item_reviews?${new URLSearchParams({
          kitchen_slug: `eq.${PLUTO_KITCHEN_SLUG}`,
          status: "eq.approved",
          select: "item_sku,rating",
        }).toString()}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          cache: "no-store",
        },
      ),
    ]);

    if (!response.ok) {
      const text = await response.text();
      console.error("Pluto proxy upstream error", {
        status: response.status,
        body: text,
      });

      return NextResponse.json(
        { error: "Failed to fetch Pluto Bar menu" },
        { status: 502 },
      );
    }

    const items = (await response.json()) as Array<Record<string, unknown>>;
    const approvedReviews = reviewsResponse.ok
      ? ((await reviewsResponse.json()) as Array<{ item_sku: string; rating: number }>)
      : [];

    const reviewBuckets = approvedReviews.reduce<
      Record<string, { count: number; total: number }>
    >((acc, review) => {
      const key = review.item_sku;
      if (!key) return acc;

      if (!acc[key]) {
        acc[key] = { count: 0, total: 0 };
      }

      acc[key].count += 1;
      acc[key].total += Number(review.rating);
      return acc;
    }, {});

    const normalizedItems = items.map((item) => {
      const sku = String(item.sku ?? "");
      const reviewSummary = reviewBuckets[sku];

      return {
        ...item,
        sku,
        review_count: reviewSummary?.count ?? 0,
        review_avg:
          reviewSummary && reviewSummary.count > 0
            ? Number((reviewSummary.total / reviewSummary.count).toFixed(1))
            : null,
      };
    });

    return NextResponse.json({
      kitchenSlug: PLUTO_KITCHEN_SLUG,
      count: normalizedItems.length,
      items: normalizedItems,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    console.error("Pluto proxy request failed", message);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
