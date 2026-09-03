import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { AmazonPlugin } from "../../src/amazon/adapter";
import { extractDataComponentItems } from "../../src/amazon/extractors/items";
import type { OrderHeader } from "../../src/core/types/order";
import { fetchOrders } from "../../src/tools/fetch-orders";

const bundledBrowser = chromium.executablePath();
const macOsBrowser =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = existsSync(bundledBrowser)
  ? bundledBrowser
  : process.platform === "darwin" && existsSync(macOsBrowser)
    ? macOsBrowser
    : undefined;

const describeWithBrowser = browserExecutable ? describe : describe.skip;

describeWithBrowser("modern invoice item extraction", () => {
  let browser: Browser;
  let page: Page;

  const header: OrderHeader = {
    id: "123-4567890-1234567",
    orderId: "123-4567890-1234567",
    date: null,
    total: { amount: 0, currency: "GBP", currencySymbol: "£", formatted: "" },
    detailUrl: "https://www.amazon.co.uk/example-order",
    platform: "amazon",
    region: "uk",
  };

  beforeAll(async () => {
    if (!browserExecutable) throw new Error("Browser executable not available");
    browser = await chromium.launch({
      headless: true,
      executablePath: browserExecutable,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    const fixtureHtml = readFileSync(
      join(__dirname, "fixtures/invoice-multi-item-qty.html"),
      "utf-8",
    );
    await page.setContent(fixtureHtml);
  });

  afterEach(async () => {
    await page.close();
  });

  it("binds sparse quantity badges and fields to their own item rows", async () => {
    const items = await extractDataComponentItems(page, header, "GBP");

    expect(items).not.toBeNull();
    expect(items?.map(({ name, quantity }) => ({ name, quantity }))).toEqual([
      { name: "USB Cable", quantity: 1 },
      { name: "Notebook", quantity: 1 },
      { name: "Wireless Mouse", quantity: 2 },
      { name: "Desk Lamp", quantity: 1 },
      { name: "Legacy Adapter", quantity: 3 },
    ]);

    const notebook = items?.find((item) => item.name === "Notebook");
    const mouse = items?.find((item) => item.name === "Wireless Mouse");
    expect(items?.map((item) => item.asin)).toEqual([
      "B000000001",
      "B000000002",
      "B000000003",
      "B000000004",
      "B000000005",
    ]);
    expect(notebook?.condition).toBe("New");
    expect(notebook?.unitPrice.amount).toBe(4.5);
    expect(notebook?.seller?.name).toBe("Shared Seller");
    expect(mouse?.unitPrice.amount).toBe(14.99);
    expect(mouse?.seller?.name).toBe("Row Seller");
    expect(mouse?.subscriptionFrequency).toBe("Every 2 months");
  });

  it("uses the shared row-scoped extractor in the single-order flow", async () => {
    const fixtureHtml = readFileSync(
      join(__dirname, "fixtures/invoice-multi-item-qty.html"),
      "utf-8",
    );
    await page.route(
      "**/gp/css/summary/print.html?orderID=*",
      async (route) => {
        await route.fulfill({ contentType: "text/html", body: fixtureHtml });
      },
    );

    const result = await fetchOrders(page, new AmazonPlugin(), {
      region: "uk",
      orderId: header.orderId,
      includeItems: true,
    });

    expect(result.errors).toEqual([]);
    expect(
      result.items.map(({ name, quantity }) => ({ name, quantity })),
    ).toEqual([
      { name: "USB Cable", quantity: 1 },
      { name: "Notebook", quantity: 1 },
      { name: "Wireless Mouse", quantity: 2 },
      { name: "Desk Lamp", quantity: 1 },
      { name: "Legacy Adapter", quantity: 3 },
    ]);
    expect(
      result.items.find((item) => item.name === "Wireless Mouse")?.seller?.name,
    ).toBe("Row Seller");
  });
});
