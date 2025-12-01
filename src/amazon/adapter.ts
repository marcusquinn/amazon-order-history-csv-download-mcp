/**
 * Amazon platform adapter implementing IPlatformPlugin.
 */

import { Page } from "playwright";
import {
  BasePlatformPlugin,
  AuthStatus,
  OrderListParams,
  OrderHeader,
  OrderDetails,
  Region,
} from "../core/types";
import { Item } from "../core/types/item";
import { Shipment } from "../core/types/shipment";
import { Transaction } from "../core/types/transaction";
import { parseMoney } from "../core/types/money";
import { parseDate } from "../core/utils/date";
import { getTextByXPaths, getElementsByXPath } from "../core/utils/extraction";
import { AMAZON_REGIONS, getRegionByCode } from "./regions";
import { extractItems } from "./extractors/items";
import { extractShipments } from "./extractors/shipments";
import { extractTransactions } from "./extractors/transactions";

/**
 * Amazon platform plugin.
 */
export class AmazonPlugin extends BasePlatformPlugin {
  readonly name = "Amazon";
  readonly slug = "amazon";
  readonly supportedRegions: Region[] = AMAZON_REGIONS;

  /**
   * Check if user is authenticated on Amazon.
   */
  async checkAuthStatus(page: Page, region: string): Promise<AuthStatus> {
    const regionConfig = getRegionByCode(region);
    if (!regionConfig) {
      return {
        authenticated: false,
        region,
        message: `Unknown region: ${region}`,
      };
    }

    try {
      // Check current URL - if already on Amazon, don't navigate again
      const currentUrl = page.url();
      if (!currentUrl.includes(regionConfig.domain)) {
        const url = `https://www.${regionConfig.domain}/gp/css/order-history`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        // Wait for page content instead of fixed delay
        await page
          .waitForSelector(
            ".order-card, #signInSubmit, #ap_email, .a-box-group",
            { timeout: 2000 },
          )
          .catch(() => {});
      }

      // Check for sign-in page indicators (multiple patterns)
      const signInIndicators = [
        "#signInSubmit",
        "#ap_email",
        'input[name="email"]',
        "#ap_password",
        '[data-action="sign-in"]',
        ".auth-pagelet-container",
      ];

      for (const selector of signInIndicators) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          return {
            authenticated: false,
            region,
            message: "Not logged in - sign in required",
          };
        }
      }

      // If we're on any Amazon page that's NOT a sign-in page, we're probably logged in
      // Check for common logged-in indicators
      const loggedInIndicators = [
        "#nav-link-accountList",
        "#nav-orders",
        ".nav-line-1",
        "#nav-al-container",
      ];

      for (const selector of loggedInIndicators) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          // Try to get username
          const username = await getTextByXPaths(
            page,
            [
              '//span[@id="nav-link-accountList-nav-line-1"]',
              '//span[contains(@class, "nav-line-1")]',
            ],
            "",
          );

          return {
            authenticated: true,
            username: username || undefined,
            region,
            message: "Authenticated",
          };
        }
      }

      // Check if page contains order-related content
      const pageContent = await page.content();
      if (
        pageContent.includes("your-orders") ||
        pageContent.includes("order-card") ||
        pageContent.includes("orderCard")
      ) {
        return {
          authenticated: true,
          region,
          message: "Authenticated (detected order content)",
        };
      }

      return {
        authenticated: false,
        region,
        message: "Unable to determine authentication status",
      };
    } catch (error) {
      return {
        authenticated: false,
        region,
        message: `Error checking auth: ${error}`,
      };
    }
  }

  /**
   * Get login URL for a region.
   */
  getLoginUrl(region: string): string {
    const regionConfig = getRegionByCode(region);
    const domain = regionConfig?.domain || "amazon.com";
    return `https://www.${domain}/ap/signin`;
  }

  /**
   * Get order list URL with filters.
   */
  getOrderListUrl(region: string, params: OrderListParams): string {
    const regionConfig = getRegionByCode(region);
    const domain = regionConfig?.domain || "amazon.com";
    const language = regionConfig?.language || "en_US";

    const baseUrl = `https://www.${domain}/your-orders/orders`;
    const queryParams = new URLSearchParams();

    if (params.year) {
      queryParams.set("timeFilter", `year-${params.year}`);
    } else if (params.months) {
      queryParams.set("timeFilter", `months-${params.months}`);
    }

    if (params.startIndex) {
      queryParams.set("startIndex", params.startIndex.toString());
    }

    queryParams.set("language", language);

    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Get order detail URL.
   */
  getOrderDetailUrl(orderId: string, region: string): string {
    const regionConfig = getRegionByCode(region);
    const domain = regionConfig?.domain || "amazon.com";
    return `https://www.${domain}/gp/your-account/order-details?orderID=${orderId}`;
  }

  /**
   * Extract order headers from order list page.
   */
  async extractOrderHeaders(
    page: Page,
    region: string,
  ): Promise<OrderHeader[]> {
    const headers: OrderHeader[] = [];
    const regionConfig = getRegionByCode(region);
    const currency = regionConfig?.currency || "USD";

    // Find order cards using multiple strategies
    const orderCards = await getElementsByXPath(
      page,
      '//*[contains(@class, "js-order-card") or @id="orderCard"]',
    );

    for (const card of orderCards) {
      try {
        // Extract order ID
        const orderId = await card
          .locator('[data-a-popover*="orderId"]')
          .first()
          .getAttribute("data-a-popover")
          .catch(() => null);

        let id = "";
        if (orderId) {
          const match = orderId.match(/orderId['":\s]+([0-9-]+)/);
          id = match ? match[1] : "";
        }

        if (!id) {
          // Try alternate extraction
          const orderIdText = await card
            .locator('.yohtmlc-order-id span, [data-test-id="order-id"]')
            .first()
            .textContent()
            .catch(() => "");
          id = orderIdText?.replace(/[^0-9-]/g, "") || "";
        }

        if (!id) continue;

        // Extract date
        const dateText = await card
          .locator('.order-info .value, [data-test-id="order-date"]')
          .first()
          .textContent()
          .catch(() => "");
        const date = parseDate(dateText || "");

        // Extract total
        const totalText = await card
          .locator('.yohtmlc-order-total .value, [data-test-id="order-total"]')
          .first()
          .textContent()
          .catch(() => "");
        const total = parseMoney(totalText || "", currency);

        // Extract detail URL
        const detailLink = await card
          .locator('a[href*="order-details"]')
          .first()
          .getAttribute("href")
          .catch(() => "");
        const detailUrl = detailLink
          ? `https://www.${regionConfig?.domain}${detailLink}`
          : this.getOrderDetailUrl(id, region);

        headers.push({
          id,
          orderId: id,
          date,
          total,
          detailUrl,
          platform: "amazon",
          region,
        });
      } catch {
        // Skip malformed order cards
        continue;
      }
    }

    return headers;
  }

  /**
   * Get expected order count from the page.
   */
  async getExpectedOrderCount(page: Page): Promise<number> {
    const countText = await getTextByXPaths(
      page,
      ['//span[@class="num-orders"]', '//*[contains(text(), "orders")]'],
      "",
    );

    const match = countText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract order details from detail page.
   * Uses data-component selectors for 2024+ layouts with XPath fallbacks.
   */
  async extractOrderDetails(
    page: Page,
    header: OrderHeader,
  ): Promise<OrderDetails> {
    const regionConfig = getRegionByCode(header.region);
    const currency = regionConfig?.currency || "USD";

    // Navigate to detail page if needed
    const currentUrl = page.url();
    if (!currentUrl.includes(header.id)) {
      await page.goto(header.detailUrl, { waitUntil: "domcontentloaded" });
      // Wait for key content - prioritize data-component selectors
      await page
        .waitForSelector(
          '[data-component="orderDetails"], [data-component="shipments"], #od-subtotals, .order-details',
          { timeout: 2000 },
        )
        .catch(() => {});
    }

    // Extract shipping - try data-component first, then XPath
    let shippingText = "";
    const shippingEl = page
      .locator(
        '[data-component="orderSubtotals"] >> text=/Shipping|Postage|Delivery/i >> xpath=../following-sibling::*',
      )
      .first();
    if ((await shippingEl.count().catch(() => 0)) > 0) {
      shippingText =
        (await shippingEl.textContent({ timeout: 300 }).catch(() => "")) || "";
    }
    if (!shippingText) {
      shippingText = await getTextByXPaths(
        page,
        [
          '//div[contains(@id,"od-subtotals")]//span[contains(text(),"Shipping") or contains(text(),"Postage") or contains(text(),"Delivery")]/../following-sibling::div/span',
        ],
        "",
      );
    }
    const shipping = parseMoney(shippingText, currency);

    // Extract tax (varies by region) - try data-component first
    let taxText = "";
    const taxEl = page
      .locator(
        '[data-component="orderSubtotals"] >> text=/VAT|Tax|GST/i >> xpath=../following-sibling::*',
      )
      .first();
    if ((await taxEl.count().catch(() => 0)) > 0) {
      taxText =
        (await taxEl.textContent({ timeout: 300 }).catch(() => "")) || "";
    }
    if (!taxText) {
      const taxXpaths = [
        '//div[contains(@id,"od-subtotals")]//span[contains(text(),"VAT") or contains(text(),"Tax") or contains(text(),"GST")]/../following-sibling::div/span',
        '//span[contains(text(),"Estimated tax")]/../following-sibling::div/span',
      ];
      taxText = await getTextByXPaths(page, taxXpaths, "");
    }
    const tax = parseMoney(taxText, currency);

    // Extract recipient - try data-component selectors first
    let recipientName = "";
    const recipientSelectors = [
      '[data-component="shippingAddress"] .displayAddressFullName',
      '[data-component="shippingAddress"] ul li:first-child',
      '[data-component="deliveryAddress"] .displayAddressFullName',
    ];
    for (const selector of recipientSelectors) {
      const el = page.locator(selector).first();
      if ((await el.count().catch(() => 0)) > 0) {
        recipientName =
          (await el.textContent({ timeout: 300 }).catch(() => "")) || "";
        if (recipientName) break;
      }
    }
    if (!recipientName) {
      recipientName = await getTextByXPaths(
        page,
        [
          '//*[contains(@class,"displayAddressFullName")]',
          './/div[@data-component="shippingAddress"]/ul/li[1]',
        ],
        "",
      );
    }

    // Extract payments - try data-component first
    let paymentText = "";
    const paymentEl = page
      .locator(
        '[data-component="paymentInformation"], [data-component="viewPaymentPlanSummaryWidget"]',
      )
      .first();
    if ((await paymentEl.count().catch(() => 0)) > 0) {
      paymentText =
        (await paymentEl.textContent({ timeout: 300 }).catch(() => "")) || "";
    }
    if (!paymentText) {
      paymentText = await getTextByXPaths(
        page,
        [
          '//span[contains(text(),"ending in")]',
          '//div[contains(@class,"payment-method")]',
        ],
        "",
      );
    }

    // Extract invoice URL
    const invoiceUrl = await page
      .locator('a[href*="/invoice"]')
      .first()
      .getAttribute("href")
      .catch(() => undefined);

    return {
      shipping,
      tax,
      recipient: {
        name: recipientName,
      },
      payments: paymentText ? [{ method: paymentText }] : [],
      invoiceUrl: invoiceUrl
        ? `https://www.${regionConfig?.domain}${invoiceUrl}`
        : undefined,
    };
  }

  /**
   * Extract items from order detail page.
   */
  async extractItems(page: Page, header: OrderHeader): Promise<Item[]> {
    return extractItems(page, header);
  }

  /**
   * Extract shipments from order detail page.
   * @param fetchTrackingNumbers - If true, visits ship-track pages to get actual carrier tracking numbers (slower)
   */
  async extractShipments(
    page: Page,
    header: OrderHeader,
    fetchTrackingNumbers = false,
  ): Promise<Shipment[]> {
    return extractShipments(page, header, { fetchTrackingNumbers });
  }

  /**
   * Extract transactions from order detail page.
   */
  async extractTransactions(
    page: Page,
    header: OrderHeader,
  ): Promise<Transaction[]> {
    return extractTransactions(page, header);
  }
}
