import { Item } from "../core/types/item";

/** Empty extraction results cannot establish that an order has zero items. */
export function resolveItemCount(order: {
  itemCount?: number;
  items?: readonly unknown[];
}): number | undefined {
  return (
    order.itemCount ?? (order.items?.length ? order.items.length : undefined)
  );
}

/** Match product identity independently of price so price differences do not duplicate rows. */
function sameProduct(left: Item, right: Item): boolean {
  return (
    left.name.trim() === right.name.trim() &&
    left.quantity === right.quantity &&
    left.condition === right.condition &&
    left.seller?.name === right.seller?.name &&
    (!left.asin || !right.asin || left.asin === right.asin)
  );
}

/** Preserve unmatched invoice rows and restore only unambiguous missing prices. */
export function selectFallbackItems(details: Item[], invoice: Item[]): Item[] {
  if (details.length <= invoice.length) return invoice;
  const available = [...invoice];
  const reconciled = details.map((detail) => {
    const candidates = available.filter((row) => sameProduct(row, detail));
    if (!candidates.length) return detail;
    const hasPrice = Boolean(detail.unitPrice?.formatted.trim());
    // Prefer an exact price match when possible, but consume an identity match
    // even if prices differ or neither page exposes a price.
    const match =
      (hasPrice &&
        candidates.find(
          (row) =>
            row.unitPrice.amount === detail.unitPrice.amount &&
            row.unitPrice.currency === detail.unitPrice.currency &&
            row.totalPrice.amount === detail.totalPrice.amount,
        )) ||
      candidates[0];
    available.splice(available.indexOf(match), 1);
    if (hasPrice || !match.unitPrice.formatted.trim()) return detail;
    // Evaluate all original duplicates, not just the remaining rows: consuming
    // an ambiguous match must not make the next duplicate appear unambiguous.
    const ambiguous = invoice
      .filter((row) => sameProduct(row, detail))
      .some(
        (row) =>
          !row.unitPrice.formatted.trim() ||
          row.unitPrice.amount !== match.unitPrice.amount ||
          row.unitPrice.currency !== match.unitPrice.currency ||
          row.totalPrice.amount !== match.totalPrice.amount,
      );
    if (ambiguous) return detail;
    return {
      ...detail,
      unitPrice: match.unitPrice,
      totalPrice: match.totalPrice,
    };
  });
  return [...reconciled, ...available];
}
