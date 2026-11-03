import { Item } from "../../../src/core/types/item";
import { parseMoney } from "../../../src/core/types/money";
import {
  resolveItemCount,
  selectFallbackItems,
} from "../../../src/tools/item-reconciliation";
import { ORDER_CSV_COLUMNS } from "../../../src/tools/csv-columns";

function row(name: string, price: string, asin?: string): Item {
  const money = parseMoney(price);
  return {
    id: name,
    name,
    asin,
    quantity: 1,
    unitPrice: money,
    totalPrice: money,
    url: "",
    orderHeader: {} as Item["orderHeader"],
    platformData: {},
  };
}

describe("item reconciliation", () => {
  it("keeps failed empty extraction counts unknown in JSON and CSV", () => {
    const order = {
      items: [],
      id: "test-order",
      orderId: "test-order",
      date: null,
      total: parseMoney("$12.00"),
      region: "us",
      detailUrl: "https://example.com/order",
    };
    expect(resolveItemCount(order)).toBeUndefined();
    expect(JSON.stringify({ itemCount: resolveItemCount(order) })).toBe("{}");
    const column = ORDER_CSV_COLUMNS.find((c) => c.key === "itemCount");
    expect(
      column?.getValue(
        order as Parameters<NonNullable<typeof column>["getValue"]>[0],
      ),
    ).toBe("");
    expect(resolveItemCount({ itemCount: 0, items: [] })).toBe(0);
    expect(resolveItemCount({ items: [1, 2] })).toBe(2);
  });
  it("prefers invoice prices when both sources have the same row count", () => {
    const invoice = [row("A", "$12.00")];
    expect(selectFallbackItems([row("A", "")], invoice)).toBe(invoice);
  });
  it("restores missing prices without requiring an ASIN", () => {
    const selected = selectFallbackItems(
      [row("A", ""), row("B", "$2.00")],
      [row("A", "$12.00")],
    );
    expect(selected[0].unitPrice.amount).toBe(12);
    expect(selected[0].totalPrice.amount).toBe(12);
  });
  it("preserves a legitimate zero price", () => {
    const selected = selectFallbackItems(
      [row("A", "$0.00"), row("B", "$2.00")],
      [row("A", "$12.00")],
    );
    expect(selected[0].unitPrice.amount).toBe(0);
  });
  it("does not match different products sharing an ASIN", () => {
    const selected = selectFallbackItems(
      [row("Other", "", "SAME"), row("B", "$2.00")],
      [row("A", "$12.00", "SAME")],
    );
    expect(selected[0].unitPrice.formatted).toBe("");
  });
  it("does not guess between duplicate products with different prices", () => {
    const selected = selectFallbackItems(
      [row("A", ""), row("A", ""), row("B", "$2.00")],
      [row("A", "$12.00"), row("A", "$8.00")],
    );
    expect(
      selected.slice(0, 2).map((item) => item.unitPrice.formatted),
    ).toEqual(["", ""]);
  });
  it("consumes duplicate invoice rows once each", () => {
    const selected = selectFallbackItems(
      [row("A", ""), row("A", ""), row("A", "")],
      [row("A", "$12.00"), row("A", "$12.00")],
    );
    expect(selected.map((item) => item.unitPrice.formatted)).toEqual([
      "$12.00",
      "$12.00",
      "",
    ]);
  });
});
