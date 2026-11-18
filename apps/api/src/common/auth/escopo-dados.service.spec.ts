import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { RequestContextService } from '../context/request-context.service';
import { ApiException } from '../errors/api.exception';
import { escopoDoUsuario } from './escopo-dados';
import { EscopoDadosService } from './escopo-dados.service';

const A = '0b9f6f4e-1d6b-4f2a-9a43-6a0c2b1f8e01';
const B = '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const C = '9e8d7c6b-5a49-4382-b1a0-f9e8d7c6b5a4';

function status403(fn: () => unknown): void {
  try {
    fn();
  } catch (erro) {
    expect(erro).toBeInstanceOf(ApiException);
    expect((erro as ApiException).getStatus()).toBe(403);
    expect((erro as ApiException).getResponse()).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Sem permissão',
    });
    return;
  }
  throw new Error('esperava 403');
}

describe('escopoDoUsuario', () => {
  it('perfil sem restrição (ou sem perfil) vê todos os profissionais', () => {
    expect(escopoDoUsuario('TODOS', [A])).toEqual({ tipo: 'TODOS' });
    expect(escopoDoUsuario(null, [])).toEqual({ tipo: 'TODOS' });
  });

  it('perfil restrito usa os vínculos, sem repetidos', () => {
    expect(escopoDoUsuario('PROFISSIONAIS_VINCULADOS', [B, A, B])).toEqual({
      tipo: 'PROFISSIONAIS',
      profissionalIds: [A, B],
    });
  });

  it('perfil restrito sem vínculo resulta em lista vazia', () => {
    expect(escopoDoUsuario('PROFISSIONAIS_VINCULADOS', [])).toEqual({
      tipo: 'PROFISSIONAIS',
      profissionalIds: [],
    });
  });
});

describe('EscopoDadosService', () => {
  let service: EscopoDadosService;
  let context: RequestContextService;
  let cls: ClsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [RequestContextService, EscopoDadosService],
    }).compile();
    service = moduleRef.get(EscopoDadosService);
    context = moduleRef.get(RequestContextService);
    cls = moduleRef.get(ClsService);
  });

  const comEscopo = (escopo: ReturnType<typeof escopoDoUsuario>, fn: () => void) =>
    cls.run(() => {
      context.setEscopoDados(escopo);
      fn();
    });

  it('fora de uma requisição (filas, rotinas) não restringe', () => {
    expect(service.atual()).toEqual({ tipo: 'TODOS' });
    expect(service.restrito()).toBe(false);
    expect(service.profissionalIds()).toBeNull();
    expect(service.filtroProfissional()).toBeUndefined();
  });

  it('sem restrição: permite tudo e repassa o filtro pedido', async () => {
    await comEscopo(escopoDoUsuario('TODOS', []), () => {
      expect(service.permite(A)).toBe(true);
      expect(service.permite(null)).toBe(true);
      expect(service.filtroProfissional(B)).toBe(B);
      expect(service.filtroProfissional()).toBeUndefined();
      expect(() => service.garantirProfissional(C)).not.toThrow();
    });
  });

  it('restrito: lista só os vinculados e aceita filtro de um deles', async () => {
    await comEscopo(escopoDoUsuario('PROFISSIONAIS_VINCULADOS', [A, B]), () => {
      expect(service.restrito()).toBe(true);
      expect(service.profissionalIds()).toEqual([A, B]);
      expect(service.filtroProfissional()).toEqual({ in: [A, B] });
      expect(service.filtroProfissional(B)).toBe(B);
      expect(service.permite(A)).toBe(true);
    });
  });

  it('restrito: registro ou filtro de outro profissional dá 403', async () => {
    await comEscopo(escopoDoUsuario('PROFISSIONAIS_VINCULADOS', [A]), () => {
      expect(service.permite(C)).toBe(false);
      expect(service.permite(null)).toBe(false);
      status403(() => service.garantirProfissional(C));
      status403(() => service.filtroProfissional(C));
    });
  });

  it('restrito sem vínculo: não enxerga nenhum profissional', async () => {
    await comEscopo(escopoDoUsuario('PROFISSIONAIS_VINCULADOS', []), () => {
      expect(service.filtroProfissional()).toEqual({ in: [] });
      status403(() => service.garantirProfissional(A));
    });
  });
});
