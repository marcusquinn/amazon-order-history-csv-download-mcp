/**
 * Money representation with amount, currency, and original formatted string.
 */
export interface Money {
  /** Numeric amount */
  amount: number;
  /** ISO 4217 currency code (USD, GBP, EUR, etc.) */
  currency: string;
  /** Currency symbol (e.g., $, £, €) */
  currencySymbol: string;
  /** Original formatted string from source */
  formatted: string;
}

/** Currency symbols by currency code */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  INR: "₹",
  AED: "AED",
  SAR: "SAR",
  CAD: "C$",
  AUD: "A$",
  MXN: "MX$",
};

/**
 * Get currency symbol for a currency code.
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Create a Money object from a formatted string.
 */
export function parseMoney(formatted: string, defaultCurrency = "USD"): Money {
  const cleaned = formatted.trim();

  // Check for negative indicator at the start (before currency symbol)
  // Handles formats like: -$12.34, ($12.34), -£15.85
  const startsWithNegative = cleaned.startsWith("-") || cleaned.startsWith("(");

  // Remove leading negative sign or opening parenthesis for currency detection
  const workingStr = cleaned.replace(/^[-(\s]+/, "");

  // Extract currency symbol/code
  let currency = defaultCurrency;
  let amountStr = workingStr;

  // Common currency patterns (match after optional negative sign removed)
  const currencyPatterns: [RegExp, string][] = [
    [/^\$/, "USD"],
    [/^£/, "GBP"],
    [/^€/, "EUR"],
    [/^¥/, "JPY"],
    [/^₹/, "INR"],
    [/^AED\s*/, "AED"],
    [/^SAR\s*/, "SAR"],
    [/^CAD\s*\$?/, "CAD"],
    [/^AUD\s*\$?/, "AUD"],
    [/^MXN\s*\$?/, "MXN"],
  ];

  for (const [pattern, curr] of currencyPatterns) {
    if (pattern.test(workingStr)) {
      currency = curr;
      amountStr = workingStr.replace(pattern, "");
      break;
    }
  }

  // Handle negative amounts (check both initial sign and remaining text)
  const isNegative =
    startsWithNegative || amountStr.includes("-") || amountStr.startsWith("(");
  amountStr = amountStr.replace(/[-()]/g, "");

  // Parse numeric value (handle both . and , as decimal separators)
  // European format: 1.234,56 -> 1234.56
  // US format: 1,234.56 -> 1234.56
  let amount: number;
  if (amountStr.includes(",") && amountStr.includes(".")) {
    // Determine which is the decimal separator
    const lastComma = amountStr.lastIndexOf(",");
    const lastDot = amountStr.lastIndexOf(".");
    if (lastComma > lastDot) {
      // European format
      amountStr = amountStr.replace(/\./g, "").replace(",", ".");
    } else {
      // US format
      amountStr = amountStr.replace(/,/g, "");
    }
  } else if (amountStr.includes(",")) {
    // Could be thousands separator or decimal
    const parts = amountStr.split(",");
    if (parts.length === 2 && parts[1].length === 2) {
      // Likely decimal separator
      amountStr = amountStr.replace(",", ".");
    } else {
      // Likely thousands separator
      amountStr = amountStr.replace(/,/g, "");
    }
  }

  amount = parseFloat(amountStr) || 0;
  if (isNegative) {
    amount = -amount;
  }

  return {
    amount,
    currency,
    currencySymbol: getCurrencySymbol(currency),
    formatted: cleaned,
  };
}

/**
 * Format a Money object to a string.
 */
export function formatMoney(money: Money): string {
  const symbols: Record<string, string> = {
    USD: "$",
    GBP: "£",
    EUR: "€",
    JPY: "¥",
    INR: "₹",
    AED: "AED ",
    SAR: "SAR ",
    CAD: "CAD $",
    AUD: "AUD $",
    MXN: "MXN $",
  };

  const symbol = symbols[money.currency] || `${money.currency} `;
  return `${symbol}${money.amount.toFixed(2)}`;
}
