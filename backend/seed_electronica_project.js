import pool from './config/db.js';

async function seedElectronicaProject() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const code = 'ELEC-2026-001';
    
    const checkP = await client.query('SELECT project_id FROM projects WHERE code = $1', [code]);
    if (checkP.rows.length === 0) {
      const insP = await client.query(`
        INSERT INTO public.projects (
          title, code, status_id, modality_id, research_line_id, research_subline_id, degree_option_id,
          general_objective, specific_objectives, letter_link
        ) VALUES (
          'Diseño e Implementación de un Sistema de Telemetría para Redes de Distribución Eléctrica Inteligente',
          $1, 1, 1, 9, 17, 1,
          'Desarrollar un sistema de telemetría y monitoreo remoto para la supervisión de micro-redes eléctricas inteligentes.',
          '1. Analizar protocolos de comunicación industrial.\n2. Implementar los nodos de telemetría.\n3. Realizar pruebas de campo.',
          'https://ejemplo.cesmag.edu.co/carta-electronica.pdf'
        ) RETURNING project_id
      `, [code]);
      const pid = insP.rows[0].project_id;
      console.log('Project created:', pid);

      // Link student as author
      await client.query(`
        INSERT INTO public.user_projects (user_id, project_id, project_role)
        VALUES ('est012', $1, 'autor')
      `, [pid]);

      // Link teacher as director
      await client.query(`
        INSERT INTO public.user_projects (user_id, project_id, project_role)
        VALUES ('doc017', $1, 'director')
      `, [pid]);
      console.log('Participants linked to project');
    } else {
      console.log('Sample project already exists');
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedElectronicaProject();
