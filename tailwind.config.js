// Scoped to the lazy V2 island: no dashboard reset or global palette change.
export default {
  content: ['./src/components/share/**/*.{ts,tsx}'], prefix: 'v2-',
  corePlugins: {preflight: false},
  theme: {extend: {colors: {squeek: {bg:'#07090E',card:'#0D111A',border:'#1E293B',accent:'#00F5D4',secondary:'#7B2CBF',gold:'#FFD166',muted:'#94A3B8'}}}},
};
