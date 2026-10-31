-- Notas de entrada (XML de NF-e de fornecedores) sincronizadas entre os PCs.
-- Rodar uma vez no SQL Editor do Supabase.

create table if not exists public.notas_entrada (
  id bigint primary key,
  chave text not null,
  modelo text,
  serie text,
  numero text,
  data_emissao text,
  natureza_operacao text,
  cfop text,
  tipo text not null,
  emitente_cpf_cnpj text,
  emitente_nome text,
  artesao_id bigint,
  valor_total double precision not null default 0,
  movimentou_estoque integer not null default 0,
  xml text not null,
  acerto_inicio text,
  acerto_fim text,
  created_at text,
  deleted_at text
);

create index if not exists notas_entrada_chave_idx on public.notas_entrada (chave);

create table if not exists public.notas_entrada_itens (
  id bigint primary key,
  nota_id bigint not null,
  numero_item integer,
  codigo text,
  descricao text,
  ncm text,
  cest text,
  cfop text,
  unidade text,
  quantidade double precision not null default 0,
  valor_unitario double precision not null default 0,
  valor_total double precision not null default 0,
  produto_id bigint,
  quantidade_estoque integer not null default 0,
  deleted_at text
);

create index if not exists notas_entrada_itens_nota_id_idx on public.notas_entrada_itens (nota_id);

alter table public.notas_entrada enable row level security;
alter table public.notas_entrada_itens enable row level security;

drop policy if exists "notas_entrada autenticados" on public.notas_entrada;
create policy "notas_entrada autenticados" on public.notas_entrada
  for all to authenticated using (true) with check (true);

drop policy if exists "notas_entrada_itens autenticados" on public.notas_entrada_itens;
create policy "notas_entrada_itens autenticados" on public.notas_entrada_itens
  for all to authenticated using (true) with check (true);
