import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: ['--window-size=1280,720'],
          },
        },
      ],
      viewport: { width: 1280, height: 720 },
    },
  },
});
