/**
 * Checks if a value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Checks if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Checks if a value is a valid date
 */
export function isValidDate(date: any): boolean {
  if (date instanceof Date) return !isNaN(date.getTime());
  if (typeof date === 'string' || typeof date === 'number') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
  return false;
}

/**
 * Ensures a value is within a range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
} 