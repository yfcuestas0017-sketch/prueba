import pool from '../server/db.js';

async function syncDatabaseDump() {
  console.log('==================================================');
  console.log('🚀 APLICANDO AJUSTES DEL DUMP SQL EN BaseDatosGrado');
  console.log('==================================================\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. DDL: Estructuras y Columnas
    console.log('1. Verificando y creando tablas, columnas y funciones...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.log_project_field_changes() RETURNS trigger
          LANGUAGE plpgsql
          AS $$
      DECLARE
          hist_id INT;
      BEGIN
          IF (OLD.status_id IS DISTINCT FROM NEW.status_id) THEN
              INSERT INTO histories (description, modified_field, old_value, new_value, change_type)
              VALUES ('Status update', 'status_id', OLD.status_id::text, NEW.status_id::text, 'UPDATE')
              RETURNING history_id INTO hist_id;
              INSERT INTO project_histories (project_id, history_id) VALUES (NEW.project_id, hist_id);
          END IF;
          IF (OLD.title IS DISTINCT FROM NEW.title) THEN
              INSERT INTO histories (description, modified_field, old_value, new_value, change_type)
              VALUES ('Title modification', 'title', OLD.title, NEW.title, 'UPDATE')
              RETURNING history_id INTO hist_id;
              INSERT INTO project_histories (project_id, history_id) VALUES (NEW.project_id, hist_id);
          END IF;
          RETURN NEW;
      END;
      $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.degree_options (
          degree_option_id integer PRIMARY KEY,
          name character varying(100) NOT NULL,
          description text
      );

      CREATE SEQUENCE IF NOT EXISTS public.degree_options_degree_option_id_seq
          AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

      CREATE TABLE IF NOT EXISTS public.project_bank (
          project_bank_id integer PRIMARY KEY,
          title character varying(300) NOT NULL,
          description text NOT NULL,
          general_objective text,
          specific_objectives text,
          research_line_id integer,
          research_subline_id integer,
          program_id integer,
          keywords character varying(300),
          observations text,
          proposer_id character varying(50) NOT NULL,
          proposer_role character varying(50) NOT NULL,
          status character varying(30) DEFAULT 'Disponible'::character varying NOT NULL,
          assigned_student_id character varying(50),
          assigned_at timestamp without time zone,
          created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
      );

      CREATE SEQUENCE IF NOT EXISTS public.project_bank_project_bank_id_seq
          AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

      CREATE TABLE IF NOT EXISTS public.project_bank_histories (
          project_bank_history_id integer PRIMARY KEY,
          project_bank_id integer NOT NULL,
          user_id character varying(50) NOT NULL,
          action character varying(50) NOT NULL,
          previous_status character varying(50),
          new_status character varying(50),
          changes jsonb,
          created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
      );

      CREATE SEQUENCE IF NOT EXISTS public.project_bank_histories_project_bank_history_id_seq
          AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

      ALTER TABLE public.histories ADD COLUMN IF NOT EXISTS user_id character varying(100);
      ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS degree_option_id integer;
      ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS modality_id integer;
    `);

    // Restricciones de unicidad y llaves foráneas
    await client.query(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_roles_user_id_role_id') THEN
              ALTER TABLE ONLY public.user_roles ADD CONSTRAINT uq_user_roles_user_id_role_id UNIQUE (user_id, role_id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_degree_option_id_fkey') THEN
              ALTER TABLE ONLY public.projects ADD CONSTRAINT projects_degree_option_id_fkey FOREIGN KEY (degree_option_id) REFERENCES public.degree_options(degree_option_id);
          END IF;
      END $$;
    `);

    console.log('✅ Estructuras y columnas creadas/verificadas.');

    // 2. Insertar Opciones de Grado
    console.log('\n2. Insertando opciones de grado...');
    const degreeOpts = [
      [1, 'Coterminalidad', 'Opción de grado mediante coterminalidad'],
      [2, 'Artículo', 'Opción de grado mediante elaboración y presentación de artículo'],
      [3, 'Proyecto de Grado', 'Opción de grado mediante desarrollo y presentación de proyecto de grado']
    ];
    for (const [id, name, desc] of degreeOpts) {
      await client.query(`
        INSERT INTO public.degree_options (degree_option_id, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (degree_option_id) DO UPDATE SET name = $2, description = $3;
      `, [id, name, desc]);
    }

    // 3. Insertar Facultades
    console.log('3. Insertando facultades...');
    const faculties = [
      [1, 'Facultad de Ingeniería'],
      [2, 'Facultad de Ciencias Sociales y Humanas'],
      [3, 'Facultad de Educación'],
      [4, 'Facultad de Ciencias de la Salud']
    ];
    for (const [id, name] of faculties) {
      await client.query(`
        INSERT INTO public.faculties (faculty_id, name)
        VALUES ($1, $2)
        ON CONFLICT (faculty_id) DO UPDATE SET name = $2;
      `, [id, name]);
    }

    // 4. Insertar Programas
    console.log('4. Insertando programas...');
    const programs = [
      [1, 'Ingeniería de Sistemas', 1, 1],
      [2, 'Psicología', 2, 1],
      [3, 'Derecho', 2, null],
      [4, 'Licenciatura en Educación Infantil', 3, null],
      [5, 'Contaduria', 4, null]
    ];
    for (const [id, name, facId, modId] of programs) {
      await client.query(`
        INSERT INTO public.programs (program_id, name, faculty_id, modality_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (program_id) DO UPDATE SET name = $2, faculty_id = $3, modality_id = $4;
      `, [id, name, facId, modId]);
    }

    // 5. Sincronizar Usuarios del Dump
    console.log('5. Sincronizando usuarios del DUMP...');
    const users = [
      ['doc001', 'Carlos Andrés Martínez', 'carlos.martinez@unicesmag.edu.co', '12345678', 1],
      ['doc002', 'Laura Marcela Rosero', 'laura.rosero@unicesmag.edu.co', '12345678', 1],
      ['doc003', 'María Fernanda Gómez', 'maria.gomez@unicesmag.edu.co', '12345678', 2],
      ['doc004', 'Jorge Andrés Rodríguez', 'jorge.rodriguez@unicesmag.edu.co', '12345678', 2],
      ['est001', 'Vanessa Katherine Criollo', 'vanessa.criollo@unicesmag.edu.co', '12345678', 1],
      ['est002', 'Cristhian Andrés García', 'cristhian.garcia@unicesmag.edu.co', '12345678', 1],
      ['est003', 'Daniel Alejandro Muñoz', 'daniel.munoz@unicesmag.edu.co', '12345678', 1],
      ['est004', 'Santiago Andrés Jojoa', 'santiago.jojoa@unicesmag.edu.co', '12345678', 1],
      ['est005', 'Camila Andrea Martínez', 'camila.martinez@unicesmag.edu.co', '12345678', 2],
      ['est006', 'Valentina Sofía Guerrero', 'valentina.guerrero@unicesmag.edu.co', '12345678', 2],
      ['est007', 'Juan Sebastián López', 'juan.lopez@unicesmag.edu.co', '12345678', 2],
      ['est008', 'Mariana Alejandra Díaz', 'mariana.diaz@unicesmag.edu.co', '12345678', 2],
      ['est009', 'Andrés Felipe Torres', 'andres.torres@unicesmag.edu.co', '12345678', 3],
      ['est010', 'Natalia Carolina Erazo', 'natalia.erazo@unicesmag.edu.co', '12345678', 4],
      ['est011', 'Mateo Alejandro Benavides', 'mateo.benavides@unicesmag.edu.co', '12345678', 5],
      ['pla001', 'Oficina de Planeación Institucional', 'planeacion@unicesmag.edu.co', '12345678', null],
      ['admin001', 'Administrador General', 'admin@unicesmag.edu.co', '12345678', 1],
      ['admin002', 'Administrador de Psicología', 'admin.psicologia@unicesmag.edu.co', '12345678', 2],
      ['doc005', 'Andrés Felipe Gómez', 'andres.gomez@unicesmag.edu.co', '123456', 1],
      ['doc006', 'María Fernanda Torres', 'maria.torres@unicesmag.edu.co', '123456', 1],
      ['doc007', 'Julián Esteban Rodríguez', 'julian.rodriguez@unicesmag.edu.co', '123456', 1],
      ['doc008', 'Natalia Andrea Pérez', 'natalia.perez@unicesmag.edu.co', '123456', 2],
      ['doc009', 'Carlos Eduardo Ramírez', 'carlos.ramirez@unicesmag.edu.co', '123456', 2],
      ['doc010', 'Diana Marcela Gómez', 'diana.gomez@unicesmag.edu.co', '123456', 2],
      ['doc011', 'Joan Carlos Benavides', 'joan.benavides@unicesmag.edu.co', '123456', 1],
      ['doc012', 'Magda Fernanda Calvache Argoty', 'magda.calvache@unicesmag.edu.co', '123456', 1],
      ['doc013', 'Omar Alexander Revelo Zambrano', 'omar.revelo@unicesmag.edu.co', '123456', 1],
      ['doc014', 'Milton Cabrera Alvarez', 'milton.cabrera@unicesmag.edu.co', '123456', 1],
      ['doc015', 'Dalila Pachajoa', 'dalila.pachajoa@unicesmag.edu.co', '123456', 1],
      ['doc016', 'Jose Luis Calpa', 'jose.calpa@unicesmag.edu.co', '123456', 1]
    ];

    for (const [id, name, email, pass, progId] of users) {
      const byId = await client.query('SELECT user_id FROM public.users WHERE user_id = $1', [id]);
      const byEmail = await client.query('SELECT user_id FROM public.users WHERE email = $1', [email]);

      if (byId.rows.length === 0 && byEmail.rows.length === 0) {
        await client.query(`
          INSERT INTO public.users (user_id, full_name, email, password, program_id)
          VALUES ($1, $2, $3, $4, $5)
        `, [id, name, email, pass, progId]);
      } else if (byId.rows.length > 0) {
        await client.query(`
          UPDATE public.users 
          SET full_name = $1, email = $2, password = $3, program_id = $4
          WHERE user_id = $5
        `, [name, email, pass, progId, id]);
      } else if (byEmail.rows.length > 0) {
        const existingId = byEmail.rows[0].user_id;
        await client.query(`
          UPDATE public.users 
          SET full_name = $1, password = $2, program_id = $3
          WHERE user_id = $4
        `, [name, pass, progId, existingId]);
      }
    }

    // 6. Sincronizar User Roles
    console.log('6. Asignando roles de usuario...');
    const userRoles = [
      ['admin001', 1], ['doc001', 2], ['doc002', 2], ['doc003', 2], ['doc004', 2],
      ['est001', 3], ['est002', 3], ['est003', 3], ['est004', 3], ['est005', 3],
      ['est006', 3], ['est007', 3], ['est008', 3], ['est009', 3], ['est010', 3],
      ['est011', 3], ['pla001', 4], ['admin002', 1], ['doc005', 2], ['doc006', 2],
      ['doc007', 2], ['doc008', 2], ['doc009', 2], ['doc010', 2], ['doc011', 2],
      ['doc012', 2], ['doc013', 2], ['doc014', 2], ['doc015', 2], ['doc016', 2]
    ];

    for (const [uId, rId] of userRoles) {
      const dumpUser = users.find(u => u[0] === uId);
      const emailMatch = dumpUser ? dumpUser[2] : null;
      const userRes = await client.query('SELECT user_id FROM public.users WHERE user_id = $1 OR email = $2', [uId, emailMatch]);

      if (userRes.rows.length > 0) {
        const targetId = userRes.rows[0].user_id;
        await client.query(`
          INSERT INTO public.user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, role_id) DO NOTHING;
        `, [targetId, rId]);
      }
    }

    // 7. Sincronizar Banco de Proyectos (Project Bank)
    console.log('7. Insertando registros en el Banco de Proyectos (project_bank)...');
    const projectBankData = [
      [1, 'Plataforma IoT y Visión Artificial para Monitoreo de Cultivos en Nariño', 'Diseño e implementación de una solución tecnológica integrada que combine sensores ambientales IoT y modelos de visión por computador para detectar plagas tempranas y optimizar el riego en cultivos agrícolas de minifundios en el departamento de Nariño.', 'Desarrollar una plataforma inteligente de monitoreo agrícola basada en IoT y visión artificial adaptada a las condiciones agroecológicas de Nariño.', '1. Diseñar la arquitectura de nodos sensores de bajo costo para medición de variables ambientales.\n2. Entrenar un modelo de clasificación convolucional para detección de plagas foliares.\n3. Implementar un dashboard web progresivo accesible para asociaciones campesinas.', 2, 6, 1, 'IoT, Visión Artificial, Redes Neuronales, Agricultura de Precisión, Nariño', 'Proyecto con posibilidad de articulación con convocatorias del MinCiencias y asociaciones agrícolas de Pasto.', 'doc001', 'Docente', 'Disponible', null],
      [2, 'Sistema de Teleasistencia Psicológica y Triaje Emocional con Encriptación Punto a Punto', 'Aplicación segura orientada a la atención primaria en salud mental juvenil en el contexto universitario, incorporando protocolos psicométricos estandarizados y canales confidenciales de teleorientación orientados a la prevención de crisis emocionales.', 'Construir un sistema seguro de triaje y orientación psicológica remota para la comunidad universitaria de la Universidad CESMAG.', '1. Definir los flujos psicométricos de tamizaje de ansiedad y depresión validados institucionalmente.\n2. Desarrollar módulos de comunicación encriptada extremo a extremo conforme a la Ley de Protección de Datos.\n3. Evaluar la usabilidad y efectividad con profesionales del Centro de Escucha universitario.', 4, null, 2, 'Telepsicología, Salud Mental, Triaje Emocional, Privacidad de Datos, Bienestar Universitario', 'Requiere trabajo conjunto con el comité de ética y el consultorio psicológico.', 'doc003', 'Docente', 'Disponible', null],
      [3, 'Algoritmo de Optimización Heurística para Logística de Distribución Hospitalaria en Pasto', 'Modelado y desarrollo de un algoritmo de optimización de rutas y gestión de inventario crítico para la red hospitalaria de tercer y cuarto nivel en el municipio de Pasto, minimizando tiempos de entrega de medicamentos vitales.', 'Optimizar la logística de aprovisionamiento de medicamentos esenciales en centros hospitalarios mediante algoritmos metaheurísticos.', '1. Modelar matemáticamente el problema de enrutamiento vehicular con ventanas de tiempo (VRPTW) del sector salud local.\n2. Implementar un algoritmo genético híbrido para la asignación dinámica de rutas.\n3. Validar con datos históricos de despachos y simular escenarios de contingencia vial.', 1, 1, 1, 'Optimización, Metaheurísticas, Algoritmos Genéticos, Logística Hospitalaria, Smart Cities', 'Idea orientada a trabajo interdisciplinar con ingeniería industrial y biomédica.', 'doc002', 'Docente', 'Asignado', 'est003'],
      [4, 'Arquitectura Segura Zero-Trust y Detección de Amenazas en Entornos Académicos', 'Propuesta e implementación de un modelo de ciberseguridad basado en Zero-Trust y análisis de comportamiento de red mediante aprendizaje no supervisado, protegiendo repositorios institucionales y sistemas de calificaciones.', 'Implementar un prototipo de arquitectura Zero-Trust con capacidades de detección automática de anomalías en infraestructuras universitarias.', '1. Evaluar vectores de ataque frecuentes en servidores y plataformas LMS.\n2. Desplegar micro-segmentación de red y autenticación multifactor continua.\n3. Integrar un motor de detección de anomalías basado en Isolation Forest.', 3, 9, 1, 'Zero Trust, Ciberseguridad, Machine Learning, Detección de Intrusiones, SIEM', 'Propuesto desde la coordinación de tecnología institucional para fortalecimiento de la infraestructura.', 'admin001', 'Administrador', 'Disponible', null],
      [5, 'Impacto Psicosocial del Uso Excesivo de Redes Sociales en Estudiantes de Secundaria', 'Investigación empírica sobre los patrones de uso de plataformas digitales, autoconcepto, ansiedad social y rendimiento académico en adolescentes de grados décimo y once de colegios públicos de Pasto.', 'Analizar la correlación entre la hiperconectividad digital y los indicadores de bienestar psicosocial en población adolescente.', '1. Aplicar escalas estandarizadas de adicción a redes e imagen corporal.\n2. Conducir grupos focales para explorar vivencias de ciberacoso y comparación social.\n3. Elaborar una guía psicoeducativa de prevención dirigida a docentes y orientadores escolares.', 5, null, 2, 'Psicología Social, Adolescencia, Redes Sociales, Salud Mental, Educación', 'Convenio activo con la Secretaría de Educación para acceso a las instituciones educativas.', 'doc003', 'Docente', 'Asignado', 'est005'],
      [6, 'Microservicios Basados en Blockchain para Trazabilidad de Certificados Académicos', 'Desarrollo de un sistema de registro distribuido (DLT) y credenciales verificables según el estándar W3C para evitar la falsificación y agilizar la verificación instantánea de actas de grado y diplomas universitarios.', 'Construir un ecosistema descentralizado de verificación y emisión de certificados académicos mediante contratos inteligentes.', '1. Diseñar el contrato inteligente ERC-721/Soulbound para diplomas inmutables.\n2. Construir una API REST y microservicio de notarización criptográfica.\n3. Desarrollar un portal público de validación por código QR sin intermediarios.', 1, 2, 1, 'Blockchain, Web3, Smart Contracts, Credenciales Verificables, Identidad Digital', 'Idea aprobada previamente por el Comité de Investigaciones en estado inactivo por actualización de especificación.', 'admin001', 'Administrador', 'Inactivo', null],
      [7, 'Estrategias de Intervención Psicoeducativa para la Deserción Universitaria Temprana', 'Diseño y validación de un programa de mentoría y fortalecimiento de habilidades blandas dirigido a estudiantes de primeros semestres identificados con alto riesgo de abandono escolar.', 'Diseñar un modelo psicoeducativo preventivo de la deserción universitaria en la Universidad CESMAG.', '1. Caracterizar factores sociodemográficos y motivacionales asociados a la deserción temprana.\n2. Estructurar talleres de autorregulación emocional y técnicas de estudio.\n3. Medir el impacto en retención y autoeficacia percibida.', 6, null, 2, 'Deserción Estudiantil, Retención Académica, Autoeficacia, Orientación Vocacional, Pedagogía', 'Propuesta liderada desde la decanatura de ciencias sociales.', 'admin002', 'Administrador', 'Disponible', null],
      [8, 'Sistema Avanzado de Detección de Phishing con Transformers (Actualizado)', 'Descripción actualizada con técnicas ensemble y validación cruzada.', 'Construir un detector de correos fraudulentos de alta precisión.', '1. Recolectar corpus de correos en español.\n2. Entrenar y evaluar modelo.\n3. Implementar plugin para clientes de correo.', 3, 9, 1, 'NLP, Ciberseguridad, Phishing, Transformers', 'Idea de prueba automatizada', 'doc001', 'Docente', 'Asignado', 'est002']
    ];

    for (const [pbId, title, desc, genObj, specObj, rLine, rSub, progId, kw, obs, propId, propRole, status, studentId] of projectBankData) {
      const dumpProp = users.find(u => u[0] === propId);
      const propRes = await client.query('SELECT user_id FROM public.users WHERE user_id = $1 OR email = $2', [propId, dumpProp ? dumpProp[2] : null]);
      const actualPropId = propRes.rows.length > 0 ? propRes.rows[0].user_id : propId;

      let actualStudentId = null;
      if (studentId) {
        const dumpStud = users.find(u => u[0] === studentId);
        const studRes = await client.query('SELECT user_id FROM public.users WHERE user_id = $1 OR email = $2', [studentId, dumpStud ? dumpStud[2] : null]);
        actualStudentId = studRes.rows.length > 0 ? studRes.rows[0].user_id : studentId;
      }

      await client.query(`
        INSERT INTO public.project_bank (
          project_bank_id, title, description, general_objective, specific_objectives,
          research_line_id, research_subline_id, program_id, keywords, observations,
          proposer_id, proposer_role, status, assigned_student_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (project_bank_id) DO UPDATE SET
          title = $2, description = $3, general_objective = $4, specific_objectives = $5,
          research_line_id = $6, research_subline_id = $7, program_id = $8, keywords = $9,
          observations = $10, proposer_id = $11, proposer_role = $12, status = $13, assigned_student_id = $14;
      `, [pbId, title, desc, genObj, specObj, rLine, rSub, progId, kw, obs, actualPropId, propRole, status, actualStudentId]);
    }

    await client.query('COMMIT');
    console.log('\n✨ Transacción completada con ÉXITO.');

    // Conteo y verificación
    const userCount = await pool.query('SELECT COUNT(*) FROM public.users');
    const pbCount = await pool.query('SELECT COUNT(*) FROM public.project_bank');
    const degCount = await pool.query('SELECT COUNT(*) FROM public.degree_options');

    console.log('\n📊 VERIFICACIÓN FINAL DE DATOS SINCRONIZADOS:');
    console.log(`- Usuarios totales en BD: ${userCount.rows[0].count}`);
    console.log(`- Registros en Banco de Proyectos (project_bank): ${pbCount.rows[0].count}`);
    console.log(`- Opciones de grado (degree_options): ${degCount.rows[0].count}`);

    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en sincronización:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

syncDatabaseDump();
