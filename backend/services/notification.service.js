import nodemailer from 'nodemailer';
import pool from '../config/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config();

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Obtener metadatos oficiales del programa (correo de contacto y firma de comité)
 */
async function getProgramMetadata(clientOrPool, programIdentifier) {
  try {
    let query = '';
    let params = [];

    if (typeof programIdentifier === 'number') {
      query = 'SELECT name, contact_email, committee_signature FROM public.programs WHERE program_id = $1';
      params = [programIdentifier];
    } else if (programIdentifier) {
      query = 'SELECT name, contact_email, committee_signature FROM public.programs WHERE LOWER(name) LIKE LOWER($1) LIMIT 1';
      params = [`%${programIdentifier}%`];
    }

    if (query) {
      const res = await clientOrPool.query(query, params);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    }
  } catch (err) {
    console.error('[NotificationService] Error al buscar metadatos de programa:', err.message);
  }

  // Valores predeterminados por coincidencia si no se encuentra en DB
  const progStr = String(programIdentifier || '').toLowerCase();
  if (progStr.includes('psicolog')) {
    return {
      name: 'Psicología',
      contact_email: 'investigacion.psicologia@unicesmag.edu.co',
      committee_signature: 'Comité de Investigación - Psicología',
    };
  }
  if (progStr.includes('sistem')) {
    return {
      name: 'Ingeniería de Sistemas',
      contact_email: 'investigacion.sistemas@unicesmag.edu.co',
      committee_signature: 'Comité de Investigación - Ingeniería de Sistemas',
    };
  }

  return {
    name: programIdentifier || 'Trabajos de Grado',
    contact_email: 'investigacion@unicesmag.edu.co',
    committee_signature: 'Comité de Trabajos de Grado e Investigación',
  };
}

/**
 * Crear plantilla HTML moderna para el correo institucional
 */
function buildNotificationHtml({ recipientName, title, message, programName, committeeSignature, link, details, documentUrl }) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const actionUrl = link ? (link.startsWith('http') ? link : `${frontendUrl}${link}`) : frontendUrl;

  const detailsRows = details && typeof details === 'object'
    ? Object.entries(details)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `<tr><td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 35%; border-bottom: 1px solid #e2e8f0; vertical-align: top;">${k}:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0; line-height: 1.5;">${v}</td></tr>`)
        .join('')
    : '';

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
        .header { background: #1B2A4A; padding: 26px 30px; text-align: center; color: #ffffff; border-bottom: 4px solid #c62847; }
        .header h1 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.02em; }
        .header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
        .program-badge { display: inline-block; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 10px; color: #f8fafc; }
        .content { padding: 30px; font-size: 15px; line-height: 1.6; color: #334155; }
        .greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 14px; }
        .title-box { background: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 18px; border-radius: 4px 8px 8px 4px; margin-bottom: 20px; }
        .title-box h2 { margin: 0; font-size: 16px; color: #0369a1; font-weight: 700; }
        .details-table { width: 100%; border-collapse: collapse; margin: 18px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; }
        .btn-wrapper { text-align: center; margin: 30px 0 20px; }
        .btn-doc { display: inline-block; background: #0284c7; color: #ffffff !important; padding: 13px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3); margin: 6px; }
        .btn { display: inline-block; background: #c62847; color: #ffffff !important; padding: 13px 26px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(198, 40, 71, 0.3); margin: 6px; }
        .btn:hover { background-color: #b31f3f; }
        .signature-box { margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; }
        .signature-name { font-weight: 700; color: #1e293b; font-size: 14px; }
        .footer { background: #f8fafc; padding: 18px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Universidad CESMAG</h1>
          <p>GradoHub · Plataforma de Trabajos de Grado e Investigación</p>
          <div class="program-badge">${programName}</div>
        </div>
        <div class="content">
          <div class="greeting">Estimado(a) ${recipientName || 'Usuario(a)'},</div>
          
          <div class="title-box">
            <h2>${title}</h2>
          </div>

          <p>${message}</p>

          ${detailsRows ? `
            <table class="details-table">
              <tbody>
                ${detailsRows}
              </tbody>
            </table>
          ` : ''}

          <div class="btn-wrapper">
            ${documentUrl ? `
              <a href="${documentUrl}" class="btn-doc" target="_blank" rel="noopener noreferrer">📄 Abrir Documento / Aval ↗</a>
            ` : ''}
            <a href="${actionUrl}" class="btn" target="_blank" rel="noopener noreferrer">Abrir en GradoHub</a>
          </div>

          <div class="signature-box">
            Atentamente,<br>
            <span class="signature-name">${committeeSignature}</span><br>
            Universidad CESMAG · San Juan de Pasto
          </div>
        </div>
        <div class="footer">
          Este es un correo institucional automático emitido por la plataforma GradoHub CESMAG.<br>
          Si tienes inquietudes, puedes responder directamente a este mensaje para contactar a tu comité.
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Enviar notificación completa (guarda en DB y envía correo)
 * 
 * @param {Object} params
 * @param {string} params.userId - Identificador del usuario (ej: 'doc002', 'est001')
 * @param {string} params.title - Título corto de la notificación
 * @param {string} params.message - Mensaje explicativo
 * @param {string} params.type - 'ASIGNACION_DOCENTE' | 'INCLUSION_COMPANERO' | 'CAMBIO_ESTADO' | 'EVALUACION' | 'AVAL'
 * @param {string|number} [params.program] - Nombre o ID del programa académico
 * @param {string} [params.link] - Ruta de navegación en la app (ej: '/proyectos')
 * @param {string} [params.documentUrl] - URL directa al documento externo (Google Drive, OneDrive, PDF)
 * @param {Object} [params.details] - Pares clave-valor informativos para el correo (ej: { 'Proyecto': '...', 'Rol': 'Asesor' })
 */
export async function sendNotification({
  userId,
  title,
  message,
  type = 'GENERAL',
  program = null,
  link = '/proyectos',
  documentUrl = null,
  details = null,
}) {
  if (!userId) return null;

  try {
    // 1. Obtener datos del usuario receptor
    const userRes = await pool.query(
      'SELECT user_id, full_name, email, program_id FROM public.users WHERE user_id = $1',
      [String(userId)]
    );

    if (userRes.rows.length === 0) {
      console.warn(`[Notification] Usuario ${userId} no encontrado en base de datos.`);
      return null;
    }

    const recipient = userRes.rows[0];
    const targetProgram = program || recipient.program_id;

    // 2. Obtener datos del programa (correo de contacto y firma oficial)
    const progMeta = await getProgramMetadata(pool, targetProgram);

    // 3. Registrar en la tabla public.notifications (para la campana)
    const notifInsert = await pool.query(`
      INSERT INTO public.notifications (user_id, title, message, type, program_name, link, is_read)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      RETURNING *
    `, [
      String(userId),
      title,
      message,
      type,
      progMeta.name,
      link || '/proyectos'
    ]);

    const createdNotif = notifInsert.rows[0];

    // 4. Despachar correo electrónico vía SMTP
    const mailer = getTransporter();
    if (mailer && recipient.email) {
      const plainTextLines = [
        `Universidad CESMAG - GradoHub`,
        `Programa: ${progMeta.name}`,
        `----------------------------------------`,
        `Estimado(a) ${recipient.full_name},`,
        ``,
        `${title}`,
        `${message}`,
        ``,
      ];
      if (details && typeof details === 'object') {
        plainTextLines.push(`Detalles:`);
        for (const [k, v] of Object.entries(details)) {
          const cleanVal = String(v).replace(/<[^>]*>/g, '').trim();
          plainTextLines.push(`- ${k}: ${cleanVal}`);
        }
        plainTextLines.push(``);
      }
      if (documentUrl) {
        plainTextLines.push(`Documento / Aval: ${documentUrl}`);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const actionUrl = link ? (link.startsWith('http') ? link : `${frontendUrl}${link}`) : frontendUrl;
      plainTextLines.push(`Acceso a GradoHub: ${actionUrl}`);
      plainTextLines.push(``);
      plainTextLines.push(`Atentamente,`);
      plainTextLines.push(`${progMeta.committee_signature}`);
      plainTextLines.push(`Universidad CESMAG`);

      const text = plainTextLines.join('\n');
      const fromAddress = `"${progMeta.committee_signature} | GradoHub" <${process.env.SMTP_USER}>`;

      const html = buildNotificationHtml({
        recipientName: recipient.full_name,
        title,
        message,
        programName: progMeta.name,
        committeeSignature: progMeta.committee_signature,
        link,
        details,
        documentUrl,
      });

      mailer.sendMail({
        from: fromAddress,
        replyTo: process.env.SMTP_USER,
        to: recipient.email,
        subject: `[${progMeta.name}] ${title} — GradoHub CESMAG`,
        text,
        html,
      }).then((info) => {
        console.log(`[Notification Email] Enviado con éxito a ${recipient.email} (ID: ${info.messageId}) [${progMeta.name}]`);
      }).catch((mailErr) => {
        console.error(`[Notification Email Error] No fue posible enviar correo a ${recipient.email}:`, mailErr.message);
      });
    } else {
      console.log(`[Notification] Notificación registrada en plataforma para ${recipient.full_name} (${recipient.email}).`);
    }

    return createdNotif;
  } catch (err) {
    console.error('[Notification Error]:', err.message);
    return null;
  }
}
