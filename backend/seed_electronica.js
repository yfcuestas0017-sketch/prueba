import pool from './config/db.js';

async function seedElectronica() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Sync sequences
    await client.query("SELECT setval('research_lines_research_line_id_seq', (SELECT COALESCE(MAX(research_line_id), 1) FROM research_lines))");
    await client.query("SELECT setval('research_sublines_research_subline_id_seq', (SELECT COALESCE(MAX(research_subline_id), 1) FROM research_sublines))");
    await client.query("SELECT setval('programs_program_id_seq', (SELECT COALESCE(MAX(program_id), 1) FROM programs))");

    // 1. Insert program
    let progRes = await client.query('SELECT program_id, name FROM programs WHERE LOWER(name) LIKE $1', ['%electr%']);
    let programId;
    if (progRes.rows.length === 0) {
      const insProg = await client.query('INSERT INTO programs (name) VALUES ($1) RETURNING program_id, name', ['Ingeniería Electrónica']);
      programId = insProg.rows[0].program_id;
      console.log('Program inserted with ID:', programId);
    } else {
      programId = progRes.rows[0].program_id;
      console.log('Program already exists with ID:', programId);
    }

    // 2. Insert Research Lines
    const lines = [
      'Automatización, Robótica y Control Industrial',
      'Telecomunicaciones y Sistemas Embebidos',
      'Procesamiento Digital de Señales e Instrumentación'
    ];
    const lineIds = [];
    for (const lineName of lines) {
      let lRes = await client.query('SELECT research_line_id FROM research_lines WHERE program_id = $1 AND name = $2', [programId, lineName]);
      if (lRes.rows.length === 0) {
        const insL = await client.query('INSERT INTO research_lines (name, program_id) VALUES ($1, $2) RETURNING research_line_id', [lineName, programId]);
        lineIds.push(insL.rows[0].research_line_id);
      } else {
        lineIds.push(lRes.rows[0].research_line_id);
      }
    }
    console.log('Research lines created:', lineIds);

    // 3. Insert Sublines
    const sublinesMap = [
      { lineId: lineIds[0], subs: ['Sistemas de Control Difuso y Adaptativo', 'Robótica Móvil y Manipuladores'] },
      { lineId: lineIds[1], subs: ['Sistemas Embebidos y FPGA', 'Redes de Sensores Inalámbricos (WSN)'] },
      { lineId: lineIds[2], subs: ['Instrumentación Biomédica', 'Adquisición y Procesamiento de Bioseñales'] }
    ];

    for (const item of sublinesMap) {
      for (const subName of item.subs) {
        let slRes = await client.query('SELECT research_subline_id FROM research_sublines WHERE research_line_id = $1 AND name = $2', [item.lineId, subName]);
        if (slRes.rows.length === 0) {
          await client.query('INSERT INTO research_sublines (research_line_id, name) VALUES ($1, $2)', [item.lineId, subName]);
        }
      }
    }
    console.log('Sublines created successfully');

    // 4. Create Users
    const usersToCreate = [
      {
        user_id: 'admin003',
        full_name: 'Administrador de Ingeniería Electrónica',
        email: 'admin.electronica@unicesmag.edu.co',
        password: '12345678',
        role_id: 1 // Administrador
      },
      {
        user_id: 'doc017',
        full_name: 'Javier Ricardo Narváez',
        email: 'javier.narvaez@unicesmag.edu.co',
        password: '12345678',
        role_id: 4, // Docente
        secondary_role_id: 2 // Director
      },
      {
        user_id: 'est012',
        full_name: 'Juan Camilo Bastidas',
        email: 'juan.bastidas@unicesmag.edu.co',
        password: '12345678',
        role_id: 3 // Estudiante
      }
    ];

    for (const u of usersToCreate) {
      let uCheck = await client.query('SELECT user_id FROM users WHERE email = $1', [u.email]);
      let targetUid = u.user_id;
      if (uCheck.rows.length === 0) {
        await client.query('INSERT INTO users (user_id, full_name, email, password, program_id, is_active) VALUES ($1, $2, $3, $4, $5, true)',
          [u.user_id, u.full_name, u.email, u.password, programId]);
        console.log('Created user:', u.email);
      } else {
        targetUid = uCheck.rows[0].user_id;
        console.log('User already exists:', u.email);
      }

      // Role assignment
      let rCheck = await client.query('SELECT * FROM user_roles WHERE user_id = $1 AND role_id = $2', [targetUid, u.role_id]);
      if (rCheck.rows.length === 0) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [targetUid, u.role_id]);
      }
      if (u.secondary_role_id) {
        let r2Check = await client.query('SELECT * FROM user_roles WHERE user_id = $1 AND role_id = $2', [targetUid, u.secondary_role_id]);
        if (r2Check.rows.length === 0) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [targetUid, u.secondary_role_id]);
        }
      }
    }

    await client.query('COMMIT');
    console.log('ALL ELECTRONICA DATA SEEDED SUCCESSFULLY');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR SEEDING:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedElectronica();
