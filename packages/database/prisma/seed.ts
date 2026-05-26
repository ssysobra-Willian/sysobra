/**
 * Seed: popula categorias financeiras padrão do sistema (companyId = null).
 * Execute com: npx ts-node prisma/seed.ts
 * ou via: npx prisma db seed (se configurado no package.json)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_CATEGORIES = [
  // ── DESPESAS ──────────────────────────────────────────────────────────
  { name: 'Material',          type: 'EXPENSE' as const, color: '#F97316', icon: '🧱', order: 1 },
  { name: 'Mão de obra',       type: 'EXPENSE' as const, color: '#3B82F6', icon: '👷', order: 2 },
  { name: 'Serviços',          type: 'EXPENSE' as const, color: '#8B5CF6', icon: '🔧', order: 3 },
  { name: 'Equipamentos',      type: 'EXPENSE' as const, color: '#6B7280', icon: '⚙️',  order: 4 },
  { name: 'Impostos e taxas',  type: 'EXPENSE' as const, color: '#EF4444', icon: '📋', order: 5 },
  { name: 'Frete e transporte',type: 'EXPENSE' as const, color: '#EAB308', icon: '🚚', order: 6 },
  { name: 'Administrativo',    type: 'EXPENSE' as const, color: '#166534', icon: '🗂️',  order: 7 },
  { name: 'Combustível',       type: 'EXPENSE' as const, color: '#22C55E', icon: '⛽', order: 8 },
  { name: 'Manutenção',        type: 'EXPENSE' as const, color: '#92400E', icon: '🔨', order: 9 },
  { name: 'Outros (despesa)',  type: 'EXPENSE' as const, color: '#9CA3AF', icon: '📦', order: 10 },

  // ── RECEITAS ──────────────────────────────────────────────────────────
  { name: 'Receita de obra',   type: 'INCOME'  as const, color: '#16A34A', icon: '🏗️', order: 1 },
  { name: 'Medição recebida',  type: 'INCOME'  as const, color: '#2563EB', icon: '📐', order: 2 },
  { name: 'Receita financeira',type: 'INCOME'  as const, color: '#CA8A04', icon: '💰', order: 3 },
  { name: 'Outras receitas',   type: 'INCOME'  as const, color: '#9CA3AF', icon: '💵', order: 4 },
]

async function main() {
  console.log('🌱 Seed: categorias financeiras padrão...')

  let created = 0
  let skipped = 0

  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.financialCategory.findFirst({
      where: { companyId: null, name: cat.name, type: cat.type },
    })

    if (!existing) {
      await prisma.financialCategory.create({
        data: {
          companyId: null,
          name:      cat.name,
          type:      cat.type,
          color:     cat.color,
          icon:      cat.icon,
          isDefault: true,
          order:     cat.order,
        },
      })
      created++
      console.log(`  ✅ Criada: ${cat.name} (${cat.type})`)
    } else {
      skipped++
    }
  }

  console.log(`\n✅ Seed concluído: ${created} criadas, ${skipped} já existiam.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
