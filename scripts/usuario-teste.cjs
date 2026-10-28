// Mostra os usuários e a configuração fiscal do banco de testes do npm start e cria/atualiza um login nele.
// Nunca mexe no banco oficial (database.db).
// Rode com: npx electron scripts/usuario-teste.cjs LOGIN SENHA
// Sem LOGIN e SENHA, só lista os usuários.

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

// Mesma pasta que o app usa (main.cjs): %APPDATA%\gestordesk
const pastaDados = path.join(app.getPath('appData'), 'gestordesk')
const bancoOficial = path.join(pastaDados, 'database.db')
const bancoTeste = path.join(pastaDados, 'database-teste.db')

console.log(`Pasta de dados: ${pastaDados}`)
console.log(`Banco oficial (não é alterado): ${fs.existsSync(bancoOficial) ? 'existe' : 'não existe'}`)
if (!fs.existsSync(bancoTeste) && fs.existsSync(bancoOficial)) {
  fs.mkdirSync(pastaDados, { recursive: true })
  fs.copyFileSync(bancoOficial, bancoTeste)
  console.log('Cópia de testes criada a partir do banco oficial.')
}
console.log(`Banco de testes: ${bancoTeste}`)

process.env.GESTORDESK_DB_PATH = bancoTeste
process.env.GESTORDESK_SYNC_DESATIVADO = '1'
const { db } = require(path.join(__dirname, '..', 'electron', 'database.js'))

const [login, senha] = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'))
if (login && senha) {
  const existente = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(login.trim())
  if (existente) {
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(senha, existente.id)
    console.log(`Senha do usuário "${login.trim()}" atualizada.`)
  } else {
    db.prepare('INSERT INTO usuarios (login, senha) VALUES (?, ?)').run(login.trim(), senha)
    console.log(`Usuário "${login.trim()}" criado.`)
  }
}

const usuarios = db.prepare('SELECT login FROM usuarios ORDER BY id').all()
console.log(`Usuários no banco de testes: ${usuarios.map((u) => u.login).join(', ') || '(nenhum)'}`)
const fiscal = Object.fromEntries(
  db
    .prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'fiscal_%'")
    .all()
    .map((r) => [r.chave, r.valor]),
)
const preenchido = (chave) => (fiscal[chave] ? 'preenchido' : 'vazio')
console.log('Configuração fiscal gravada no banco de testes:')
console.log(`  Emitir NFC-e: ${fiscal.fiscal_emitir_nfce === '1' ? 'ligado' : 'desligado'}`)
console.log(`  Ambiente: ${fiscal.fiscal_ambiente === '1' ? 'produção' : 'homologação'}`)
console.log(`  CNPJ: ${fiscal.fiscal_cnpj || 'vazio'}`)
console.log(`  Token de homologação: ${preenchido('fiscal_focus_token_homologacao')}`)
db.close()
app.exit(0)
