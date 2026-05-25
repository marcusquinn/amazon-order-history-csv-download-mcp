/**
 * Unit tests for the AmazonPlugin adapter.
 *
 * Focused on getOrderListUrl's timeFilter selection logic — when callers
 * pass startDate / endDate but no explicit year or months, the adapter
 * picks the smallest covering Amazon timeFilter so the server returns a
 * narrower page set. Per-page filtering and early pagination termination
 * then happen downstream in fetchOrders.
 */

import { AmazonPlugin } from "../../../src/amazon/adapter";

describe("AmazonPlugin.getOrderListUrl", () => {
  const plugin = new AmazonPlugin();

  // Real wall-clock for the "now" reference inside the adapter; tests stub
  // dates relative to Date.now() to stay deterministic without freezing time.
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  describe("explicit filters take precedence", () => {
    it("uses year-YYYY when params.year is set", () => {
      const url = plugin.getOrderListUrl("uk", { year: 2024 });
      expect(url).toContain("timeFilter=year-2024");
    });

    it("uses months-N when params.months is set", () => {
      const url = plugin.getOrderListUrl("uk", { months: 3 });
      expect(url).toContain("timeFilter=months-3");
    });

    it("year wins over startDate", () => {
      const url = plugin.getOrderListUrl("uk", {
        year: 2023,
        startDate: daysAgo(7),
      });
      expect(url).toContain("timeFilter=year-2023");
      expect(url).not.toContain("months-");
    });
  });

  describe("date-window inference", () => {
    it("picks months-1 for windows entirely within the last 30 days", () => {
      const url = plugin.getOrderListUrl("uk", {
        startDate: daysAgo(7),
        endDate: daysAgo(0),
      });
      expect(url).toContain("timeFilter=months-1");
    });

    it("picks months-3 for windows entirely within the last 90 days (but >30)", () => {
      const url = plugin.getOrderListUrl("uk", {
        startDate: daysAgo(60),
        endDate: daysAgo(45),
      });
      expect(url).toContain("timeFilter=months-3");
    });

    it("falls back to year-{startYear} for older windows", () => {
      const start = daysAgo(200);
      const url = plugin.getOrderListUrl("uk", {
        startDate: start,
        endDate: daysAgo(100),
      });
      expect(url).toContain(`timeFilter=year-${start.getFullYear()}`);
    });

    it("defaults endDate to now when only startDate is given", () => {
      const url = plugin.getOrderListUrl("uk", { startDate: daysAgo(7) });
      expect(url).toContain("timeFilter=months-1");
    });

    it("emits no timeFilter when neither year, months, nor startDate are set", () => {
      const url = plugin.getOrderListUrl("uk", {});
      expect(url).not.toContain("timeFilter=");
    });
  });

  describe("URL shape", () => {
    it("uses the UK domain for region=uk", () => {
      const url = plugin.getOrderListUrl("uk", { months: 1 });
      expect(url).toMatch(/^https:\/\/www\.amazon\.co\.uk\/your-orders\/orders\?/);
    });

    it("falls back to .com for an unknown region", () => {
      const url = plugin.getOrderListUrl("xx", { months: 1 });
      expect(url).toContain("amazon.com");
    });

    it("includes startIndex when provided", () => {
      const url = plugin.getOrderListUrl("uk", { startIndex: 20 });
      expect(url).toContain("startIndex=20");
    });
  });
});
