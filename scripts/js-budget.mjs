// Decimal MB, matching the previous decimal 500 KB budget. Count all shipped JS.
export const JS_BUDGET_BYTES = 2_000_000;
export function assertJavaScriptBudget(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid JavaScript byte count');
  if (bytes > JS_BUDGET_BYTES) throw new Error(`JS gzip budget exceeded: ${bytes} bytes`);
}
