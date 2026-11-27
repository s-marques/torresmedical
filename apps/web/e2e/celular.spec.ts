import { expect, test, type Page } from '@playwright/test';
import { simularApi } from './api-falsa';
import { FIXTURES, ID_AMOSTRA } from './fixtures';

/** Telas essenciais para o celular (issue #161): título (h1) e rota. */
const TELAS = [
  ['Dashboard', '/'],
  ['Agenda', '/agenda'],
  ['Recepção', '/recepcao'],
  ['Atendimento Médico', '/atendimento-medico'],
  ['Pacientes', '/clientes'],
  ['Contas a Pagar', '/pagar'],
  ['Contas a Receber', '/receber'],
  ['Negócios', '/negocios'],
  ['Atividades', '/atividades'],
] as const;

/** Ação principal que abre um formulário (modal): título, rota e nome do botão. */
const FORMULARIOS = [
  ['Agenda', '/agenda', /Novo Agendamento/],
  ['Negócios', '/negocios', /Novo Negócio/],
  ['Atividades', '/atividades', /Nova Atividade/],
  ['Contas a Pagar', '/pagar', /Nova Conta/],
  ['Contas a Receber', '/receber', /Nova Conta/],
] as const;

const LARGURAS = [360, 414];

for (const largura of LARGURAS) {
  test.describe(`celular ${largura}px`, () => {
    test.use({ viewport: { width: largura, height: 800 }, hasTouch: true, isMobile: true });

    test('Login sem rolagem horizontal', async ({ page }) => {
      await simularApi(page, { anonimo: true });
      await page.goto('/login');
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      expect(await excessoHorizontal(page)).toEqual([]);
    });

    for (const [titulo, rota] of TELAS) {
      test(`${titulo} sem rolagem horizontal`, async ({ page }) => {
        await simularApi(page, { fixtures: FIXTURES });
        await page.goto(rota);
        // O título confirma que a tela abriu (e não o "Página não encontrada" nem o erro).
        await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await excessoHorizontal(page)).toEqual([]);
        expect(await botoesPrincipaisPequenos(page)).toEqual([]);
      });
    }

    test('Atendimento Médico: detalhe e abas sem rolagem horizontal', async ({ page }) => {
      await simularApi(page, { fixtures: FIXTURES });
      await page.goto(`/atendimento-medico?agendamento=${ID_AMOSTRA}`);
      const abas = page.getByRole('tab');
      await expect(abas.first()).toBeVisible();
      for (let i = 0; i < (await abas.count()); i++) {
        await abas.nth(i).click();
        await page.waitForLoadState('networkidle');
        expect(await excessoHorizontal(page), `aba ${i}`).toEqual([]);
      }
    });

    test('Dashboard: abas sem rolagem horizontal da página', async ({ page }) => {
      await simularApi(page, { fixtures: FIXTURES });
      await page.goto('/');
      const abas = page.getByRole('tab');
      await expect(abas.first()).toBeVisible();
      for (let i = 0; i < (await abas.count()); i++) {
        await abas.nth(i).click();
        await page.waitForLoadState('networkidle');
        expect(await excessoHorizontal(page), `aba ${i}`).toEqual([]);
      }
    });

    for (const [titulo, rota, botao] of FORMULARIOS) {
      test(`${titulo}: formulário principal cabe na tela`, async ({ page }) => {
        await simularApi(page, { fixtures: FIXTURES });
        await page.goto(rota);
        await page.getByRole('button', { name: botao }).first().click();
        const dialogo = page.getByRole('dialog');
        await expect(dialogo).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await excessoHorizontal(page)).toEqual([]);
        const caixa = (await dialogo.boundingBox())!;
        expect(caixa.x).toBeGreaterThanOrEqual(0);
        expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);
      });
    }

    test('Pacientes: detalhe do paciente sem rolagem horizontal', async ({ page }) => {
      await simularApi(page, { fixtures: FIXTURES });
      await page.goto('/clientes');
      // No celular a listagem vira cartões: abrir o primeiro mostra o detalhe do paciente.
      await page
        .locator('main ul > li')
        .first()
        .click({ position: { x: 20, y: 20 } });
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await excessoHorizontal(page)).toEqual([]);
      const dialogo = await page.getByRole('dialog').boundingBox();
      expect(dialogo!.x).toBeGreaterThanOrEqual(0);
      expect(dialogo!.x + dialogo!.width).toBeLessThanOrEqual(largura);
    });
  });
}

/** Botões de ação principal (preenchidos) com menos de 40 px de altura: difíceis de tocar. */
async function botoesPrincipaisPequenos(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="button"][data-variant="default"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height < 40;
      })
      .map(
        (el) =>
          `${(el.textContent ?? '').trim()} (${Math.round(el.getBoundingClientRect().height)}px)`,
      ),
  );
}

/** Elementos que passam da largura da janela; vazio quando a página não rola na horizontal. */
async function excessoHorizontal(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= largura) return [];
    const culpados: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > largura + 1) {
        const classe = String(el.getAttribute('class')).slice(0, 60);
        culpados.push(`${el.tagName.toLowerCase()}.${classe} (${Math.round(r.right)}px)`);
      }
    }
    return [
      `scrollWidth=${document.documentElement.scrollWidth} > ${largura}`,
      ...culpados.slice(0, 8),
    ];
  });
}
