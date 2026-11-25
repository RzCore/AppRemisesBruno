import { Resend } from 'resend';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no está configurada en las variables de entorno');
  }
  return new Resend(apiKey);
}

function getSender(): string {
  const fromEmail = process.env.FROM_EMAIL || 'notificaciones@rzcore.dev';
  const fromName = process.env.FROM_NAME || 'Remises Bruno';
  return `${fromName} <${fromEmail}>`;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  rolLabel: string = 'Personal'
): Promise<void> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getSender(),
    to: [to],
    subject: 'Restablecer contraseña — Remises Bruno',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
          <img src="https://www.brunoremises.com.ar/LogoBruno.jpg" alt="Remises Bruno" width="84" height="84" style="display: block; margin: 0 auto 14px auto; border-radius: 16px; object-fit: cover;" />
          <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Remises Bruno</h1>
          <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">Acceso Interno • ${rolLabel}</p>
        </div>

        <!-- Body -->
        <div style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 40px 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px; font-weight: 600;">Recuperá o cambiá tu contraseña</h2>
          <p style="margin: 0 0 24px; color: #475569; font-size: 15px; line-height: 1.6;">
            Recibimos una solicitud para cambiar la contraseña de tu cuenta en <strong>Remises Bruno</strong>.
            Tocá el botón de abajo para elegir tu nueva clave de acceso.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
              Cambiar mi contraseña
            </a>
          </div>

          <!-- Warning -->
          <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; color: #92400e; font-size: 13px;">
              ⏱️ <strong>Este enlace es válido por 1 hora.</strong> Si no solicitaste este cambio, podés ignorar este correo de forma segura.
            </p>
          </div>

          <!-- Fallback URL -->
          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
            Si el botón no abre, copiá y pegá este enlace en tu navegador:<br/>
            <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 24px;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">
            © ${new Date().getFullYear()} <strong>Remises Bruno</strong> · Sistema Interno de Gestión y Flota
          </p>
        </div>

      </div>
    `,
  });

  if (error) {
    console.error('Error enviando email de recuperación con Resend:', error);
    throw new Error(`Error al enviar email: ${error.message}`);
  }
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  // Evitar enviar a correos internos ficticios (@brunoremises.com.ar sin buzón o @cliente.)
  if (!to || to.endsWith('@cliente.brunoremises.com.ar')) return;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: getSender(),
      to: [to],
      subject: 'Tu contraseña ha sido actualizada — Remises Bruno',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px 16px 0 0; padding: 28px; text-align: center;">
            <img src="https://www.brunoremises.com.ar/LogoBruno.jpg" alt="Remises Bruno" width="72" height="72" style="display: block; margin: 0 auto 12px auto; border-radius: 14px; object-fit: cover;" />
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Remises Bruno</h1>
          </div>
          <div style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <h2 style="margin: 0 0 14px; color: #059669; font-size: 19px; font-weight: 700;">✅ Contraseña actualizada con éxito</h2>
            <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">
              Te confirmamos que la contraseña de tu cuenta en <strong>Remises Bruno</strong> fue modificada recientemente. Ya podés ingresar con tu nueva clave.
            </p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.warn('No se pudo enviar aviso de confirmación de cambio de clave:', err);
  }
}

export async function sendFelevalPasswordAlertEmail(
  to: string,
  artNombre: string,
  portalEmail: string,
  detalleError: string
): Promise<void> {
  if (!to) return;
  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: getSender(),
      to: [to],
      subject: `⚠️ Cambiar clave de ${artNombre} (Feleval) — Remises Bruno`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 32px 18px;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px 16px 0 0; padding: 26px; text-align: center;">
            <img src="https://www.brunoremises.com.ar/LogoBruno.jpg" alt="Remises Bruno" width="72" height="72" style="display: block; margin: 0 auto 12px auto; border-radius: 14px; object-fit: cover;" />
            <h1 style="margin: 0; color: #ffffff; font-size: 21px; font-weight: 700;">Remises Bruno • Sincronización ART</h1>
          </div>
          <div style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 30px 26px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <h2 style="margin: 0 0 12px; color: #b45309; font-size: 18px; font-weight: 700;">⚠️ Es necesario cambiar la clave de Feleval</h2>
            <p style="margin: 0 0 16px; color: #334155; font-size: 14px; line-height: 1.6;">
              La sincronización automática de viajes para <strong>${artNombre}</strong> no pudo iniciar sesión en el portal de Feleval con el usuario <strong>${portalEmail}</strong>.
            </p>
            <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 14px; margin: 16px 0;">
              <p style="margin: 0; color: #92400e; font-size: 13px;">
                <strong>Motivo detectado:</strong> ${detalleError}
              </p>
            </div>
            <p style="margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.6;">
              <strong>Pasos a seguir:</strong><br/>
              1. Ingresá a <a href="https://app.feleval.com.ar/users/sign_in" style="color: #2563eb;">https://app.feleval.com.ar/users/sign_in</a> y actualizá la contraseña.<br/>
              2. Luego entrá al módulo <strong>ART y Empresas</strong> en <a href="https://admin.brunoremises.com.ar" style="color: #2563eb;">admin.brunoremises.com.ar</a> y guardá la nueva contraseña en <strong>Sync Portal</strong> de ${artNombre}.
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
              Fecha del intento: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} hs
            </p>
          </div>
        </div>
      `
    });
    if (error) {
      console.error('Error enviando alerta de clave Feleval con Resend:', error);
    }
  } catch (err) {
    console.error('No se pudo enviar alerta de clave Feleval:', err);
  }
}
