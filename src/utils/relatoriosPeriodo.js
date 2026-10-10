export const TZ_BRASILIA = 'America/Sao_Paulo'

export const RELATORIO_MODO_INICIO_MES = 'inicio_mes'
export const RELATORIO_MODO_DIAS_ATRAS = 'dias_atras'
export const RELATORIO_MODO_MES_ANTERIOR = 'mes_anterior'

export const RELATORIOS_ABAS_PERIODO = [
  { id: 'geral', label: 'Vendas Geral' },
  { id: 'artesao', label: 'Por Fornecedor' },
  { id: 'lucro', label: 'Lucro' },
  { id: 'mais_vendidos', label: 'Mais Vendidos' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'valor', label: 'Valor' },
]

const ABAS_IDS = new Set(RELATORIOS_ABAS_PERIODO.map((a) => a.id))

export const RELATORIO_MODO_OPCOES = [
  { value: RELATORIO_MODO_MES_ANTERIOR, label: 'Um mês calendário atrás (padrão atual)' },
  { value: RELATORIO_MODO_INICIO_MES, label: 'Início do mês atual' },
  { value: RELATORIO_MODO_DIAS_ATRAS, label: 'X dias atrás' },
]

function itemPeriodoPadrao() {
  return { modo: RELATORIO_MODO_MES_ANTERIOR, dias: 30 }
}

export function criarRelatoriosPeriodoPadrao() {
  return Object.fromEntries(RELATORIOS_ABAS_PERIODO.map((a) => [a.id, itemPeriodoPadrao()]))
}

function normalizarModo(modo) {
  if (
    modo === RELATORIO_MODO_INICIO_MES ||
    modo === RELATORIO_MODO_DIAS_ATRAS ||
    modo === RELATORIO_MODO_MES_ANTERIOR
  ) {
    return modo
  }
  return RELATORIO_MODO_MES_ANTERIOR
}

function normalizarDias(dias) {
  const n = parseInt(String(dias ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return 30
  return Math.min(n, 3660)
}

/** Mescla payload salvo com defaults por aba. */
export function normalizarRelatoriosPeriodoPadrao(raw) {
  const base = criarRelatoriosPeriodoPadrao()
  if (!raw || typeof raw !== 'object') return base
  for (const id of ABAS_IDS) {
    const item = raw[id]
    if (!item || typeof item !== 'object') continue
    base[id] = {
      modo: normalizarModo(item.modo),
      dias: normalizarDias(item.dias),
    }
  }
  return base
}

export function hojeISOBrasilia() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

export function calcularDataInicioPeriodoRelatorio(modo, dias, hojeStr = hojeISOBrasilia()) {
  const modoNorm = normalizarModo(modo)
  if (modoNorm === RELATORIO_MODO_INICIO_MES) {
    return `${hojeStr.slice(0, 8)}01`
  }
  if (modoNorm === RELATORIO_MODO_DIAS_ATRAS) {
    const d = new Date(`${hojeStr}T12:00:00`)
    d.setDate(d.getDate() - normalizarDias(dias))
    return d.toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
  }
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

export function calcularPeriodoPadraoRelatorio(abaId, config, hojeStr = hojeISOBrasilia()) {
  const mapa = normalizarRelatoriosPeriodoPadrao(config)
  const item = mapa[abaId] ?? mapa.geral ?? itemPeriodoPadrao()
  return {
    dataInicio: calcularDataInicioPeriodoRelatorio(item.modo, item.dias, hojeStr),
    dataFim: hojeStr,
  }
}
