// Bound malformed/extreme headers without turning a bad value into indefinite downtime.
export function retryAfterMs(header, timestamp = Date.now()) {
  const value = header?.trim();
  const seconds = value ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds : value ? (Date.parse(value) - timestamp) / 1000 : NaN;
  return (Number.isFinite(delay) && delay > 0 && delay <= 300 ? delay : 30) * 1000;
}
