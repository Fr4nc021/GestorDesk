# Sistema de Sincronização com Supabase

## Fluxo de Sincronização

1. **Criação/edição de dados**  
   Ao criar ou alterar um registro (artesão, produto, venda, etc.), o dado é salvo no SQLite local e a coluna `sync_status` é definida como `pending` (ou permanece `pending` em updates).

2. **Timer automático (a cada 5 minutos)**  
   O `syncService` dispara `syncWithSupabase()` a cada 5 minutos. Na primeira execução ao subir o app e depois em intervalo fixo.

3. **Verificação de internet**  
   Antes de qualquer envio, `hasInternetConnection()` testa conectividade (requisição leve a um serviço externo). Sem internet, a sincronização é adiada e registrada no log.

4. **Envio ao Supabase**  
   Para cada tabela (na ordem que respeita as chaves estrangeiras), o serviço:
   - Busca todos os registros com `sync_status = 'pending'`
   - Envia em lote para o Supabase (upsert por `id`)
   - Em caso de sucesso, atualiza no SQLite para `sync_status = 'synced'`

5. **Ao fechar o aplicativo**  
   No evento `before-quit` do Electron, o app chama `syncWithSupabase()` uma vez e só encerra após o término (sucesso ou erro), para tentar enviar o máximo de dados pendentes antes de fechar.

---

## Evitação de Perda de Dados

- **Tudo fica primeiro no banco local**  
  Criações e alterações são sempre persistidas no SQLite. O usuário não depende da internet para trabalhar.

- **Status por registro**  
  Apenas registros com `sync_status = 'pending'` são enviados. Após envio bem-sucedido, passam para `synced`. Se a sincronização falhar, continuam `pending` e serão tentados na próxima execução (timer ou fechamento).

- **Não se marca como synced sem sucesso**  
  Só chamamos `markAsSynced(tabela, ids)` depois do `upsert` sem erro. Falha de rede ou do Supabase não altera o status; os dados permanecem pendentes para nova tentativa.

---

## Falhas de Conexão

- **Sem internet**  
  `hasInternetConnection()` retorna `false`. O serviço não tenta enviar, registra no console e retorna. O timer tentará de novo em 5 minutos.

- **Erro no meio da sincronização**  
  Se uma tabela falhar (ex.: timeout, 5xx do Supabase), o erro é logado e a Promise de `syncWithSupabase()` rejeita. As tabelas já sincronizadas na mesma execução permanecem com `synced`; as que ainda não foram enviadas ou a que falhou continuam `pending` e serão tentadas na próxima rodada.

- **Fechamento com falha**  
  Ao fechar, se `syncWithSupabase()` falhar (rede ou API), o app mesmo assim encerra após a conclusão da Promise. Os pendentes continuam no SQLite com `pending` e serão enviados na próxima abertura (no primeiro timer de 5 min ou no próximo fechamento).

---

## Melhorias Futuras Possíveis

1. **Status `error` e retry com backoff**  
   Adicionar valor `sync_status = 'error'` e guardar mensagem ou código do erro; usar backoff exponencial antes de tentar de novo os mesmos registros.

2. **Fila de sincronização e conflitos**  
   Manter uma fila (por exemplo, tabela `sync_queue`) com operação (insert/update/delete) e timestamp; no servidor, resolver conflitos (last-write-wins ou merge) e sincronização bidirecional.

3. **Sincronização sob demanda na UI**  
   Botão “Sincronizar agora” e indicador de “X pendentes” ou “última sync em…”, usando IPC entre renderer e main.

4. **Timeout e retry por tabela**  
   Timeout por requisição ao Supabase e retry automático (ex.: 2–3 tentativas) antes de marcar erro.

5. **Sync apenas quando houver pendentes**  
   Verificar se existe algum `sync_status = 'pending'` antes de checar internet e chamar a API, para evitar trabalho desnecessário.

6. **Logs persistentes**  
   Escrever logs de sync em arquivo ou tabela local para diagnóstico em produção, além do console.

7. **Sincronização pull (Supabase → local)**  
   Consultar alterações no Supabase (por `updated_at` ou similar) e aplicar no SQLite para ambientes multi-dispositivo.
