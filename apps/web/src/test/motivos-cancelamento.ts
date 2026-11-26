import { json } from './render-app';

/** Ids fictícios dos motivos devolvidos por `rotaMotivosCancelamento`. */
export const MOTIVO_ID = '00000000-0000-4000-8000-0000000000d1';
export const MOTIVO_OUTRO_ID = '00000000-0000-4000-8000-0000000000d2';

export const URL_MOTIVOS = '/api/cancelamentos/motivos';

/** Lista de motivos de qualquer tipo: um comum e o "Outro" (que exige a observação). */
export const MOTIVOS_FALSOS = [
  { id: MOTIVO_ID, nome: 'Paciente desistiu', exigeTexto: false },
  { id: MOTIVO_OUTRO_ID, nome: 'Outro', exigeTexto: true },
];

/** Para `apiFalsa({ rotas: { ...rotaMotivosCancelamento } })`. */
export const rotaMotivosCancelamento = {
  [URL_MOTIVOS]: () => json(MOTIVOS_FALSOS),
};
