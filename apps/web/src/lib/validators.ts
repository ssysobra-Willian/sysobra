// ─── CPF ─────────────────────────────────────────────────────────────────────

export function validateCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i)
  let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0
  if (r !== parseInt(c[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i)
  r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0
  return r === parseInt(c[10])
}

export function formatCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// ─── CNPJ ─────────────────────────────────────────────────────────────────────

export function validateCNPJ(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (str: string, weights: number[]) =>
    weights.reduce((s, w, i) => s + parseInt(str[i]) * w, 0)
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = 11 - (calc(c, w1) % 11); const r1 = d1 >= 10 ? 0 : d1
  if (r1 !== parseInt(c[12])) return false
  const d2 = 11 - (calc(c, w2) % 11); const r2 = d2 >= 10 ? 0 : d2
  return r2 === parseInt(c[13])
}

export function formatCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

// ─── CPF ou CNPJ detectado automaticamente ────────────────────────────────────

export function maskCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '')
  if (d.length <= 11) return formatCPF(d)
  return formatCNPJ(d)
}

/**
 * Retorna:
 *  - null  → campo vazio (não validar ainda)
 *  - true  → válido
 *  - false → inválido (incompleto ou dígitos errados)
 */
export function validateCpfCnpj(value: string): boolean | null {
  const d = value.replace(/\D/g, '')
  if (d.length === 0) return null
  if (d.length === 11) return validateCPF(d)
  if (d.length === 14) return validateCNPJ(d)
  return false
}

// ─── Telefone ─────────────────────────────────────────────────────────────────

export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

// ─── CEP ──────────────────────────────────────────────────────────────────────

export function formatCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2')
}

// ─── Agência bancária (0000-0) ────────────────────────────────────────────────

export function formatBankAgency(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 5)
  return d.replace(/(\d{4})(\d{1})$/, '$1-$2')
}

// ─── CNO (00.000.000/000-00) ──────────────────────────────────────────────────

export function formatCno(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 12)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{6})(\d)/, '$1/$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
