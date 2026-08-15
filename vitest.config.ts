import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(.+)@\d+\.\d+\.\d+$/,
        replacement: '$1',
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'src/utils/navigationState.test.ts',
      'src/utils/pageModel.test.ts',
      'src/types/localAi.test.ts',
    ],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
});
