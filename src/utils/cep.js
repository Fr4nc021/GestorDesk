export function formatarCep(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 8)
  if (digitos.length <= 5) return digitos
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`
}

export async function buscarCep(cep) {
  const digitos = String(cep || '').replace(/\D/g, '')
  if (digitos.length !== 8) return null

  const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
  if (!res.ok) return null

  const data = await res.json()
  if (data.erro) return null

  return {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.localidade || '',
    uf: data.uf || '',
  }
}
