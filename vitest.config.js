import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest 4 removed `environmentMatchGlobs`. The equivalent is `test.projects`:
// component tests under src/pages/** and src/components/** run in jsdom, everything else in fast node.
export default defineConfig({
  plugins: [react()],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.{test,spec}.{js,jsx}'],
          exclude: ['src/pages/**', 'src/components/**', 'node_modules/**', 'dist/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'pages',
          environment: 'jsdom',
          include: ['src/pages/**/*.{test,spec}.{js,jsx}', 'src/components/**/*.{test,spec}.{js,jsx}'],
        },
      },
    ],
  },
})
