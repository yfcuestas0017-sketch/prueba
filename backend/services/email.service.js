import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

/**
 * Servicio de envío de correos institucionales de GradoHub.
 * Soporta configuración SMTP estándar (Gmail, Outlook, servidores institucionales).
 * Si el SMTP no está configurado o rechaza el envío, lanza un error: nunca se
 * le dice al usuario que se envió un correo que en realidad no salió.
 */
export async function sendPasswordResetEmail({ toEmail, recipientName, resetUrl }) {
  const { SMTP_FROM, SMTP_USER } = process.env;

  // Gmail/Outlook rechazan o reescriben remitentes distintos a la cuenta autenticada.
  const fromAddress = SMTP_FROM || `"GradoHub - Universidad CESMAG" <${SMTP_USER}>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Recuperación de Contraseña - GradoHub</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f7f6f2; color: #171a22; margin: 0; padding: 24px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #d9dfe8; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .header { background: #1B2A4A; padding: 28px 32px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
        .header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
        .content { padding: 32px; font-size: 15px; line-height: 1.6; color: #334155; }
        .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
        .btn-wrapper { text-align: center; margin: 30px 0; }
        .btn { display: inline-block; background-color: #c62847; color: #ffffff !important; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 2px 8px rgba(198, 40, 71, 0.3); }
        .btn:hover { background-color: #b31f3f; }
        .expiry-note { font-size: 13px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 24px; }
        .footer { background: #f1f5f9; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Universidad CESMAG</h1>
          <p>GradoHub · Plataforma de Gestión de Proyectos de Grado</p>
        </div>
        <div class="content">
          <div class="greeting">Hola, ${recipientName || 'Estimado(a) Usuario(a)'}</div>
          <p>Recibimos una solicitud para restablecer la contraseña de acceso a tu cuenta institucional en GradoHub.</p>
          <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
          <div class="btn-wrapper">
            <a href="${resetUrl}" class="btn" target="_blank">Restablecer mi contraseña</a>
          </div>
          <div class="expiry-note">
            ⚠️ <strong>Importante:</strong> Este enlace es de un solo uso y expirará en <strong>30 minutos</strong>. Si no solicitaste este cambio, puedes ignorar este mensaje; tu contraseña actual permanecerá segura.
          </div>
          <p style="margin-top: 24px; font-size: 13px; color: #94a3b8;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${resetUrl}" style="color: #c62847; word-break: break-all;">${resetUrl}</a></p>
        </div>
        <div class="footer">
          Facultad de Ingeniería · San Juan de Pasto, Nariño<br>
          Este es un correo automático, por favor no respondas a este mensaje.
        </div>
      </div>
    </body>
    </html>
  `;

  if (!isEmailConfigured()) {
    throw new Error('Correo no configurado (define BREVO_API_KEY, o SMTP_HOST, SMTP_USER y SMTP_PASS).');
  }

  const subject = 'Recuperación de Contraseña — GradoHub UCESMAG';

  // Opción A: API HTTPS de Brevo (puerto 443, no lo bloquean los hosts gratuitos).
  if (process.env.BREVO_API_KEY) {
    const senderEmail = process.env.BREVO_SENDER_EMAIL || SMTP_USER;
    if (!senderEmail) {
      throw new Error('Falta BREVO_SENDER_EMAIL (el remitente verificado en Brevo).');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: process.env.BREVO_SENDER_NAME || 'GradoHub - Universidad CESMAG',
            email: senderEmail,
          },
          to: [{ email: toEmail, name: recipientName || toEmail }],
          subject,
          htmlContent,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Brevo respondió ${res.status}: ${data.message || 'error desconocido'}`);
      }
      console.log(`[EMAIL] Correo de recuperación enviado a ${toEmail} vía Brevo (ID: ${data.messageId})`);
      return { success: true, messageId: data.messageId };
    } finally {
      clearTimeout(timer);
    }
  }

  // Opción B: SMTP clásico.
  const info = await getTransporter().sendMail({
    from: fromAddress,
    to: toEmail,
    subject,
    html: htmlContent,
  });

  console.log(`[EMAIL] Correo de recuperación enviado a ${toEmail} (ID: ${info.messageId})`);
  return { success: true, messageId: info.messageId };
}

/** true si hay forma de enviar correo: API de Brevo (HTTPS) o las tres variables SMTP. */
export function isEmailConfigured() {
  const { BREVO_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(BREVO_API_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_SECURE === 'true' || SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    family: 4,                 // Render no tiene salida IPv6 (ENETUNREACH)
    connectionTimeout: 10000,  // por defecto son 2 minutos
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

/** Comprueba credenciales SMTP al arrancar el servidor y deja constancia en el log. */
export async function verifyEmailTransport() {
  if (process.env.BREVO_API_KEY) {
    console.log('[EMAIL] Envío por API de Brevo (HTTPS) configurado.');
    return true;
  }
  if (!isEmailConfigured()) {
    console.warn('[EMAIL] SMTP no configurado: la recuperación de contraseña no podrá enviar correos.');
    return false;
  }
  try {
    await getTransporter().verify();
    console.log(`[EMAIL] Servidor SMTP listo (${process.env.SMTP_HOST}).`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Las credenciales SMTP fueron rechazadas:', err.message);
    return false;
  }
}