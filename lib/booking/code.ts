/**
 * A booking code as a person reads it: `K7MQ3XPT` becomes `K7MQ-3XPT`.
 * Stored without the dash (spec 0015, AC-18).
 */
export function formatBookingCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
