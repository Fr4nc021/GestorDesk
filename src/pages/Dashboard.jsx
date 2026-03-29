import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import pdvIcon from '../assets/icons/pdv.png'
import estoqueIcon from '../assets/icons/estoque.png'
import relatoriosIcon from '../assets/icons/relatorios.png'

const dashboardQuickActions = [
  { to: '/app/pdv', label: 'Vendas', icon: pdvIcon },
  { to: '/app/produtos', label: 'Produtos', icon: estoqueIcon },
  { to: '/app/caixa', label: 'Caixa', icon: relatoriosIcon },
]

const TZ_BRASILIA = 'America/Sao_Paulo'

const SYNC_TOOLBAR_ROW_STYLE = {
  marginBottom: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
}

function formatBRL(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor ?? 0)
}

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

function intervaloMesAnteriorISO(hojeISOString) {
  const d = new Date(`${hojeISOString}T12:00:00`)
  d.setMonth(d.getMonth() - 1)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ultimoDia = new Date(ano, d.getMonth() + 1, 0).getDate()
  const fim = String(ultimoDia).padStart(2, '0')
  return { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${fim}` }
}

function percentualVariacaoVsMesAnterior(resumoAtual, resumoAnterior) {
  if (resumoAtual && resumoAnterior != null && resumoAnterior.totalVendas > 0) {
    return (((resumoAtual.totalVendas - resumoAnterior.totalVendas) / resumoAnterior.totalVendas) * 100).toFixed(1)
  }
  if (resumoAtual && resumoAtual.totalVendas > 0 && (!resumoAnterior || resumoAnterior.totalVendas === 0)) {
    return '100'
  }
  return null
}

const FORMA_PAGAMENTO_LABEL = {
  credito: 'credit',
  debito: 'debit',
  pix: 'pix',
  dinheiro: 'cash',
}

const IconDolar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)
const IconCube = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
  </svg>
)
const IconCarrinho = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
)

export default function Dashboard() {
  const [vendasHoje, setVendasHoje] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [vendasRecentes, setVendasRecentes] = useState([])
  const [resumoMesAtual, setResumoMesAtual] = useState(null)
  const [resumoMesAnterior, setResumoMesAnterior] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const hoje = hojeISO()
        const [totalHoje, listaProdutos, listaVendas] = await Promise.all([
          window.electronAPI.obterTotalVendasHoje(),
          window.electronAPI.listarProdutos(),
          window.electronAPI.listarVendas(),
        ])
        setVendasHoje(totalHoje)
        setProdutos(listaProdutos ?? [])
        setVendasRecentes((listaVendas ?? []).slice(0, 4))

        const inicioMes = `${hoje.slice(0, 8)}01`
        const { inicio, fim } = intervaloMesAnteriorISO(hoje)
        const [resAtual, resAnterior] = await Promise.all([
          window.electronAPI.obterResumoVendasPeriodo(inicioMes, hoje),
          window.electronAPI.obterResumoVendasPeriodo(inicio, fim),
        ])
        setResumoMesAtual(resAtual)
        setResumoMesAnterior(resAnterior)
    } catch (err) {
      console.error('[Dashboard] Erro ao carregar dados iniciais:', err)
    }
  }
    carregar()
  }, [])

  async function handleSyncClick() {
    if (!window.electronAPI?.sincronizarAgora) return
    setSyncStatus('checking')
    setSyncMessage('Verificando conexão com a internet...')
    try {
      const resultado = await window.electronAPI.sincronizarAgora()
      if (!resultado?.success) {
        if (resultado?.error === 'Sem conexão com a internet') {
          setSyncStatus('no-internet')
          setSyncMessage('Sem conexão com a internet.')
        } else {
          setSyncStatus('error')
          setSyncMessage(resultado?.error || 'Erro ao sincronizar.')
        }
        return
      }
      setSyncStatus('ok')
      setSyncMessage('Aplicativo sincronizado!')
    } catch (err) {
      console.error('[Dashboard] Erro na sincronização manual:', err)
      setSyncStatus('error')
      setSyncMessage(err?.message || 'Erro ao sincronizar.')
    }
  }

  const totalProdutosAtivos = produtos.filter(p => (p.estoque ?? 0) > 0).length
  const totalItensEstoque = produtos.reduce((acc, p) => acc + (p.estoque ?? 0), 0)
  const vendasTotais = vendasHoje?.totalVendas ?? 0
  const variacaoPercentual = percentualVariacaoVsMesAnterior(resumoMesAtual, resumoMesAnterior)

  return (
    <div className="dashboard">
      <section className="dashboard-section">
        <h2 className="dashboard-heading">Ações Rápidas</h2>
        <hr className="dashboard-divider" />
        <div style={SYNC_TOOLBAR_ROW_STYLE}>
          <button
            type="button"
            onClick={handleSyncClick}
            className="btn-sync-manual"
            disabled={syncStatus === 'checking'}
          >
            {syncStatus === 'checking' ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
          {syncMessage && (
            <span className="sync-status-text">
              {syncMessage}
            </span>
          )}
        </div>
        <div className="quick-actions">
          {dashboardQuickActions.map(({ to, label, icon }) => (
            <Link key={to} to={to} className="quick-action-card">
              <img src={icon} alt="" className="quick-action-icon" />
              <span className="quick-action-label">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <hr className="dashboard-divider" />
        <h2 className="dashboard-heading">Dashboard</h2>
        <p className="dashboard-subtitle">Visão geral da sua loja hoje.</p>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <span className="dashboard-card-label">Vendas Totais de Hoje</span>
            <span className="dashboard-card-icon"><IconDolar /></span>
            <span className="dashboard-card-value">{formatBRL(vendasTotais)}</span>
            {variacaoPercentual != null && (
              <span className="dashboard-card-sub">
                {Number(variacaoPercentual) >= 0 ? '+' : ''}{variacaoPercentual}% em relação ao mês anterior
              </span>
            )}
          </div>
          <div className="dashboard-card">
            <span className="dashboard-card-label">Produtos Ativos</span>
            <span className="dashboard-card-icon"><IconCube /></span>
            <span className="dashboard-card-value">{totalProdutosAtivos}</span>
            <span className="dashboard-card-sub">{totalItensEstoque} itens em estoque</span>
          </div>
          <div className="dashboard-card">
            <span className="dashboard-card-label">Vendas Hoje</span>
            <span className="dashboard-card-icon"><IconCarrinho /></span>
            <span className="dashboard-card-value">{vendasHoje?.qtdVendas ?? 0}</span>
          </div>
        </div>

        <div className="vendas-recentes-card">
          <h3 className="vendas-recentes-titulo">Vendas Recentes</h3>
          <div className="vendas-recentes-lista">
            {vendasRecentes.length === 0 ? (
              <p className="vendas-recentes-vazio">Nenhuma venda recente.</p>
            ) : (
              vendasRecentes.map((venda) => (
                <div key={venda.id} className="venda-recente-item">
                  <div>
                    <span className="venda-recente-id">Venda #{String(venda.id).padStart(4, '0')}</span>
                    <span className="venda-recente-detalhes">
                      {venda.qtd_itens ?? 0} itens - {FORMA_PAGAMENTO_LABEL[venda.forma_pagamento] ?? venda.forma_pagamento}
                    </span>
                  </div>
                  <span className="venda-recente-valor">{formatBRL(venda.valor_total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
