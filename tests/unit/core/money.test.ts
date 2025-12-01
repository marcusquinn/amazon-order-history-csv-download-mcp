/**
 * Tests for money parsing utilities.
 */

import {
  parseMoney,
  formatMoney,
  getCurrencySymbol,
} from "../../../src/core/types/money";

describe("money parsing", () => {
  describe("parseMoney", () => {
    describe("USD parsing", () => {
      test("parses $12.34", () => {
        const money = parseMoney("$12.34");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("USD");
        expect(money.currencySymbol).toBe("$");
      });

      test("parses $1,234.56", () => {
        const money = parseMoney("$1,234.56");
        expect(money.amount).toBe(1234.56);
        expect(money.currency).toBe("USD");
      });

      test("parses $12,345.67 with thousands separator", () => {
        const money = parseMoney("$12,345.67");
        expect(money.amount).toBe(12345.67);
      });
    });

    describe("GBP parsing", () => {
      test("parses £12.34", () => {
        const money = parseMoney("£12.34");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("GBP");
        expect(money.currencySymbol).toBe("£");
      });

      test("parses £1,234.56", () => {
        const money = parseMoney("£1,234.56");
        expect(money.amount).toBe(1234.56);
        expect(money.currency).toBe("GBP");
      });
    });

    describe("EUR parsing", () => {
      test("parses €12.34", () => {
        const money = parseMoney("€12.34");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("EUR");
        expect(money.currencySymbol).toBe("€");
      });

      test("parses European format €1.234,56", () => {
        const money = parseMoney("€1.234,56");
        expect(money.amount).toBe(1234.56);
        expect(money.currency).toBe("EUR");
      });

      test("parses €12,34 (European decimal)", () => {
        const money = parseMoney("€12,34");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("EUR");
      });
    });

    describe("JPY parsing", () => {
      test("parses ¥1234", () => {
        const money = parseMoney("¥1234");
        expect(money.amount).toBe(1234);
        expect(money.currency).toBe("JPY");
        expect(money.currencySymbol).toBe("¥");
      });

      test("parses ¥12,345", () => {
        const money = parseMoney("¥12,345");
        expect(money.amount).toBe(12345);
        expect(money.currency).toBe("JPY");
      });
    });

    describe("INR parsing", () => {
      test("parses ₹1,234.56", () => {
        const money = parseMoney("₹1,234.56");
        expect(money.amount).toBe(1234.56);
        expect(money.currency).toBe("INR");
        expect(money.currencySymbol).toBe("₹");
      });
    });

    describe("Middle East currencies", () => {
      test("parses AED 123.45", () => {
        const money = parseMoney("AED 123.45");
        expect(money.amount).toBe(123.45);
        expect(money.currency).toBe("AED");
      });

      test("parses SAR 123.45", () => {
        const money = parseMoney("SAR 123.45");
        expect(money.amount).toBe(123.45);
        expect(money.currency).toBe("SAR");
      });
    });

    describe("negative amounts", () => {
      test("parses -$12.34", () => {
        const money = parseMoney("-$12.34");
        expect(money.amount).toBe(-12.34);
        expect(money.currency).toBe("USD");
      });

      test("parses -£15.85", () => {
        const money = parseMoney("-£15.85");
        expect(money.amount).toBe(-15.85);
        expect(money.currency).toBe("GBP");
      });

      test("parses ($12.34) parentheses format", () => {
        const money = parseMoney("($12.34)");
        expect(money.amount).toBe(-12.34);
      });
    });

    describe("default currency", () => {
      test("uses default currency when no symbol present", () => {
        const money = parseMoney("12.34", "GBP");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("GBP");
      });

      test("defaults to USD when no symbol and no default", () => {
        const money = parseMoney("12.34");
        expect(money.amount).toBe(12.34);
        expect(money.currency).toBe("USD");
      });
    });

    describe("edge cases", () => {
      test("parses empty string", () => {
        const money = parseMoney("");
        expect(money.amount).toBe(0);
      });

      test("parses whitespace", () => {
        const money = parseMoney("  $12.34  ");
        expect(money.amount).toBe(12.34);
      });

      test("preserves original formatted string", () => {
        const money = parseMoney("$1,234.56");
        expect(money.formatted).toBe("$1,234.56");
      });
    });
  });

  describe("formatMoney", () => {
    test("formats USD", () => {
      const money = {
        amount: 12.34,
        currency: "USD",
        currencySymbol: "$",
        formatted: "",
      };
      expect(formatMoney(money)).toBe("$12.34");
    });

    test("formats GBP", () => {
      const money = {
        amount: 99.99,
        currency: "GBP",
        currencySymbol: "£",
        formatted: "",
      };
      expect(formatMoney(money)).toBe("£99.99");
    });

    test("formats EUR", () => {
      const money = {
        amount: 50.0,
        currency: "EUR",
        currencySymbol: "€",
        formatted: "",
      };
      expect(formatMoney(money)).toBe("€50.00");
    });

    test("formats to 2 decimal places", () => {
      const money = {
        amount: 10,
        currency: "USD",
        currencySymbol: "$",
        formatted: "",
      };
      expect(formatMoney(money)).toBe("$10.00");
    });
  });

  describe("getCurrencySymbol", () => {
    test("returns $ for USD", () => {
      expect(getCurrencySymbol("USD")).toBe("$");
    });

    test("returns £ for GBP", () => {
      expect(getCurrencySymbol("GBP")).toBe("£");
    });

    test("returns € for EUR", () => {
      expect(getCurrencySymbol("EUR")).toBe("€");
    });

    test("returns currency code for unknown currencies", () => {
      expect(getCurrencySymbol("XYZ")).toBe("XYZ");
    });
  });
});
