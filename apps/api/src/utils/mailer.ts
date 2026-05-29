import nodemailer from 'nodemailer'

// ─── Transporte ───────────────────────────────────────────────────────────────

function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return null
}

// ─── sendEmail ─────────────────────────────────────────────────────────────────

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to:           string
  subject:      string
  html:         string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}): Promise<{ success: boolean; messageId?: string; error?: unknown }> {
  try {
    let transporter = createTransporter()

    // Sem SMTP configurado: usar Ethereal (email de teste gratuito)
    if (!transporter) {
      const testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    }

    const info = await transporter.sendMail({
      from:        process.env.FROM_EMAIL || '"SYSOBRA" <noreply@sysobra.com.br>',
      to,
      subject,
      html,
      attachments,
    })

    console.log('[mailer] Email enviado:', info.messageId)
    if (!process.env.SMTP_HOST) {
      console.log('[mailer] Preview URL:', nodemailer.getTestMessageUrl(info))
    }

    return { success: true, messageId: info.messageId }
  } catch (err) {
    console.error('[mailer] Erro ao enviar email:', err)
    return { success: false, error: err }
  }
}

// ─── Template: convite para assinar RDO ──────────────────────────────────────

export function buildFiscalEmailHtml({
  fiscalName,
  reportNumber,
  projectName,
  authorName,
  date,
  signLink,
}: {
  fiscalName:   string
  reportNumber: string
  projectName:  string
  authorName:   string
  date:         string
  signLink:     string
}): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;
              border-radius:12px;overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,0.1)">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:24px 32px;text-align:center">
      <div style="color:#F5A623;font-size:22px;font-weight:700;letter-spacing:2px">
        SYSOBRA
      </div>
      <div style="color:#9CA3AF;font-size:12px;margin-top:4px">
        Sistema de Gestão de Obras
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="font-size:16px;color:#111;margin:0 0 8px">
        Olá, <strong>${fiscalName}</strong>
      </p>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px">
        Você foi solicitado a assinar o Relatório Diário de Obra abaixo:
      </p>

      <!-- Card RDO -->
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;
                  border-radius:8px;padding:16px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="font-size:12px;color:#6B7280;padding:4px 0">Relatório</td>
            <td style="font-size:13px;font-weight:700;color:#111;text-align:right;padding:4px 0">${reportNumber}</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#6B7280;padding:4px 0">Obra</td>
            <td style="font-size:13px;color:#111;text-align:right;padding:4px 0">${projectName}</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#6B7280;padding:4px 0">Data</td>
            <td style="font-size:13px;color:#111;text-align:right;padding:4px 0">${date}</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#6B7280;padding:4px 0">Elaborado por</td>
            <td style="font-size:13px;color:#111;text-align:right;padding:4px 0">${authorName}</td>
          </tr>
        </table>
      </div>

      <!-- Botão assinar -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${signLink}"
           style="display:inline-block;padding:14px 32px;
                  background:#F5A623;color:#fff;font-weight:700;
                  font-size:15px;text-decoration:none;border-radius:8px">
          ✍️ Assinar RDO
        </a>
      </div>

      <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0">
        Este link é válido por 48 horas.<br>
        Se não solicitou esta assinatura, ignore este email.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;
                text-align:center;border-top:1px solid #E5E7EB">
      <p style="font-size:11px;color:#9CA3AF;margin:0">
        © ${new Date().getFullYear()} SYSOBRA — Gestão de Obras
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Template: RDO totalmente assinado ───────────────────────────────────────

export function buildSignedEmailHtml({
  fiscalName,
  reportNumber,
  projectName,
  date,
  downloadLink,
}: {
  fiscalName:   string
  reportNumber: string
  projectName:  string
  date:         string
  downloadLink: string
}): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;
              border-radius:12px;overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,0.1)">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:24px 32px;text-align:center">
      <div style="color:#F5A623;font-size:22px;font-weight:700;letter-spacing:2px">
        SYSOBRA
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h2 style="color:#16A34A;margin:0 0 8px">RDO Totalmente Assinado</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 24px">
        Olá <strong>${fiscalName}</strong>, o RDO <strong>${reportNumber}</strong>
        da obra <strong>${projectName}</strong> (${date})
        está com todas as assinaturas concluídas.
      </p>
      <a href="${downloadLink}"
         style="display:inline-block;padding:14px 32px;
                background:#16A34A;color:#fff;font-weight:700;
                font-size:15px;text-decoration:none;border-radius:8px">
        📥 Baixar RDO Assinado
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;
                text-align:center;border-top:1px solid #E5E7EB">
      <p style="font-size:11px;color:#9CA3AF;margin:0">
        © ${new Date().getFullYear()} SYSOBRA — Gestão de Obras
      </p>
    </div>
  </div>
</body>
</html>`
}
