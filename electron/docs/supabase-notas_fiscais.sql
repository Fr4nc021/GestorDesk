-- Cupons fiscais (NFC-e/NF-e) sincronizados entre os PCs.
-- Rodar uma vez no SQL Editor do Supabase.
-- xml, requisicao e resposta ficam só no PC que emitiu.

create table if not exists public.notas_fiscais (
  id bigint primary key,
  venda_id bigint,
  devolucao_id bigint,
  devolucao_cliente_id bigint,
  modelo text not null default '65',
  ref text not null unique,
  ambiente text not null,
  status text not null,
  numero text,
  serie text,
  chave text,
  protocolo text,
  mensagem text,
  valor_total double precision not null default 0,
  url_qrcode text,
  caminho_danfe text,
  caminho_xml text,
  cancelada_em text,
  justificativa_cancelamento text,
  autorizada_em text,
  created_at text,
  updated_at text,
  deleted_at text
);

create index if not exists notas_fiscais_venda_id_idx on public.notas_fiscais (venda_id);

alter table public.notas_fiscais enable row level security;

drop policy if exists "notas_fiscais autenticados" on public.notas_fiscais;
create policy "notas_fiscais autenticados" on public.notas_fiscais
  for all to authenticated using (true) with check (true);

-- Para quem já criou a tabela antes da 2.2.4:
alter table public.notas_fiscais add column if not exists caminho_danfe text;
alter table public.notas_fiscais add column if not exists caminho_xml text;
