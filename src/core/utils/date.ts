/**
 * Multi-locale date parsing utilities.
 * Supports date formats from all 16 Amazon regions.
 */

// Month names by language
const MONTH_NAMES: Record<string, Record<string, number>> = {
  en: {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  },
  de: {
    januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6,
    juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  },
  fr: {
    janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  },
  es: {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  },
  it: {
    gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
    luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  },
  nl: {
    januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
    juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  },
  ja: {
    '1月': 1, '2月': 2, '3月': 3, '4月': 4, '5月': 5, '6月': 6,
    '7月': 7, '8月': 8, '9月': 9, '10月': 10, '11月': 11, '12月': 12,
  },
};

/**
 * Parse a month name to its number (1-12).
 */
function parseMonthName(monthStr: string): number | null {
  const normalized = monthStr.toLowerCase().trim().replace('.', '');
  
  for (const lang of Object.values(MONTH_NAMES)) {
    if (lang[normalized] !== undefined) {
      return lang[normalized];
    }
  }
  
  return null;
}

/**
 * Normalize a date string to ISO format (YYYY-MM-DD).
 * Handles various international date formats.
 */
export function normalizeDateString(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim();
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // US format: October 14, 2024 or Oct 14, 2024
  const usMatch = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (usMatch) {
    const month = parseMonthName(usMatch[1]);
    if (month) {
      const day = parseInt(usMatch[2], 10);
      const year = parseInt(usMatch[3], 10);
      return formatIsoDate(year, month, day);
    }
  }
  
  // European format: 14 October 2024 or 14. Oktober 2024
  const euMatch = cleaned.match(/^(\d{1,2})\.?\s+(\w+)\s+(\d{4})$/);
  if (euMatch) {
    const month = parseMonthName(euMatch[2]);
    if (month) {
      const day = parseInt(euMatch[1], 10);
      const year = parseInt(euMatch[3], 10);
      return formatIsoDate(year, month, day);
    }
  }
  
  // Spanish format: 14 de octubre de 2024
  const esMatch = cleaned.match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/i);
  if (esMatch) {
    const month = parseMonthName(esMatch[2]);
    if (month) {
      const day = parseInt(esMatch[1], 10);
      const year = parseInt(esMatch[3], 10);
      return formatIsoDate(year, month, day);
    }
  }
  
  // Japanese format: 2024年10月14日
  const jaMatch = cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (jaMatch) {
    const year = parseInt(jaMatch[1], 10);
    const month = parseInt(jaMatch[2], 10);
    const day = parseInt(jaMatch[3], 10);
    return formatIsoDate(year, month, day);
  }
  
  // Numeric formats: DD/MM/YYYY or MM/DD/YYYY (ambiguous, assume DD/MM for non-US)
  const numericMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numericMatch) {
    // Assume DD/MM/YYYY (European)
    const day = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10);
    const year = parseInt(numericMatch[3], 10);
    if (month <= 12 && day <= 31) {
      return formatIsoDate(year, month, day);
    }
  }
  
  // Try native Date parsing as fallback
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return formatIsoDate(
      parsed.getFullYear(),
      parsed.getMonth() + 1,
      parsed.getDate()
    );
  }
  
  return null;
}

/**
 * Format year, month, day as ISO date string.
 */
function formatIsoDate(year: number, month: number, day: number): string {
  const m = month.toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Convert a Date object to ISO date string.
 */
export function dateToIsoString(date: Date | null): string {
  if (!date || isNaN(date.getTime())) {
    return '';
  }
  return formatIsoDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
}

/**
 * Parse a date string and return a Date object.
 */
export function parseDate(dateStr: string): Date | null {
  const iso = normalizeDateString(dateStr);
  if (!iso) return null;
  
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
