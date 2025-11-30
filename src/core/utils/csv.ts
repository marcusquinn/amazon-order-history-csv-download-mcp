/**
 * CSV generation utilities.
 */

/**
 * Escape a value for CSV format.
 */
export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Convert an array of objects to CSV string.
 */
export function toCSV<T extends Record<string, unknown>>(
  data: T[],
  columns?: (keyof T)[],
  options: {
    includeHeader?: boolean;
    includeBOM?: boolean;
  } = {}
): string {
  const { includeHeader = true, includeBOM = true } = options;
  
  if (data.length === 0) {
    return '';
  }
  
  // Determine columns
  const cols = columns || (Object.keys(data[0]) as (keyof T)[]);
  
  const lines: string[] = [];
  
  // Add BOM for Excel compatibility
  const bom = includeBOM ? '\ufeff' : '';
  
  // Header row
  if (includeHeader) {
    lines.push(cols.map((col) => escapeCSVValue(String(col))).join(','));
  }
  
  // Data rows
  for (const row of data) {
    const values = cols.map((col) => escapeCSVValue(row[col]));
    lines.push(values.join(','));
  }
  
  return bom + lines.join('\n');
}

/**
 * Column definition for CSV export.
 */
export interface CSVColumn<T> {
  key: string;
  header: string;
  getValue: (item: T) => unknown;
}

/**
 * Convert data to CSV using column definitions.
 */
export function toCSVWithColumns<T>(
  data: T[],
  columns: CSVColumn<T>[],
  options: {
    includeBOM?: boolean;
  } = {}
): string {
  const { includeBOM = true } = options;
  
  if (data.length === 0) {
    return '';
  }
  
  const lines: string[] = [];
  
  // Add BOM for Excel compatibility
  const bom = includeBOM ? '\ufeff' : '';
  
  // Header row
  lines.push(columns.map((col) => escapeCSVValue(col.header)).join(','));
  
  // Data rows
  for (const row of data) {
    const values = columns.map((col) => escapeCSVValue(col.getValue(row)));
    lines.push(values.join(','));
  }
  
  return bom + lines.join('\n');
}
