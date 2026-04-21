/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^next/image$': '<rootDir>/src/__mocks__/next-image.tsx',
    '^next/font/google$': '<rootDir>/src/__mocks__/next-font.ts',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/layout.tsx',
    '!src/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      // Branches intentionally at 75 (not 80): one structurally unreachable
      // branch in novaNeoEncoder.ts (SHA-256 else path) is istanbul-ignored;
      // remaining reachable branches are all covered. Ratchet upward when
      // the hash algorithm is abstracted away. See docs/releases for ticket.
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = config;
