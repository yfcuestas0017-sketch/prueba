import pool from './config/db.js';

async function seedElectronicaSampleProject() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT project_bank_id FROM public.project_bank WHERE program_id = 3');
    if (existing.rows.length === 0) {
      const ins = await client.query(`
        INSERT INTO public.project_bank (
          title, description, general_objective, specific_objectives,
          research_line_id, research_subline_id, program_id, keywords,
          observations, status, proposer_id, proposer_role
        ) VALUES (
          'Sistema IoT Embebido para Monitoreo de Parámetros Industriales en Tiempo Real',
          'Desarrollo e implementación de un nodo embebido basado en microcontrolador y sensores industriales con protocolo MQTT para monitoreo en plantas de producción.',
          'Diseñar y construir un prototipo embebido IoT para adquisición y monitoreo en tiempo real de variables ambientales e industriales.',
          '1. Seleccionar la arquitectura de hardware y sensores adecuados.\n2. Programar firmware con transmisión de datos telemétrica.\n3. Validar el desempeño en un entorno controlado.',
          9, 16, 3,
          'IoT, Sistemas Embebidos, Automatización, MQTT, Sensores',
          'Proyecto propuesto para el programa de Ingeniería Electrónica.',
          'DISPONIBLE',
          'doc017',
          'docente'
        ) RETURNING project_bank_id
      `);
      console.log('Project bank sample created:', ins.rows[0]);
    } else {
      console.log('Project bank sample already exists');
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

seedElectronicaSampleProject();
