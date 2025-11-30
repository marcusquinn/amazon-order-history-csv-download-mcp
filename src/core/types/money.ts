/**
 * Money representation with amount, currency, and original formatted string.
 */
export interface Money {
  /** Numeric amount */
  amount: number;
  /** ISO 4217 currency code (USD, GBP, EUR, etc.) */
  currency: string;
  /** Original formatted string from source */
  formatted: string;
}

/**
 * Create a Money object from a formatted string.
 */
export function parseMoney(formatted: string, defaultCurrency = 'USD'): Money {
  const cleaned = formatted.trim();
  
  // Extract currency symbol/code
  let currency = defaultCurrency;
  let amountStr = cleaned;
  
  // Common currency patterns
  const currencyPatterns: [RegExp, string][] = [
    [/^\$/, 'USD'],
    [/^£/, 'GBP'],
    [/^€/, 'EUR'],
    [/^¥/, 'JPY'],
    [/^₹/, 'INR'],
    [/^AED\s*/, 'AED'],
    [/^SAR\s*/, 'SAR'],
    [/^CAD\s*\$?/, 'CAD'],
    [/^AUD\s*\$?/, 'AUD'],
    [/^MXN\s*\$?/, 'MXN'],
  ];
  
  for (const [pattern, curr] of currencyPatterns) {
    if (pattern.test(cleaned)) {
      currency = curr;
      amountStr = cleaned.replace(pattern, '');
      break;
    }
  }
  
  // Handle negative amounts
  const isNegative = amountStr.includes('-') || amountStr.startsWith('(');
  amountStr = amountStr.replace(/[-()]/g, '');
  
  // Parse numeric value (handle both . and , as decimal separators)
  // European format: 1.234,56 -> 1234.56
  // US format: 1,234.56 -> 1234.56
  let amount: number;
  if (amountStr.includes(',') && amountStr.includes('.')) {
    // Determine which is the decimal separator
    const lastComma = amountStr.lastIndexOf(',');
    const lastDot = amountStr.lastIndexOf('.');
    if (lastComma > lastDot) {
      // European format
      amountStr = amountStr.replace(/\./g, '').replace(',', '.');
    } else {
      // US format
      amountStr = amountStr.replace(/,/g, '');
    }
  } else if (amountStr.includes(',')) {
    // Could be thousands separator or decimal
    const parts = amountStr.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      // Likely decimal separator
      amountStr = amountStr.replace(',', '.');
    } else {
      // Likely thousands separator
      amountStr = amountStr.replace(/,/g, '');
    }
  }
  
  amount = parseFloat(amountStr) || 0;
  if (isNegative) {
    amount = -amount;
  }
  
  return {
    amount,
    currency,
    formatted: cleaned,
  };
}

/**
 * Format a Money object to a string.
 */
export function formatMoney(money: Money): string {
  const symbols: Record<string, string> = {
    USD: '$',
    GBP: '£',
    EUR: '€',
    JPY: '¥',
    INR: '₹',
    AED: 'AED ',
    SAR: 'SAR ',
    CAD: 'CAD $',
    AUD: 'AUD $',
    MXN: 'MXN $',
  };
  
  const symbol = symbols[money.currency] || `${money.currency} `;
  return `${symbol}${money.amount.toFixed(2)}`;
}
