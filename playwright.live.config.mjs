import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Dedicated live reporting: ordinary browser regressions never run live RPC tests.
export default defineConfig({
  ...base,
  testMatch: '**/live.spec.mjs',
  reporter: process.argv.includes('--list') ? [['list']] : [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }],
    ['./test/live-reporter.mjs'],
  ],
});
