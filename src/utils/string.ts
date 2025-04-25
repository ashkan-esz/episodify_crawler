/**
 * Removes HTML tags from a string
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Truncates a string to a maximum length, adding an ellipsis if truncated
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Normalizes whitespace in a string by removing extra spaces and trimming
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts text content between two delimiters
 */
export function extractBetween(str: string, start: string, end: string): string[] {
  const regex = new RegExp(`${escapeRegExp(start)}(.*?)${escapeRegExp(end)}`, 'g');
  const matches: string[] = [];
  let match;
  
  while ((match = regex.exec(str)) !== null) {
    matches.push(match[1]);
  }
  
  return matches;
}

/**
 * Escapes special characters in a string for use in a regular expression
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/\s+/g, '_');
}

/**
 * Converts a string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');
} 