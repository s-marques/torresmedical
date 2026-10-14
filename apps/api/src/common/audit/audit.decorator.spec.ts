import { AUDIT_METADATA, Audit, resolveAuditAction } from './audit.decorator';

describe('resolveAuditAction', () => {
  it.each([
    ['POST', 'CREATE'],
    ['put', 'UPDATE'],
    ['PATCH', 'UPDATE'],
    ['DELETE', 'DELETE'],
  ])('deduz a ação de %s', (method, action) => {
    expect(resolveAuditAction(method)).toBe(action);
  });

  it('usa a ação explícita quando informada', () => {
    expect(resolveAuditAction('GET', 'EXPORT')).toBe('EXPORT');
    expect(resolveAuditAction('POST', 'UPDATE')).toBe('UPDATE');
  });

  it('exige ação explícita em métodos sem escrita', () => {
    expect(() => resolveAuditAction('GET')).toThrow(/action/);
  });
});

describe('@Audit', () => {
  it('grava as opções nos metadados do handler', () => {
    class Controller {
      @Audit({ entity: 'ContaReceber' })
      criar(): void {}
    }

    expect(Reflect.getMetadata(AUDIT_METADATA, Controller.prototype.criar)).toEqual({
      entity: 'ContaReceber',
    });
  });
});
