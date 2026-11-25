import { SpawnProcessoRunner } from './postgres-ferramentas';

describe('SpawnProcessoRunner', () => {
  const runner = new SpawnProcessoRunner();

  it('devolve a saída padrão e repassa o ambiente', async () => {
    const saida = await runner.executar(
      process.execPath,
      ['-e', 'process.stdout.write("ola " + process.env.PGPASSWORD)'],
      { PGPASSWORD: 'x' },
    );
    expect(saida).toBe('ola x');
  });

  it('rejeita com o código de saída e sem a saída de erro (pode ter dados)', async () => {
    const erro = await runner
      .executar(process.execPath, ['-e', 'console.error("CPF 123"); process.exit(3)'], {})
      .catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('código 3');
    expect((erro as Error).message).not.toContain('CPF');
  });

  it('rejeita quando o programa não existe', async () => {
    await expect(runner.executar('programa-que-nao-existe-157', [], {})).rejects.toThrow(
      'não foi possível executar',
    );
  });
});
