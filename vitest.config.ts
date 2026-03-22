import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

const alias = {
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src'),
  '@types': resolve('src/renderer/src/types'),
  '@shared': resolve('packages/shared'),
  '@logger': resolve('src/main/services/LoggerService'),
  '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core'),
  '@mcp-trace/trace-node': resolve('packages/mcp-trace/trace-node'),
  '@mcp-trace/trace-web': resolve('packages/mcp-trace/trace-web'),
  '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
  '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
  '@cherrystudio/ai-core': resolve('packages/aiCore/src'),
  '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
  '@cherrystudio/extension-table-plus': resolve('packages/extension-table-plus/src')
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        resolve: {
          alias
        },
        test: {
          name: 'main',
          environment: 'node',
          setupFiles: ['tests/main.setup.ts'],
          include: ['src/main/**/*.{test,spec}.{ts,tsx}', 'src/main/**/__tests__/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        extends: true,
        resolve: {
          alias
        },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['@vitest/web-worker', 'tests/renderer.setup.ts'],
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'src/renderer/**/__tests__/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        extends: true,
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.{test,spec}.{ts,tsx}', 'scripts/**/__tests__/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        extends: true,
        test: {
          name: 'shared',
          environment: 'node',
          include: [
            'packages/shared/**/*.{test,spec}.{ts,tsx}',
            'packages/shared/**/__tests__/**/*.{test,spec}.{ts,tsx}'
          ]
        }
      }
    ],
    globals: true,
    setupFiles: [],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/build/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'text-summary'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/out/**',
        '**/build/**',
        '**/coverage/**',
        '**/tests/**',
        '**/.yarn/**',
        '**/.cursor/**',
        '**/.vscode/**',
        '**/.github/**',
        '**/.husky/**',
        '**/*.d.ts',
        '**/types/**',
        '**/__tests__/**',
        '**/*.{test,spec}.{ts,tsx}',
        '**/*.config.{js,ts}'
      ]
    },
    testTimeout: 20000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  }
})
