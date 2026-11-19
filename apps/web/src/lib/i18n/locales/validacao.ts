import type { DicionarioValidacao } from '@torres/shared';

/**
 * Mensagens de validação em inglês e espanhol (issue #205). O português vem de
 * `VALIDACAO_PT_BR` (`packages/shared`), que também vale no back.
 */
export const VALIDACAO_EN: DicionarioValidacao = {
  obrigatorio: '{{campo}} is required.',
  obrigatorio_f: '{{campo}} is required.',
  campoMax_one: '{{campo}} must have at most {{count}} character',
  campoMax_other: '{{campo}} must have at most {{count}} characters',
  campoObrigatorio: 'Required field',
  valorInvalido: 'Invalid value',
  opcaoInvalida: 'Invalid option',
  formatoInvalido: 'Invalid format',
  formato: {
    email: 'Invalid e-mail',
    uuid: 'Invalid identifier',
    guid: 'Invalid identifier',
    url: 'Invalid URL',
    datetime: 'Invalid date/time',
    date: 'Invalid date',
    time: 'Invalid time',
  },
  textoMin_one: 'Must have at least {{count}} character',
  textoMin_other: 'Must have at least {{count}} characters',
  textoMax_one: 'Must have at most {{count}} character',
  textoMax_other: 'Must have at most {{count}} characters',
  itensMin_one: 'Must have at least {{count}} item',
  itensMin_other: 'Must have at least {{count}} items',
  itensMax_one: 'Must have at most {{count}} item',
  itensMax_other: 'Must have at most {{count}} items',
  maiorOuIgual: 'Must be greater than or equal to {{valor}}',
  maior: 'Must be greater than {{valor}}',
  menorOuIgual: 'Must be less than or equal to {{valor}}',
  menor: 'Must be less than {{valor}}',
  multiploDe: 'Must be a multiple of {{valor}}',
  campoNaoPermitido: 'Field not allowed',
  camposNaoPermitidos: 'Field not allowed: {{campos}}',
  duplicado: 'A record with this value already exists',
  auth: {
    informeEmail: 'Enter your e-mail',
    informeSenha: 'Enter your password',
    senhaMin: 'The password must have at least {{min}} characters',
    senhaMax: 'The password must have at most {{max}} characters',
    senhaLetrasNumeros: 'The password must contain letters and numbers',
    credenciaisInvalidas: 'Invalid e-mail or password',
    linkInvalido: 'Invalid reset link',
    senhasNaoConferem: 'The passwords do not match',
  },
  periodo: {
    informeDataInicial: 'Enter the start date',
    informeDataFinal: 'Enter the end date',
    dataInicialInvalida: 'Invalid start date',
    dataFinalInvalida: 'Invalid end date',
    invalido: 'The start date must be on or before the end date',
  },
  arquivo: {
    selecione: 'Select a file',
    vazio: 'The file is empty',
    tipoNaoPermitido: 'File type not allowed. Send {{formatos}}',
    tamanhoMax: 'The file must be at most {{tamanho}}',
    ou: 'or',
  },
};

export const VALIDACAO_ES: DicionarioValidacao = {
  obrigatorio: '{{campo}} es obligatorio.',
  obrigatorio_f: '{{campo}} es obligatoria.',
  campoMax_one: '{{campo}} debe tener como máximo {{count}} carácter',
  campoMax_other: '{{campo}} debe tener como máximo {{count}} caracteres',
  campoObrigatorio: 'Campo obligatorio',
  valorInvalido: 'Valor no válido',
  opcaoInvalida: 'Opción no válida',
  formatoInvalido: 'Formato no válido',
  formato: {
    email: 'Correo electrónico no válido',
    uuid: 'Identificador no válido',
    guid: 'Identificador no válido',
    url: 'URL no válida',
    datetime: 'Fecha/hora no válida',
    date: 'Fecha no válida',
    time: 'Hora no válida',
  },
  textoMin_one: 'Debe tener como mínimo {{count}} carácter',
  textoMin_other: 'Debe tener como mínimo {{count}} caracteres',
  textoMax_one: 'Debe tener como máximo {{count}} carácter',
  textoMax_other: 'Debe tener como máximo {{count}} caracteres',
  itensMin_one: 'Debe tener como mínimo {{count}} elemento',
  itensMin_other: 'Debe tener como mínimo {{count}} elementos',
  itensMax_one: 'Debe tener como máximo {{count}} elemento',
  itensMax_other: 'Debe tener como máximo {{count}} elementos',
  maiorOuIgual: 'Debe ser mayor o igual a {{valor}}',
  maior: 'Debe ser mayor que {{valor}}',
  menorOuIgual: 'Debe ser menor o igual a {{valor}}',
  menor: 'Debe ser menor que {{valor}}',
  multiploDe: 'Debe ser múltiplo de {{valor}}',
  campoNaoPermitido: 'Campo no permitido',
  camposNaoPermitidos: 'Campo no permitido: {{campos}}',
  duplicado: 'Ya existe un registro con este valor',
  auth: {
    informeEmail: 'Ingrese el correo electrónico',
    informeSenha: 'Ingrese la contraseña',
    senhaMin: 'La contraseña debe tener como mínimo {{min}} caracteres',
    senhaMax: 'La contraseña debe tener como máximo {{max}} caracteres',
    senhaLetrasNumeros: 'La contraseña debe tener letras y números',
    credenciaisInvalidas: 'Correo electrónico o contraseña no válidos',
    linkInvalido: 'Enlace de restablecimiento no válido',
    senhasNaoConferem: 'Las contraseñas no coinciden',
  },
  periodo: {
    informeDataInicial: 'Ingrese la fecha inicial',
    informeDataFinal: 'Ingrese la fecha final',
    dataInicialInvalida: 'Fecha inicial no válida',
    dataFinalInvalida: 'Fecha final no válida',
    invalido: 'La fecha inicial debe ser anterior o igual a la final',
  },
  arquivo: {
    selecione: 'Seleccione un archivo',
    vazio: 'El archivo está vacío',
    tipoNaoPermitido: 'Tipo de archivo no permitido. Envíe {{formatos}}',
    tamanhoMax: 'El archivo debe tener como máximo {{tamanho}}',
    ou: 'o',
  },
};

/**
 * Erros da API traduzidos pelo `code` (issue #205). Não há versão em português: nele vale a
 * mensagem do servidor. Código sem tradução também cai na mensagem do servidor.
 */
export const ERROS_API_EN: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: 'Invalid data',
  UNAUTHORIZED: 'Not authenticated',
  FORBIDDEN: 'No permission',
  NOT_FOUND: 'Record not found',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  CONFLICT: 'Conflict with the current state of the record',
  DUPLICATE: 'Duplicate record',
  RELATION_CONFLICT: 'The record is in use by other records',
  PAYLOAD_TOO_LARGE: 'Content too large',
  TOO_MANY_REQUESTS: 'Too many requests. Try again in a moment',
  BAD_REQUEST: 'Invalid request',
  INTERNAL_ERROR: 'Internal error. Try again later',
  SESSAO_INVALIDA: 'Session expired. Sign in again',
  CREDENCIAIS_INVALIDAS: 'Invalid e-mail or password',
  LINK_REDEFINICAO_INVALIDO: 'Invalid or expired reset link',
  LINK_INVALIDO: 'Invalid download link',
  LINK_EXPIRADO: 'Download link expired. Generate a new one',
};

export const ERROS_API_ES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: 'Datos no válidos',
  UNAUTHORIZED: 'No autenticado',
  FORBIDDEN: 'Sin permiso',
  NOT_FOUND: 'Registro no encontrado',
  METHOD_NOT_ALLOWED: 'Método no permitido',
  CONFLICT: 'Conflicto con el estado actual del registro',
  DUPLICATE: 'Registro duplicado',
  RELATION_CONFLICT: 'El registro está en uso por otros registros',
  PAYLOAD_TOO_LARGE: 'Contenido demasiado grande',
  TOO_MANY_REQUESTS: 'Demasiadas solicitudes. Inténtelo de nuevo en unos instantes',
  BAD_REQUEST: 'Solicitud no válida',
  INTERNAL_ERROR: 'Error interno. Inténtelo de nuevo más tarde',
  SESSAO_INVALIDA: 'Sesión expirada. Inicie sesión de nuevo',
  CREDENCIAIS_INVALIDAS: 'Correo electrónico o contraseña no válidos',
  LINK_REDEFINICAO_INVALIDO: 'Enlace de restablecimiento no válido o expirado',
  LINK_INVALIDO: 'Enlace de descarga no válido',
  LINK_EXPIRADO: 'Enlace de descarga expirado. Genere uno nuevo',
};

/**
 * Rótulos de campo usados nas mensagens de validação ("Nome é obrigatório."): chave é o rótulo
 * em português, como está no schema. As issues de módulo acrescentam os rótulos das suas telas.
 */
export const ROTULOS_EN: Readonly<Record<string, string>> = {
  Nome: 'Name',
  'E-mail': 'E-mail',
  Telefone: 'Phone',
  Cargo: 'Job title',
  Senha: 'Password',
  Data: 'Date',
  Hora: 'Time',
  Descrição: 'Description',
  Observação: 'Note',
};

export const ROTULOS_ES: Readonly<Record<string, string>> = {
  Nome: 'Nombre',
  'E-mail': 'Correo electrónico',
  Telefone: 'Teléfono',
  Cargo: 'Cargo',
  Senha: 'Contraseña',
  Data: 'Fecha',
  Hora: 'Hora',
  Descrição: 'Descripción',
  Observação: 'Observación',
};
