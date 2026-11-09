import { chromium, Browser, Page } from "playwright";
import { extractItemCount } from "../../src/amazon/extractors/order-list";
import { ORDER_CSV_COLUMNS } from "../../src/tools/csv-columns";

describe("order item counts", () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TEST_BROWSER_EXECUTABLE,
    });
  });
  afterAll(async () => {
    await browser?.close();
  });
  beforeEach(async () => {
    page = await browser.newPage();
  });
  afterEach(async () => {
    await page?.close();
  });

  async function count(html: string): Promise<number | undefined> {
    await page.setContent(`<div id="card">${html}</div>`);
    return extractItemCount(page.locator("#card"));
  }
  const cell =
    '<div class="yo-enhanced-grid-cell"><div class="product-grid-image"><a href="/dp/TEST">Product</a></div><span>3</span></div>';

  it("counts grocery product lines without counting quantity badges", async () => {
    expect(await count(cell.repeat(5))).toBe(5);
  });
  it("includes products hidden by the grid overflow", async () => {
    expect(await count(cell.repeat(11) + "<span>and 3 more</span>")).toBe(14);
  });
  it("preserves the standard layout count", async () => {
    expect(
      await count(
        '<div class="a-fixed-left-grid-inner"><a>Image</a><a>Title</a></div>',
      ),
    ).toBe(1);
  });
  it("does not report an unsupported layout as an empty order", async () => {
    expect(await count("<div>Unknown layout</div>")).toBeUndefined();
  });
  it("falls back to detailed items in CSV and leaves unknown counts blank", () => {
    const column = ORDER_CSV_COLUMNS.find((c) => c.key === "itemCount")!;
    // Only fields consumed by this column are needed for these regression cases.
    expect(
      column.getValue({ items: [{}, {}, {}, {}, {}] } as Parameters<
        typeof column.getValue
      >[0]),
    ).toBe(5);
    expect(column.getValue({} as Parameters<typeof column.getValue>[0])).toBe(
      "",
    );
    expect(
      column.getValue({ itemCount: 0 } as Parameters<
        typeof column.getValue
      >[0]),
    ).toBe(0);
  });
});
