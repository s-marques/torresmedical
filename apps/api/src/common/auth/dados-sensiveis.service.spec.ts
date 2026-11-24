import { dadosSensiveisFalso } from '../../../test/utils/dados-sensiveis-falso';

describe('DadosSensiveisService', () => {
  it('reflete a permissão gravada no contexto', () => {
    expect(dadosSensiveisFalso(true).permitido()).toBe(true);
    expect(dadosSensiveisFalso(false).permitido()).toBe(false);
  });
});
