import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import StripeLib from 'stripe'
import { prisma } from '@sysobra/database'
import { env } from '../utils/env'

// ─── Tipos locais derivados do SDK ───────────────────────────────────────────
// Stripe v22 exports StripeConstructor as default; the inner Stripe namespace
// lives in stripe.core and is NOT accessible as StripeConstructor.Event etc.
// We derive types from the constructor instance to stay on the public API.
type StripeInstance  = InstanceType<typeof StripeLib>
type StripeEvent     = ReturnType<StripeInstance['webhooks']['constructEvent']>

// Shapes we need from event.data.object — typed loosely to avoid SDK internals
interface CheckoutSessionObject {
  metadata?: Record<string, string> | null
  subscription?: string | null
  customer?: string | null
  payment_status?: string
}

interface InvoiceObject {
  customer?: string | null
}

interface SubscriptionObject {
  customer?: string | null
  status: string
}

// ─────────────────────────────────────────────────────────────────────────────

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  STARTER:      env.STRIPE_PRICE_ESSENCIAL,
  PROFESSIONAL: env.STRIPE_PRICE_PROFISSIONAL,
  ENTERPRISE:   env.STRIPE_PRICE_AVANCADO,
}

export async function stripeRoutes(app: FastifyInstance) {
  if (!env.STRIPE_SECRET_KEY) {
    app.log.warn('⚠️  STRIPE_SECRET_KEY não configurado — rotas Stripe desabilitadas')
    return
  }

  // Use the API version the installed SDK expects.
  // Cast to any to avoid strict literal-type mismatch between build-time and installed versions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new StripeLib(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' } as any)

  // ── POST /api/stripe/checkout ───────────────────────────────────────────────
  app.post('/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const body = request.body as { empresaId?: string; plano?: string }
    const companyId = body.empresaId || ''
    const plan = body.plano || ''

    if (!companyId || !plan) {
      return reply.status(400).send({ error: 'empresaId e plano são obrigatórios' })
    }

    const priceId = PLAN_PRICE_MAP[plan]
    if (!priceId) {
      return reply.status(400).send({
        error: `Plano "${plan}" não possui price_id configurado`,
      })
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${env.FRONTEND_URL}/pagamento?session_id={CHECKOUT_SESSION_ID}&plano=${plan}&empresaId=${companyId}`,
        cancel_url:  `${env.FRONTEND_URL}/pagamento?canceled=true&empresaId=${companyId}&plano=${plan}`,
        metadata: { companyId, plan },
      })

      return reply.send({ url: session.url })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      app.log.error('Stripe checkout error: %s', msg)
      return reply.status(500).send({ error: 'Erro ao criar sessão de pagamento' })
    }
  })

  // ── GET /api/stripe/session/:sessionId ─────────────────────────────────────
  // Verifica o status da sessão e, se pago, atualiza o banco imediatamente.
  // Isso evita race condition com o webhook (que pode demorar alguns segundos).
  app.get('/session/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Não autorizado' })
    }

    const { sessionId }                      = request.params as { sessionId: string }
    const { companyId, plano }               = request.query  as { companyId?: string; plano?: string }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)

      // Se pago e temos o companyId, atualiza o banco agora (antes do webhook)
      if (session.payment_status === 'paid' && companyId) {
        const plan = plano || (session.metadata?.plan ?? 'STARTER')
        await prisma.company.update({
          where: { id: companyId },
          data: {
            plan:                  plan as 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
            subscriptionStatus:    'ACTIVE',
            stripeSubscriptionId:  (session.subscription as string | null) ?? null,
            stripeCustomerId:      (session.customer     as string | null) ?? null,
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }).catch((e) => app.log.warn('Empresa %s não encontrada ao confirmar sessão: %s', companyId, e))
      }

      return reply.send({
        status:         session.payment_status,
        subscriptionId: session.subscription,
        customerId:     session.customer,
      })
    } catch {
      return reply.status(400).send({ error: 'Sessão inválida' })
    }
  })

  // ── POST /api/stripe/webhook ────────────────────────────────────────────────
  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const sig     = request.headers['stripe-signature'] as string
    const rawBody = (request as { rawBody?: Buffer | string }).rawBody

    let event: StripeEvent

    try {
      if (env.STRIPE_WEBHOOK_SECRET && sig && rawBody) {
        event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
      } else {
        // Dev mode: trust the body directly (no signature verification)
        event = request.body as StripeEvent
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown'
      app.log.error('Webhook signature error: %s', msg)
      return reply.status(400).send({ error: 'Webhook inválido' })
    }

    app.log.info('Stripe event: %s', event.type)

    switch (event.type) {
      // ── checkout.session.completed → ativa plano ─────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSessionObject
        const { companyId, plan } = session.metadata ?? {}

        if (companyId && plan) {
          await prisma.company.update({
            where: { id: companyId },
            data: {
              plan:                 plan as 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
              subscriptionStatus:   'ACTIVE',
              stripeSubscriptionId: (session.subscription as string) ?? null,
              stripeCustomerId:     (session.customer    as string) ?? null,
              subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
          app.log.info('✅ Empresa %s ativada no plano %s', companyId, plan)
        }
        break
      }

      // ── invoice.payment_succeeded → renovação automática ─────────────────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object as InvoiceObject
        const customerId = invoice.customer as string | undefined

        if (customerId) {
          await prisma.company.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus:    'ACTIVE',
              subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
          app.log.info('✅ Renovação confirmada para cliente %s', customerId)
        }
        break
      }

      // ── invoice.payment_failed → pagamento falhou ─────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as InvoiceObject
        const customerId = invoice.customer as string | undefined

        if (customerId) {
          await prisma.company.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: 'PAST_DUE' },
          })
          app.log.warn('⚠️  Pagamento falhou para cliente %s', customerId)
        }
        break
      }

      // ── customer.subscription.deleted → assinatura cancelada ─────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object as SubscriptionObject
        const customerId = sub.customer as string | undefined

        if (customerId) {
          await prisma.company.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              plan:                 'FREE',
              subscriptionStatus:   'CANCELED',
              stripeSubscriptionId: null,
              subscriptionExpiresAt: null,
            },
          })
          app.log.warn('🔴 Assinatura cancelada para cliente %s', customerId)
        }
        break
      }

      // ── customer.subscription.updated → status de assinatura atualizado ──
      case 'customer.subscription.updated': {
        const sub        = event.data.object as SubscriptionObject
        const customerId = sub.customer as string | undefined
        const status     = sub.status

        const statusMap: Record<string, 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE'> = {
          active:             'ACTIVE',
          past_due:           'PAST_DUE',
          canceled:           'CANCELED',
          incomplete:         'INCOMPLETE',
          incomplete_expired: 'CANCELED',
          unpaid:             'PAST_DUE',
        }

        if (customerId && statusMap[status]) {
          await prisma.company.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: statusMap[status] },
          })
        }
        break
      }

      default:
        app.log.info('Evento Stripe não tratado: %s', event.type)
    }

    return reply.send({ received: true })
  })
}
