/**
 * sync-tool-balances.ts
 *
 * Corrige ferramentas com StockItem.quantity > 0 mas StockBalance = 0
 * no Depósito Central. Ocorre quando a devolução não restaurou o saldo.
 *
 * Uso: npx tsx src/scripts/sync-tool-balances.ts
 */

import { prisma } from '@sysobra/database'

async function main() {
  const p = prisma as any

  const tools = await p.stockItem.findMany({
    where: { requiresCustody: true, isActive: true, quantity: { gt: 0 } },
    include: { stockBalances: true },
  })

  console.log(`\nFerramentas com qty > 0: ${tools.length}\n`)
  let fixed = 0

  for (const tool of tools) {
    const totalBalance = tool.stockBalances.reduce(
      (s: number, b: any) => s + Number(b.quantity), 0,
    )
    if (totalBalance > 0) continue // já OK

    // Saldo é 0 mas StockItem.quantity > 0 — corrigir
    const central = await p.stockLocation.findFirst({
      where: { companyId: tool.companyId, type: 'CENTRAL', isActive: true },
    })
    if (!central) continue

    const existing = await p.stockBalance.findFirst({
      where: { itemId: tool.id, locationId: central.id },
    })
    const qty      = Number(tool.quantity)
    const avgCost  = Number(tool.averageCost ?? tool.unitCost ?? 0)
    const totVal   = qty * avgCost

    if (existing) {
      await p.stockBalance.update({
        where: { id: existing.id },
        data:  { quantity: qty, totalValue: totVal },
      })
    } else {
      await p.stockBalance.create({
        data: {
          companyId:   tool.companyId,
          itemId:      tool.id,
          locationId:  central.id,
          quantity:    qty,
          averageCost: avgCost,
          totalValue:  totVal,
        },
      })
    }

    console.log(
      `  ✅ ${tool.name} | qty: ${qty}` +
      ` | balance anterior: ${totalBalance} → ${qty}`,
    )
    fixed++
  }

  console.log(`\nTotal corrigido: ${fixed}\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => (prisma as any).$disconnect())
