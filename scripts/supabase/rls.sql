-- RLS básico (modo "1 empresa / 1 usuário") para permitir sync com SUPABASE_ANON_KEY + Auth.
-- Você deve:
-- 1) Criar um usuário no Supabase Auth (email/senha) que o app vai usar.
-- 2) Rodar este SQL no Supabase (SQL Editor).
--
-- Observação:
-- - Estas políticas liberam acesso a QUALQUER usuário autenticado do projeto.
-- - Para multi-empresa / multi-usuário com separação de dados, é melhor adicionar tenant_id e políticas por tenant.

-- Ativar RLS e criar políticas para tabelas sincronizadas
do $$
declare
  t text;
  tabelas text[] := array[
    'usuarios',
    'artesoes',
    'tipos_variacao',
    'variacao_valores',
    'produtos',
    'vendas',
    'vendas_itens',
    'vendas_pagamentos',
    'movimentacoes_estoque',
    'movimentacoes_caixa'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table if exists public.%I enable row level security;', t);

    execute format($f$
      drop policy if exists "auth_select" on public.%I;
      create policy "auth_select" on public.%I
      for select to authenticated
      using (true);
    $f$, t, t);

    execute format($f$
      drop policy if exists "auth_insert" on public.%I;
      create policy "auth_insert" on public.%I
      for insert to authenticated
      with check (true);
    $f$, t, t);

    execute format($f$
      drop policy if exists "auth_update" on public.%I;
      create policy "auth_update" on public.%I
      for update to authenticated
      using (true)
      with check (true);
    $f$, t, t);

    execute format($f$
      drop policy if exists "auth_delete" on public.%I;
      create policy "auth_delete" on public.%I
      for delete to authenticated
      using (true);
    $f$, t, t);
  end loop;
end $$;

