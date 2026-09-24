module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'js', 'json'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$', // Ejecutar solo archivos .spec.ts
    transform: {
      '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    collectCoverage: true, // Opcional: Muestra cobertura de código
    coverageDirectory: './coverage',
    // CR-002: 100% sobre las reglas de negocio de Presentacion.
    // Justificación en docs/CR-002-presentacion.md
    coverageThreshold: {
      './src/modules/gestion-productos/producto/domain/value-objects/presentacion.vo.ts': {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  };
  