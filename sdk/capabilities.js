export const ACTION_REASONS = Object.freeze({
  paused: 'Core is paused.',
  mergesClosed: 'Merges are closed.',
  mismatch: 'Identity mismatch. Stopped.',
  unsettled: 'Next round is not settled.',
  unavailable: 'Action unavailable in this deployment.',
});
export const blocked = (reasonCode, details = {}) => ({ok:false,reasonCode,reason:ACTION_REASONS[reasonCode],...details});
