/**
 * Gift card extraction tests.
 */

import { extractGiftCardTransactionsFromHtml } from "../../../src/amazon/extractors/gift-card";

describe("gift card extraction", () => {
  describe("extractGiftCardTransactionsFromHtml", () => {
    const sampleHtml = `
      <table class="a-bordered a-spacing-small a-spacing-top-small">
        <tbody>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Closing balance</th>
          </tr>
          <tr>
            <td> 11 November 2025 </td>
            <td>
              <span>Gift Card applied to Amazon.co.uk order</span>
              <br>
              <a class="a-link-normal" href="/gp/your-account/order-details/ref=gcf_b_bp_lpo_c_d_b_x?ie=UTF8&amp;orderID=203-3791345-1633949"><span>203-3791345-1633949</span></a>
            </td>
            <td>-£15.85</td>
            <td>£0.00</td>
          </tr>
          <tr>
            <td> 8 November 2025 </td>
            <td>
              <span>Gift Card applied to Amazon.co.uk order</span>
              <br>
              <a class="a-link-normal" href="/gp/your-account/order-details/ref=gcf_b_bp_lpo_c_d_b_x?ie=UTF8&amp;orderID=203-9575891-1858726"><span>203-9575891-1858726</span></a>
            </td>
            <td>-£94.00</td>
            <td>£15.85</td>
          </tr>
          <tr>
            <td> 7 November 2025 </td>
            <td>
              <span>Refund from Amazon.co.uk order</span>
              <br>
            </td>
            <td>£127.33</td>
            <td>£127.33</td>
          </tr>
          <tr>
            <td> 19 January 2024 </td>
            <td>
              <span>Gift Card added</span>
              <br>
              <span>Claim code: xxxx-xxxxxx-8HBR; Serial number: 2660069114742969</span>
            </td>
            <td>£8.00</td>
            <td>£8.00</td>
          </tr>
        </tbody>
      </table>
    `;

    it("extracts all transactions from HTML", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      expect(transactions.length).toBe(4);
    });

    it("extracts applied transaction with order ID", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      // Find the first applied transaction (most recent by date)
      const applied = transactions.find(
        (t) => t.orderId === "203-3791345-1633949",
      );

      expect(applied).toBeDefined();
      expect(applied!.type).toBe("applied");
      expect(applied!.amount.amount).toBe(-15.85);
      expect(applied!.closingBalance.amount).toBe(0);
      expect(applied!.description).toContain("Gift Card applied");
    });

    it("extracts refund transaction", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      const refund = transactions.find((t) => t.type === "refund");

      expect(refund).toBeDefined();
      expect(refund!.amount.amount).toBe(127.33);
      expect(refund!.closingBalance.amount).toBe(127.33);
      expect(refund!.orderId).toBeUndefined();
    });

    it("extracts added transaction with claim code", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      const added = transactions.find((t) => t.type === "added");

      expect(added).toBeDefined();
      expect(added!.amount.amount).toBe(8);
      expect(added!.claimCode).toBe("xxxx-xxxxxx-8HBR");
      expect(added!.serialNumber).toBe("2660069114742969");
    });

    it("parses dates correctly", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      // Most recent first
      expect(transactions[0].date.getFullYear()).toBe(2025);
      expect(transactions[0].date.getMonth()).toBe(10); // November = 10
      expect(transactions[0].date.getDate()).toBe(11);
    });

    it("sorts transactions by date descending", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      for (let i = 0; i < transactions.length - 1; i++) {
        expect(transactions[i].date.getTime()).toBeGreaterThanOrEqual(
          transactions[i + 1].date.getTime(),
        );
      }
    });

    it("handles GBP currency correctly", () => {
      const transactions = extractGiftCardTransactionsFromHtml(
        sampleHtml,
        "GBP",
      );

      expect(transactions[0].amount.currency).toBe("GBP");
      expect(transactions[0].amount.currencySymbol).toBe("£");
    });
  });
});
