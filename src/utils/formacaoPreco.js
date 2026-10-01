export const FORMACAO_PADRAO = {
  faturamento_medio: 14064.9,
  despesas_fixas_mensais: 3572.43,
  imposto: 4,
  investimento: 10,
  lucro: 10,
  usar_folga: false,
}

export const MULTIPLICADOR_FOLGA = 2.2

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN
  const texto = String(valor ?? '').trim().replace(',', '.')
  if (!texto) return NaN
  const n = parseFloat(texto)
  return Number.isFinite(n) ? n : NaN
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100
}

/** Preço de venda no valor mais próximo terminado em ,00 ou ,50. Empate sobe. */
export function arredondarPrecoVenda(valor) {
  const n = numero(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  const centavos = Math.round(n * 100)
  return (Math.round(centavos / 50) * 50) / 100
}

export function formatarCampo(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace('.', ',')
}

export function camposDeFormacao(dados) {
  return {
    faturamento_medio: formatarCampo(dados?.faturamento_medio),
    despesas_fixas_mensais: formatarCampo(dados?.despesas_fixas_mensais),
    imposto: formatarCampo(dados?.imposto),
    investimento: formatarCampo(dados?.investimento),
    lucro: formatarCampo(dados?.lucro),
    usar_folga: Boolean(dados?.usar_folga),
  }
}

export function calcularFormacao(config) {
  const faturamento = numero(config?.faturamento_medio)
  const despesas = numero(config?.despesas_fixas_mensais)
  const imposto = numero(config?.imposto)
  const investimento = numero(config?.investimento)
  const lucro = numero(config?.lucro)
  const usarFolga = Boolean(config?.usar_folga)

  if (!(faturamento > 0) || !Number.isFinite(despesas) || despesas < 0) {
    return { ok: false, motivo: 'incompleto' }
  }
  if ([imposto, investimento, lucro].some((n) => !Number.isFinite(n) || n < 0)) {
    return { ok: false, motivo: 'incompleto' }
  }

  const custosPct = (despesas / faturamento) * 100
  const soma = imposto + custosPct + investimento + lucro
  if (!(soma < 100)) {
    return { ok: false, motivo: 'soma', custosPct, soma, imposto, investimento, lucro }
  }

  const cmvPct = 100 - soma
  const multiplicadorCalculado = 100 / cmvPct
  const multiplicador = usarFolga ? MULTIPLICADOR_FOLGA : multiplicadorCalculado

  return {
    ok: true,
    custosPct,
    cmvPct,
    imposto,
    investimento,
    lucro,
    soma,
    multiplicadorCalculado,
    multiplicador,
    usarFolga,
    abaixoDeDois: multiplicadorCalculado < 2,
  }
}

export function precoSugerido(custo, multiplicador) {
  const custoNum = numero(custo)
  const mult = numero(multiplicador)
  if (!Number.isFinite(custoNum) || custoNum < 0 || !(mult > 0)) return null
  return arredondarPrecoVenda(custoNum * mult)
}

export function composicaoEmReais(custo, preco, calc) {
  if (!calc?.ok || preco == null || custo == null) return null
  const imposto = arredondar((preco * calc.imposto) / 100)
  const custos = arredondar((preco * calc.custosPct) / 100)
  const investimento = arredondar((preco * calc.investimento) / 100)
  const lucro = arredondar((preco * calc.lucro) / 100)
  const folga = arredondar(preco - custo - imposto - custos - investimento - lucro)
  return { custo, preco, imposto, custos, investimento, lucro, folga }
}

export function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarPercentual(valor) {
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function formatarMultiplicador(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
