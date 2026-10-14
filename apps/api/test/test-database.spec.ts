import { resolveTestDatabaseUrl } from './test-database';

const TEST_URL = 'postgresql://u:p@db:5432/torres_test';
const DEV_URL = 'postgresql://u:p@db:5432/torres';

describe('resolveTestDatabaseUrl', () => {
  it('prefere DATABASE_URL_TEST', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: TEST_URL, DATABASE_URL: DEV_URL })).toBe(
      TEST_URL,
    );
  });

  it('usa DATABASE_URL quando é um banco de teste (CI)', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: TEST_URL })).toBe(TEST_URL);
  });

  it('recusa banco que não é de teste', () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: DEV_URL })).toThrow(/_test/);
  });

  it('não define nada sem variáveis de banco', () => {
    expect(resolveTestDatabaseUrl({})).toBeUndefined();
  });
});
