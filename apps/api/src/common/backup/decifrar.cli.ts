/**
 * Decifra um arquivo de backup (`.enc`) na restauração de desastre (README, "Backup e restauração").
 * Uso: `BACKUP_CRIPTO_CHAVE=... pnpm --filter @torres/api backup:decifrar <entrada.enc> <saida>`.
 */
import { descriptografarArquivo } from './backup-cripto';

async function main(): Promise<void> {
  const [entrada, saida] = process.argv.slice(2);
  const frase = process.env.BACKUP_CRIPTO_CHAVE;
  if (!entrada || !saida || !frase) {
    console.error('Uso: BACKUP_CRIPTO_CHAVE=... backup:decifrar <entrada.enc> <saida>');
    process.exitCode = 1;
    return;
  }
  await descriptografarArquivo(entrada, saida, frase);
  console.log(`Arquivo decifrado em ${saida}`);
}

main().catch(() => {
  // Chave errada ou arquivo adulterado: sem detalhes além do fato.
  console.error('Não foi possível decifrar: confira a frase (BACKUP_CRIPTO_CHAVE) e o arquivo.');
  process.exitCode = 1;
});
