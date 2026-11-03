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

/** Keep the fuller source; only restore prices with unambiguous row correspondence. */
export function selectFallbackItems(details: Item[], invoice: Item[]): Item[] {
  if (details.length <= invoice.length) return invoice;
  const available = [...invoice];
  return details.map((detail) => {
    // The original price text distinguishes an absent price from a real zero.
    const candidates = available.filter(
      (row) =>
        row.name.trim() === detail.name.trim() &&
        row.quantity === detail.quantity &&
        row.condition === detail.condition &&
        row.seller?.name === detail.seller?.name &&
        (!row.asin || !detail.asin || row.asin === detail.asin) &&
        Boolean(row.unitPrice.formatted.trim()),
    );
    if (detail.unitPrice?.formatted.trim()) {
      const pricedMatch = candidates.find(
        (row) =>
          row.unitPrice.amount === detail.unitPrice.amount &&
          row.unitPrice.currency === detail.unitPrice.currency &&
          row.totalPrice.amount === detail.totalPrice.amount,
      );
      if (pricedMatch) available.splice(available.indexOf(pricedMatch), 1);
      return detail;
    }
    if (!candidates.length) return detail;
    const match = candidates[0];
    // Duplicate lines with different prices cannot safely be paired by position.
    if (
      candidates.some(
        (row) =>
          row.unitPrice.amount !== match.unitPrice.amount ||
          row.unitPrice.currency !== match.unitPrice.currency ||
          row.totalPrice.amount !== match.totalPrice.amount,
      )
    )
      return detail;
    available.splice(available.indexOf(match), 1);
    return {
      ...detail,
      unitPrice: match.unitPrice,
      totalPrice: match.totalPrice,
    };
  });
}
