import { Page } from "playwright";
import { AmazonPlugin } from "../../../src/amazon/adapter";
import {
  extractOrderDetails,
  extractOrderHeaders,
  goToNextPage,
  hasNextPage,
} from "../../../src/amazon/extractors";
import { OrderHeader } from "../../../src/core/types/order";
import { OrderListParams } from "../../../src/core/types/platform";
import { fetchOrders } from "../../../src/tools/fetch-orders";

jest.mock("../../../src/amazon/extractors", () => ({
  extractOrderDetails: jest.fn(),
  extractOrderHeaders: jest.fn(),
  goToNextPage: jest.fn(),
  hasNextPage: jest.fn(),
}));

const mockedExtractOrderDetails = jest.mocked(extractOrderDetails);
const mockedExtractOrderHeaders = jest.mocked(extractOrderHeaders);
const mockedGoToNextPage = jest.mocked(goToNextPage);
const mockedHasNextPage = jest.mocked(hasNextPage);

function order(id: string, date: Date | null): OrderHeader {
  return {
    id,
    orderId: id,
    date,
    total: {
      amount: 10,
      currency: "USD",
      currencySymbol: "$",
      formatted: "$10.00",
    },
    detailUrl: `https://www.amazon.com/order-details/${id}`,
    platform: "amazon",
    region: "us",
  };
}

describe("fetchOrders date range orchestration", () => {
  let currentUrl: string;
  let page: Page;
  let plugin: AmazonPlugin;
  let getOrderListUrl: jest.Mock<string, [string, OrderListParams]>;
  let checkAuthStatus: jest.Mock;
  let extractTransactions: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUrl = "about:blank";
    page = {
      goto: jest.fn(async (url: string) => {
        currentUrl = url;
        return null;
      }),
      waitForSelector: jest.fn().mockResolvedValue(null),
      url: jest.fn(() => currentUrl),
    } as unknown as Page;

    getOrderListUrl = jest.fn(
      (_region: string, params: OrderListParams) =>
        `https://www.amazon.com/your-orders/orders?year=${params.year}`,
    );
    checkAuthStatus = jest.fn().mockResolvedValue({
      authenticated: true,
      region: "us",
      message: "Authenticated",
    });
    extractTransactions = jest.fn().mockResolvedValue([]);
    plugin = {
      getOrderListUrl,
      checkAuthStatus,
      extractTransactions,
    } as unknown as AmazonPlugin;

    mockedExtractOrderDetails.mockResolvedValue({} as never);
    mockedHasNextPage.mockResolvedValue(false);
    mockedGoToNextPage.mockResolvedValue(true);
  });

  it("visits each inclusive year newest first and filters before enrichment", async () => {
    mockedExtractOrderHeaders
      .mockResolvedValueOnce([
        order("too-new", new Date(2025, 0, 2)),
        order("new-year", new Date(2025, 0, 1)),
        order("missing-date", null),
        order("invalid-date", new Date(Number.NaN)),
      ])
      .mockResolvedValueOnce([
        order("old-year", new Date(2024, 11, 31)),
        order("too-old", new Date(2024, 11, 30)),
      ]);

    const result = await fetchOrders(page, plugin, {
      region: "us",
      year: 1999,
      startDate: "2024-12-31",
      endDate: "2025-01-01",
      includeTransactions: true,
      useInvoice: false,
    });

    expect(getOrderListUrl.mock.calls.map(([, params]) => params.year)).toEqual(
      [2025, 2024],
    );
    expect(result.orders.map(({ id }) => id)).toEqual(["new-year", "old-year"]);
    expect(result.errors).toEqual([
      "Excluded 2 orders with missing or invalid dates from the bounded result.",
    ]);
    expect(extractTransactions).toHaveBeenCalledTimes(2);
    expect(
      extractTransactions.mock.calls.map(([, header]) => header.id),
    ).toEqual(["new-year", "old-year"]);
  });

  it("applies maxOrders only after filtering and stops all traversal", async () => {
    mockedExtractOrderHeaders
      .mockResolvedValueOnce([
        order("out-of-range", new Date(2023, 11, 31)),
        order("first", new Date(2025, 5, 1)),
      ])
      .mockResolvedValueOnce([order("second", new Date(2025, 4, 1))]);
    mockedHasNextPage.mockResolvedValueOnce(true);

    const result = await fetchOrders(page, plugin, {
      region: "us",
      startDate: "2024-12-01",
      endDate: "2025-12-31",
      maxOrders: 2,
    });

    expect(result.orders.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(mockedExtractOrderHeaders).toHaveBeenCalledTimes(2);
    expect(mockedGoToNextPage).toHaveBeenCalledTimes(1);
    expect(getOrderListUrl).toHaveBeenCalledTimes(1);
    expect(getOrderListUrl.mock.calls[0][1].year).toBe(2025);
  });

  it("visits the current year back through the start year for a start-only bound", async () => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    mockedExtractOrderHeaders
      .mockResolvedValueOnce([order("current", new Date(currentYear, 6, 1))])
      .mockResolvedValueOnce([order("middle", new Date(currentYear - 1, 6, 1))])
      .mockResolvedValueOnce([
        order("start", new Date(startYear, 5, 1)),
        order("before-start", new Date(startYear, 4, 31)),
      ]);

    const result = await fetchOrders(page, plugin, {
      region: "us",
      startDate: `${startYear}-06-01`,
    });

    expect(getOrderListUrl.mock.calls.map(([, params]) => params.year)).toEqual(
      [currentYear, currentYear - 1, startYear],
    );
    expect(result.orders.map(({ id }) => id)).toEqual([
      "current",
      "middle",
      "start",
    ]);
  });

  it("visits only the end-date year for an end-only bound", async () => {
    mockedExtractOrderHeaders.mockResolvedValueOnce([
      order("included", new Date(2022, 2, 1)),
      order("excluded", new Date(2022, 2, 2)),
    ]);

    const result = await fetchOrders(page, plugin, {
      region: "us",
      endDate: "2022-03-01",
    });

    expect(getOrderListUrl).toHaveBeenCalledTimes(1);
    expect(getOrderListUrl.mock.calls[0][1].year).toBe(2022);
    expect(result.orders.map(({ id }) => id)).toEqual(["included"]);
  });

  it.each([
    {
      options: { startDate: "2024-02-30" },
      error: "Invalid start date",
    },
    {
      options: { endDate: "not-a-date" },
      error: "Invalid end date",
    },
    {
      options: { startDate: "2025-01-01", endDate: "2024-12-31" },
      error: "Invalid date range",
    },
  ])("rejects $error before browser navigation", async ({ options, error }) => {
    const result = await fetchOrders(page, plugin, {
      region: "us",
      ...options,
    });

    expect(result.errors[0]).toContain(error);
    expect(page.goto).not.toHaveBeenCalled();
    expect(getOrderListUrl).not.toHaveBeenCalled();
    expect(checkAuthStatus).not.toHaveBeenCalled();
  });

  it("preserves explicit-year behavior when no date bounds are supplied", async () => {
    mockedExtractOrderHeaders.mockResolvedValueOnce([
      order("dated", new Date(2021, 0, 1)),
      order("undated", null),
    ]);

    const result = await fetchOrders(page, plugin, {
      region: "us",
      year: 2021,
    });

    expect(getOrderListUrl).toHaveBeenCalledWith("us", { year: 2021 });
    expect(result.orders.map(({ id }) => id)).toEqual(["dated", "undated"]);
    expect(result.errors).toEqual([]);
  });
});
