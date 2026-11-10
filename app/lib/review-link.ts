/**
 * Google review destination for the floating "Review us" bubble.
 *
 * - qrImage: QR artwork placed in /public (e.g. /pluto-review-qr.svg or .png).
 *   It should encode the same destination as reviewUrl.
 * - reviewUrl: tap-through link for guests already on their phone, who cannot
 *   scan a QR on the screen they are holding.
 *
 * Leave both empty and the bubble is not rendered. Fill only one and the
 * bubble shows just that part.
 */
export type ReviewLink = {
  qrImage?: string;
  reviewUrl?: string;
};

export const PLUTO_REVIEW_LINK: ReviewLink = {
  qrImage: "/pluto-bar-review.svg",
  reviewUrl: "https://g.page/r/CcLH6vbIrA4qECE/review",
};
