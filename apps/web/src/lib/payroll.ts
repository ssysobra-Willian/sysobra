/**
 * Utilitários de cálculo de folha — espelho frontend
 *
 * INSS:  Portaria MPS nº 1.367/2024 (vigente jan/2025)
 * IRRF:  Lei 14.848/2024
 *          2025 → isenção até R$ 3.036,00
 *          2026 → isenção até R$ 5.000,00 (vigente jan/2026)
 */

// ─── INSS 2025 ────────────────────────────────────────────────────────────────

const TETO_INSS = 8157.41

const FAIXAS_INSS = [
  { limite: 1518.00, aliquota: 0.075 },
  { limite: 2793.88, aliquota: 0.09  },
  { limite: 4190.83, aliquota: 0.12  },
  { limite: 8157.41, aliquota: 0.14  },
]

export function calcularINSS(salarioBruto: number): number {
  const base = Math.min(salarioBruto, TETO_INSS)
  let inss = 0
  let anterior = 0
  for (const f of FAIXAS_INSS) {
    if (base <= anterior) break
    inss += (Math.min(base, f.limite) - anterior) * f.aliquota
    anterior = f.limite
  }
  return Math.round(inss * 100) / 100
}

// ─── IRRF ─────────────────────────────────────────────────────────────────────

const DEDUCAO_DEPENDENTE = 189.59

const FAIXAS_IRRF_2025 = [
  { limite: 3036.00,  aliquota: 0,     deducao: 0       },
  { limite: 6000.00,  aliquota: 0.075, deducao: 227.70  },
  { limite: 9000.00,  aliquota: 0.15,  deducao: 677.70  },
  { limite: 12000.00, aliquota: 0.225, deducao: 1352.70 },
  { limite: Infinity, aliquota: 0.275, deducao: 1952.70 },
]

const FAIXAS_IRRF_2026 = [
  { limite: 5000.00,  aliquota: 0,     deducao: 0       },
  { limite: 6533.94,  aliquota: 0.075, deducao: 375.00  },
  { limite: 8045.02,  aliquota: 0.15,  deducao: 864.55  },
  { limite: 10302.02, aliquota: 0.225, deducao: 1468.43 },
  { limite: Infinity, aliquota: 0.275, deducao: 1983.43 },
]

export function calcularIRRF(baseCalculo: number, dependentes = 0, ano?: number): number {
  const year   = ano ?? new Date().getFullYear()
  const faixas = year >= 2026 ? FAIXAS_IRRF_2026 : FAIXAS_IRRF_2025
  const base   = baseCalculo - dependentes * DEDUCAO_DEPENDENTE
  if (base <= 0) return 0
  for (const f of faixas) {
    if (base <= f.limite) {
      return Math.max(0, Math.round((base * f.aliquota - f.deducao) * 100) / 100)
    }
  }
  return 0
}

export function isencaoIRRF(ano?: number): number {
  return (ano ?? new Date().getFullYear()) >= 2026 ? 5000 : 3036
}

// ─── Labels das tabelas (para exibir na UI) ───────────────────────────────────

export function labelTabelaIRRF(ano?: number): string {
  const year = ano ?? new Date().getFullYear()
  return year >= 2026
    ? `Tabela IRRF 2026 — isenção até R$ 5.000,00 (Lei 14.848/2024)`
    : `Tabela IRRF 2025 — isenção até R$ 3.036,00`
}

export const labelTabelaINSS = 'Tabela INSS 2025 (Portaria MPS nº 1.367/2024)'

// ─── Faixas legíveis para tooltip/legenda ─────────────────────────────────────

export const INSS_INFO = [
  'até R$ 1.518,00: 7,5%',
  'até R$ 2.793,88: 9%',
  'até R$ 4.190,83: 12%',
  'até R$ 8.157,41: 14%',
  'Teto: R$ 8.157,41',
]

export function IRRF_INFO(ano?: number): string[] {
  const year = ano ?? new Date().getFullYear()
  if (year >= 2026) return [
    'Isento até R$ 5.000,00',
    'até R$ 6.533,94: 7,5%',
    'até R$ 8.045,02: 15%',
    'até R$ 10.302,02: 22,5%',
    'acima: 27,5%',
    'Dedução/dep.: R$ 189,59',
  ]
  return [
    'Isento até R$ 3.036,00',
    'até R$ 6.000,00: 7,5%',
    'até R$ 9.000,00: 15%',
    'até R$ 12.000,00: 22,5%',
    'acima: 27,5%',
    'Dedução/dep.: R$ 189,59',
  ]
}
