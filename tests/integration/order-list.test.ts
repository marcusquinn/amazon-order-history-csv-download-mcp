/**
 * Integration tests for order list extraction.
 * Uses Playwright to test against HTML fixtures.
 */

import { chromium, Browser, Page } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";

// Note: Integration tests require Playwright and are skipped in CI without browsers
describe("order list extraction (integration)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    // Skip if no browser available (CI without playwright install)
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      console.log(
        "Playwright browser not available, skipping integration tests",
      );
      return;
    }
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    if (browser) {
      page = await browser.newPage();
    }
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  describe("UK order card parsing", () => {
    it("extracts order details from UK format HTML", async () => {
      if (!browser) {
        return; // Skip if no browser
      }

      const fixtureHtml = readFileSync(
        join(__dirname, "fixtures/order-card-uk.html"),
        "utf-8",
      );

      // Set page content to our fixture
      await page.setContent(
        `<!DOCTYPE html><html><body>${fixtureHtml}</body></html>`,
      );

      // Find order card
      const orderCard = page.locator('[data-component="orderCard"]');
      expect(await orderCard.count()).toBe(1);

      // Check date extraction (UK format)
      const dateText = await page.textContent("body");
      expect(dateText).toContain("14 November 2024");

      // Check order ID extraction
      expect(dateText).toContain("123-4567890-1234567");

      // Check total extraction
      expect(dateText).toContain("£49.99");

      // Check item count (2 purchasedItems containers)
      const purchasedItems = page.locator('[data-component="purchasedItems"]');
      expect(await purchasedItems.count()).toBe(2);

      // Check delivery status
      const deliveryStatus = page.locator(".delivery-box__primary-text");
      expect(await deliveryStatus.textContent()).toBe("Delivered 16 November");

      // Check address extraction from script template
      const addressScript = page.locator(
        'script[id^="shipToData-shippingAddress-"]',
      );
      const addressHtml = await addressScript.innerHTML();
      expect(addressHtml).toContain("John Smith");
      expect(addressHtml).toContain("123 High Street");
      expect(addressHtml).toContain("LONDON");
      expect(addressHtml).toContain("SW1A 1AA");

      // Check payment method
      const paymentType = await page
        .locator('[data-testid="method-details-name"]')
        .textContent();
      const paymentLastFour = await page
        .locator('[data-testid="method-details-number"]')
        .textContent();
      expect(paymentType).toBe("Visa");
      expect(paymentLastFour).toBe("****1234");

      // Check Subscribe & Save
      expect(dateText).toContain("Auto-delivered: Every 1 month");
    });
  });
});
