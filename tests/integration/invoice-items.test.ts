/**
 * Regression test for extractItemsFromDataComponents.
 *
 * Guards against a class of qty-attribution bug: when a single
 * [data-component="purchasedItems"] container holds multiple items, only
 * items with qty > 1 render a .od-item-view-qty badge. If qty lookups
 * are done by indexing across separate locator collections scoped to the
 * whole container, the n-th title doesn't line up with the n-th badge —
 * the badge gets bound to the wrong item and items past it default to 1.
 *
 * The fixture mirrors that shape with three rows in one container plus
 * a separate singleton container, and asserts each item ends up with
 * its own qty.
 */

import { chromium, Browser, Page } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";
import { extractItemsFromDataComponents } from "../../src/amazon/extractors/invoice";

describe("invoice item extraction (integration)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      console.log("Playwright browser not available, skipping integration tests");
    }
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    if (browser) page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe("multi-item shipment with one qty badge", () => {
    it("binds qty to the right item across mixed-qty rows", async () => {
      if (!browser) return;

      const fixtureHtml = readFileSync(
        join(__dirname, "fixtures/invoice-multi-item-qty.html"),
        "utf-8",
      );
      await page.setContent(fixtureHtml);

      const items = await extractItemsFromDataComponents(page, "GBP");

      // 1 singleton container + 3-row container = 4 items total.
      expect(items.length).toBe(4);

      const byName = (needle: string) =>
        items.find((it) => it.name.toLowerCase().includes(needle.toLowerCase()));

      const usbCable = byName("USB Cable");
      const notebook = byName("Notebook");
      const mouse = byName("Wireless Mouse");
      const lamp = byName("Desk Lamp");

      expect(usbCable).toBeDefined();
      expect(notebook).toBeDefined();
      expect(mouse).toBeDefined();
      expect(lamp).toBeDefined();

      // Only the Wireless Mouse row carries a .od-item-view-qty badge.
      // The bug-prone case: Notebook precedes Mouse in source order, so a
      // positional-index lookup wrongly assigns the badge value to Notebook.
      expect(mouse!.quantity).toBe(2);
      expect(notebook!.quantity).toBe(1);
      expect(lamp!.quantity).toBe(1);
      expect(usbCable!.quantity).toBe(1);
    });
  });
});
