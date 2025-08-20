/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset
  testEnvironment: 'node',
  moduleNameMapper: {
    // Handle module aliases if needed, and map .js extensions
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // transform and extensionsToTreatAsEsm are often handled by the preset
  // Optional: Specify test file patterns
  // testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
  // Optional: Specify directories to ignore
  testPathIgnorePatterns: ['/node_modules/', '/dist/'], // Ignore compiled output
  // Optional: Setup files to run before tests
  // setupFilesAfterEnv: ['./jest.setup.ts'],
};
