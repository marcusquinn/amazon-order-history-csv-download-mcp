/**
 * Integration tests for the paginated APX transactions-page layout.
 */

import { Browser, Page, chromium } from "playwright";
import { extractTransactionsFromPage } from "../../src/amazon/extractors/transactions-page";

function transactionPage(
  date: string,
  orderId: string,
  amount: string,
  nextPage?: string,
): string {
  const nextControl = nextPage
    ? `<form action="${nextPage}"><input name="ppw-widgetEvent:DefaultNextPageNavigationEvent" type="submit"></form>`
    : "";

  return `<main>
    <div class="apx-transaction-date-container">${date}</div>
    <div class="apx-transactions-line-item-component-container">
      <span class="a-text-bold">Visa ****1234</span>
      <div class="a-text-right"><span class="a-text-bold">${amount}</span></div>
      <a href="/gp/yourstore/order-details?orderID=${orderId}">Order #${orderId}</a>
      <span>Amazon AU</span>
    </div>
    ${nextControl}
  </main>`;
}

describe("APX transactions-page extraction", () => {
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
    await browser?.close();
  });

  beforeEach(async () => {
    if (browser) page = await browser.newPage();
  });

  afterEach(async () => {
    await page?.close();
  });

  it("collects each APX page and preserves signed refund amounts", async () => {
    if (!browser) return;

    await page.route("**/cpe/yourpayments/transactions**", async (route) => {
      const body = route.request().url().includes("page=2")
        ? transactionPage("27 June 2026", "222-2222222-2222222", "-$47.99")
        : transactionPage(
            "28 June 2026",
            "111-1111111-1111111",
            "+$93.59",
            "/cpe/yourpayments/transactions?page=2",
          );
      await route.fulfill({ contentType: "text/html", body });
    });

    const transactions = await extractTransactionsFromPage(page, "au", {
      maxScrolls: 3,
    });

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      orderIds: ["111-1111111-1111111"],
      amount: { amount: 93.59, currency: "AUD" },
      platformData: { isRefund: true },
    });
    expect(transactions[1]).toMatchObject({
      orderIds: ["222-2222222-2222222"],
      amount: { amount: -47.99, currency: "AUD" },
    });
  });

  it("stops when an enabled next control does not change the page", async () => {
    if (!browser) return;

    await page.route("**/cpe/yourpayments/transactions**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `${transactionPage("28 June 2026", "111-1111111-1111111", "-$10.00")}
          <input name="ppw-widgetEvent:DefaultNextPageNavigationEvent" type="button">`,
      });
    });

    const transactions = await extractTransactionsFromPage(page, "au", {
      maxScrolls: 3,
    });

    expect(transactions).toHaveLength(1);
  });
});
