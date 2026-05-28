/**
 * sync-tool-status.ts
 *
 * Script pontual para sincronizar toolStatus de ferramentas que saíram via
 * romaneio antes do fix em baixarEstoque (que agora define toolStatus=IN_USE).
 *
 * Critério: requiresCustody=true, toolStatus=AVAILABLE (ou null),
 *           currentLocation começa com 'OBRA:', 'EXTERNO:' ou é 'EM USO'.
 *
 * Uso:
 *   npx tsx src/scripts/sync-tool-status.ts
 */

import { prisma } from '@sysobra/database'

async function main() {
  const p = prisma as any

  // 1. Buscar ferramentas cujo currentLocation indica que estão fora do depósito
  //    mas toolStatus ainda é AVAILABLE ou null
  const tools = await p.stockItem.findMany({
    where: {
      requiresCustody: true,
      AND: [
        {
          OR: [
            { toolStatus: null },
            { toolStatus: 'AVAILABLE' },
          ],
        },
        {
          OR: [
            { currentLocation: { startsWith: 'OBRA:'    } },
            { currentLocation: { startsWith: 'EXTERNO:' } },
            { currentLocation: 'EM USO' },
          ],
        },
      ],
    },
    select: { id: true, name: true, currentLocation: true, toolStatus: true, companyId: true },
  })

  console.log(`\nFerramentas encontradas: ${tools.length}\n`)

  if (tools.length === 0) {
    console.log('✅ Nenhuma ferramenta precisa de sincronização.')
    return
  }

  for (const tool of tools) {
    console.log(`  → ${tool.name} | location: "${tool.currentLocation}" | status atual: ${tool.toolStatus ?? 'null'}`)
  }

  const ids = tools.map((t: any) => t.id)

  const result = await p.stockItem.updateMany({
    where: { id: { in: ids } },
    data:  { toolStatus: 'IN_USE' },
  })

  console.log(`\n✅ ${result.count} ferramenta(s) atualizadas → toolStatus: IN_USE\n`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => (prisma as any).$disconnect())
