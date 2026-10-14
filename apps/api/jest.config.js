/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/prisma'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    // CommonJS no Jest: o client do Prisma 7 usa import() dinâmico, que o Jest só
    // suporta com --experimental-vm-modules. Assim o import() vira require().
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node10' } }],
  },
  // O client gerado do Prisma importa "./x.js" apontando para "./x.ts".
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/generated/**'],
  coverageDirectory: 'coverage',
  // Caminhos relativos à raiz do repo, como o Sonar espera.
  coverageReporters: ['text-summary', ['lcov', { projectRoot: '../..' }]],
  testEnvironment: 'node',
};
