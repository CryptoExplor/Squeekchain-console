// Completed rounds expected at the verified snapshot, never the wall clock or checkpoint lag.
export function settlementStatus(net) {
  const integer = value => /^\d+$/.test(String(value ?? '')) ? BigInt(value) : null;
  const genesis = integer(net?.core?.genesisTimestamp);
  const duration = integer(net?.core?.roundDuration);
  const timestamp = integer(net?.snapshot?.timestamp);
  const settled = integer(net?.core?.settledThroughRound);
  if (genesis == null || duration == null || duration === 0n || timestamp == null || settled == null) {
    return { expectedRound: null, stalled: null };
  }
  const expected = timestamp > genesis ? (timestamp - genesis) / duration : 0n;
  return { expectedRound: String(expected), stalled: expected - settled > 2n };
}
