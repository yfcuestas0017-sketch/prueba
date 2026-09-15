--
-- PostgreSQL database dump adjustments for BaseDatosGrado
--

-- 1. FUNCTIONS & TRIGGERS
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

ALTER FUNCTION public.log_project_field_changes() OWNER TO postgres;

-- 2. SEQUENCES & TABLES
CREATE TABLE IF NOT EXISTS public.degree_options (
    degree_option_id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text
);

CREATE SEQUENCE IF NOT EXISTS public.degree_options_degree_option_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.degree_options_degree_option_id_seq OWNED BY public.degree_options.degree_option_id;

CREATE TABLE IF NOT EXISTS public.project_bank (
    project_bank_id integer NOT NULL,
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
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.project_bank_project_bank_id_seq OWNED BY public.project_bank.project_bank_id;

CREATE TABLE IF NOT EXISTS public.project_bank_histories (
    project_bank_history_id integer NOT NULL,
    project_bank_id integer NOT NULL,
    user_id character varying(50) NOT NULL,
    action character varying(50) NOT NULL,
    previous_status character varying(50),
    new_status character varying(50),
    changes jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS public.project_bank_histories_project_bank_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.project_bank_histories_project_bank_history_id_seq OWNED BY public.project_bank_histories.project_bank_history_id;

-- 3. COLUMN ADDITIONS
ALTER TABLE public.histories ADD COLUMN IF NOT EXISTS user_id character varying(100);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS degree_option_id integer;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS modality_id integer;

-- 4. CONSTRAINTS & KEYS (Execute BEFORE inserts so ON CONFLICT works)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'degree_options_pkey') THEN
        ALTER TABLE ONLY public.degree_options ADD CONSTRAINT degree_options_pkey PRIMARY KEY (degree_option_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_bank_pkey') THEN
        ALTER TABLE ONLY public.project_bank ADD CONSTRAINT project_bank_pkey PRIMARY KEY (project_bank_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_bank_histories_pkey') THEN
        ALTER TABLE ONLY public.project_bank_histories ADD CONSTRAINT project_bank_histories_pkey PRIMARY KEY (project_bank_history_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_roles_user_id_role_id') THEN
        ALTER TABLE ONLY public.user_roles ADD CONSTRAINT uq_user_roles_user_id_role_id UNIQUE (user_id, role_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_degree_option_id_fkey') THEN
        ALTER TABLE ONLY public.projects ADD CONSTRAINT projects_degree_option_id_fkey FOREIGN KEY (degree_option_id) REFERENCES public.degree_options(degree_option_id);
    END IF;
END $$;

-- 5. DATA INSERTS: degree_options
INSERT INTO public.degree_options (degree_option_id, name, description) VALUES
(1, 'Coterminalidad', 'Opción de grado mediante coterminalidad'),
(2, 'Artículo', 'Opción de grado mediante elaboración y presentación de artículo'),
(3, 'Proyecto de Grado', 'Opción de grado mediante desarrollo y presentación de proyecto de grado')
ON CONFLICT (degree_option_id) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 6. DATA INSERTS: faculties
INSERT INTO public.faculties (faculty_id, name) VALUES
(1, 'Facultad de Ingeniería'),
(2, 'Facultad de Ciencias Sociales y Humanas'),
(3, 'Facultad de Educación'),
(4, 'Facultad de Ciencias de la Salud')
ON CONFLICT (faculty_id) DO UPDATE SET name = EXCLUDED.name;

-- 7. DATA INSERTS: programs
INSERT INTO public.programs (program_id, name, faculty_id, modality_id) VALUES
(1, 'Ingeniería de Sistemas', 1, 1),
(2, 'Psicología', 2, 1),
(3, 'Derecho', 2, NULL),
(4, 'Licenciatura en Educación Infantil', 3, NULL),
(5, 'Contaduria', 4, NULL)
ON CONFLICT (program_id) DO UPDATE 
SET name = EXCLUDED.name, faculty_id = EXCLUDED.faculty_id, modality_id = EXCLUDED.modality_id;

-- 8. DATA INSERTS: users
INSERT INTO public.users (user_id, full_name, email, password, program_id) VALUES
('doc001', 'Carlos Andrés Martínez', 'carlos.martinez@unicesmag.edu.co', '12345678', 1),
('doc002', 'Laura Marcela Rosero', 'laura.rosero@unicesmag.edu.co', '12345678', 1),
('doc003', 'María Fernanda Gómez', 'maria.gomez@unicesmag.edu.co', '12345678', 2),
('doc004', 'Jorge Andrés Rodríguez', 'jorge.rodriguez@unicesmag.edu.co', '12345678', 2),
('est001', 'Vanessa Katherine Criollo', 'vanessa.criollo@unicesmag.edu.co', '12345678', 1),
('est002', 'Cristhian Andrés García', 'cristhian.garcia@unicesmag.edu.co', '12345678', 1),
('est003', 'Daniel Alejandro Muñoz', 'daniel.munoz@unicesmag.edu.co', '12345678', 1),
('est004', 'Santiago Andrés Jojoa', 'santiago.jojoa@unicesmag.edu.co', '12345678', 1),
('est005', 'Camila Andrea Martínez', 'camila.martinez@unicesmag.edu.co', '12345678', 2),
('est006', 'Valentina Sofía Guerrero', 'valentina.guerrero@unicesmag.edu.co', '12345678', 2),
('est007', 'Juan Sebastián López', 'juan.lopez@unicesmag.edu.co', '12345678', 2),
('est008', 'Mariana Alejandra Díaz', 'mariana.diaz@unicesmag.edu.co', '12345678', 2),
('est009', 'Andrés Felipe Torres', 'andres.torres@unicesmag.edu.co', '12345678', 3),
('est010', 'Natalia Carolina Erazo', 'natalia.erazo@unicesmag.edu.co', '12345678', 4),
('est011', 'Mateo Alejandro Benavides', 'mateo.benavides@unicesmag.edu.co', '12345678', 5),
('pla001', 'Oficina de Planeación Institucional', 'planeacion@unicesmag.edu.co', '12345678', NULL),
('admin001', 'Administrador General', 'admin@unicesmag.edu.co', '12345678', 1),
('admin002', 'Administrador de Psicología', 'admin.psicologia@unicesmag.edu.co', '12345678', 2),
('doc005', 'Andrés Felipe Gómez', 'andres.gomez@unicesmag.edu.co', '123456', 1),
('doc006', 'María Fernanda Torres', 'maria.torres@unicesmag.edu.co', '123456', 1),
('doc007', 'Julián Esteban Rodríguez', 'julian.rodriguez@unicesmag.edu.co', '123456', 1),
('doc008', 'Natalia Andrea Pérez', 'natalia.perez@unicesmag.edu.co', '123456', 2),
('doc009', 'Carlos Eduardo Ramírez', 'carlos.ramirez@unicesmag.edu.co', '123456', 2),
('doc010', 'Diana Marcela Gómez', 'diana.gomez@unicesmag.edu.co', '123456', 2),
('doc011', 'Joan Carlos Benavides', 'joan.benavides@unicesmag.edu.co', '123456', 1),
('doc012', 'Magda Fernanda Calvache Argoty', 'magda.calvache@unicesmag.edu.co', '123456', 1),
('doc013', 'Omar Alexander Revelo Zambrano', 'omar.revelo@unicesmag.edu.co', '123456', 1),
('doc014', 'Milton Cabrera Alvarez', 'milton.cabrera@unicesmag.edu.co', '123456', 1),
('doc015', 'Dalila Pachajoa', 'dalila.pachajoa@unicesmag.edu.co', '123456', 1),
('doc016', 'Jose Luis Calpa', 'jose.calpa@unicesmag.edu.co', '123456', 1)
ON CONFLICT (email) DO UPDATE 
SET full_name = EXCLUDED.full_name, password = EXCLUDED.password, program_id = EXCLUDED.program_id;

-- 9. DATA INSERTS: user_roles
INSERT INTO public.user_roles (user_id, role_id) VALUES
('admin001', 1),
('doc001', 2),
('doc002', 2),
('doc003', 2),
('doc004', 2),
('est001', 3),
('est002', 3),
('est003', 3),
('est004', 3),
('est005', 3),
('est006', 3),
('est007', 3),
('est008', 3),
('est009', 3),
('est010', 3),
('est011', 3),
('pla001', 4),
('admin002', 1),
('doc005', 2),
('doc006', 2),
('doc007', 2),
('doc008', 2),
('doc009', 2),
('doc010', 2),
('doc011', 2),
('doc012', 2),
('doc013', 2),
('doc014', 2),
('doc015', 2),
('doc016', 2)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 10. DATA INSERTS: research_lines
INSERT INTO public.research_lines (research_line_id, name, description, program_id) VALUES
(1, 'Desarrollo de Software y Sistemas de Información', 'Investigación relacionada con el análisis, diseño, desarrollo, implementación y evaluación de soluciones de software y sistemas de información.', 1),
(2, 'Inteligencia Artificial y Ciencia de Datos', 'Investigación relacionada con inteligencia artificial, aprendizaje automático, análisis de datos y aplicación de técnicas computacionales para la solución de problemas.', 1),
(3, 'Seguridad Informática', 'Investigación relacionada con ciberseguridad, seguridad de aplicaciones, protección de información y gestión de riesgos tecnológicos.', 1),
(4, 'Psicología Clínica y de la Salud', 'Investigación relacionada con salud mental, evaluación psicológica, prevención e intervención psicológica.', 2),
(5, 'Psicología Social y Comunitaria', 'Investigación relacionada con comportamiento social, relaciones interpersonales, intervención comunitaria y bienestar.', 2),
(6, 'Psicología Educativa', 'Investigación relacionada con procesos de aprendizaje, desarrollo humano y fenómenos psicológicos presentes en contextos educativos.', 2)
ON CONFLICT (research_line_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, program_id = EXCLUDED.program_id;

-- 11. DATA INSERTS: project_bank
INSERT INTO public.project_bank (project_bank_id, title, description, general_objective, specific_objectives, research_line_id, research_subline_id, program_id, keywords, observations, proposer_id, proposer_role, status, assigned_student_id, assigned_at, created_at, updated_at) VALUES
(1, 'Plataforma IoT y Visión Artificial para Monitoreo de Cultivos en Nariño', 'Diseño e implementación de una solución tecnológica integrada que combine sensores ambientales IoT y modelos de visión por computador para detectar plagas tempranas y optimizar el riego en cultivos agrícolas de minifundios en el departamento de Nariño.', 'Desarrollar una plataforma inteligente de monitoreo agrícola basada en IoT y visión artificial adaptada a las condiciones agroecológicas de Nariño.', '1. Diseñar la arquitectura de nodos sensores de bajo costo para medición de variables ambientales.
2. Entrenar un modelo de clasificación convolucional para detección de plagas foliares.
3. Implementar un dashboard web progresivo accesible para asociaciones campesinas.', 2, 6, 1, 'IoT, Visión Artificial, Redes Neuronales, Agricultura de Precisión, Nariño', 'Proyecto con posibilidad de articulación con convocatorias del MinCiencias y asociaciones agrícolas de Pasto.', 'doc001', 'Docente', 'Disponible', NULL, NULL, '2026-02-10 09:30:00', '2026-02-10 09:30:00'),
(2, 'Sistema de Teleasistencia Psicológica y Triaje Emocional con Encriptación Punto a Punto', 'Aplicación segura orientada a la atención primaria en salud mental juvenil en el contexto universitario, incorporando protocolos psicométricos estandarizados y canales confidenciales de teleorientación orientados a la prevención de crisis emocionales.', 'Construir un sistema seguro de triaje y orientación psicológica remota para la comunidad universitaria de la Universidad CESMAG.', '1. Definir los flujos psicométricos de tamizaje de ansiedad y depresión validados institucionalmente.
2. Desarrollar módulos de comunicación encriptada extremo a extremo conforme a la Ley de Protección de Datos.
3. Evaluar la usabilidad y efectividad con profesionales del Centro de Escucha universitario.', 4, NULL, 2, 'Telepsicología, Salud Mental, Triaje Emocional, Privacidad de Datos, Bienestar Universitario', 'Requiere trabajo conjunto con el comité de ética y el consultorio psicológico.', 'doc003', 'Docente', 'Disponible', NULL, NULL, '2026-01-22 14:15:00', '2026-01-22 14:15:00'),
(3, 'Algoritmo de Optimización Heurística para Logística de Distribución Hospitalaria en Pasto', 'Modelado y desarrollo de un algoritmo de optimización de rutas y gestión de inventario crítico para la red hospitalaria de tercer y cuarto nivel en el municipio de Pasto, minimizando tiempos de entrega de medicamentos vitales.', 'Optimizar la logística de aprovisionamiento de medicamentos esenciales en centros hospitalarios mediante algoritmos metaheurísticos.', '1. Modelar matemáticamente el problema de enrutamiento vehicular con ventanas de tiempo (VRPTW) del sector salud local.
2. Implementar un algoritmo genético híbrido para la asignación dinámica de rutas.
3. Validar con datos históricos de despachos y simular escenarios de contingencia vial.', 1, 1, 1, 'Optimización, Metaheurísticas, Algoritmos Genéticos, Logística Hospitalaria, Smart Cities', 'Idea orientada a trabajo interdisciplinar con ingeniería industrial y biomédica.', 'doc002', 'Docente', 'Asignado', 'est003', '2026-09-03 23:33:42.145777', '2026-03-01 11:00:00', '2026-09-03 23:33:42.145777'),
(4, 'Arquitectura Segura Zero-Trust y Detección de Amenazas en Entornos Académicos', 'Propuesta e implementación de un modelo de ciberseguridad basado en Zero-Trust y análisis de comportamiento de red mediante aprendizaje no supervisado, protegiendo repositorios institucionales y sistemas de calificaciones.', 'Implementar un prototipo de arquitectura Zero-Trust con capacidades de detección automática de anomalías en infraestructuras universitarias.', '1. Evaluar vectores de ataque frecuentes en servidores y plataformas LMS.
2. Desplegar micro-segmentación de red y autenticación multifactor continua.
3. Integrar un motor de detección de anomalías basado en Isolation Forest.', 3, 9, 1, 'Zero Trust, Ciberseguridad, Machine Learning, Detección de Intrusiones, SIEM', 'Propuesto desde la coordinación de tecnología institucional para fortalecimiento de la infraestructura.', 'admin001', 'Administrador', 'Disponible', NULL, NULL, '2026-02-18 16:40:00', '2026-09-03 23:22:44.207206'),
(5, 'Impacto Psicosocial del Uso Excesivo de Redes Sociales en Estudiantes de Secundaria', 'Investigación empírica sobre los patrones de uso de plataformas digitales, autoconcepto, ansiedad social y rendimiento académico en adolescentes de grados décimo y once de colegios públicos de Pasto.', 'Analizar la correlación entre la hiperconectividad digital y los indicadores de bienestar psicosocial en población adolescente.', '1. Aplicar escalas estandarizadas de adicción a redes e imagen corporal.
2. Conducir grupos focales para explorar vivencias de ciberacoso y comparación social.
3. Elaborar una guía psicoeducativa de prevención dirigida a docentes y orientadores escolares.', 5, NULL, 2, 'Psicología Social, Adolescencia, Redes Sociales, Salud Mental, Educación', 'Convenio activo con la Secretaría de Educación para acceso a las instituciones educativas.', 'doc003', 'Docente', 'Asignado', 'est005', '2026-02-28 10:20:00', '2026-01-15 08:00:00', '2026-01-15 08:00:00'),
(6, 'Microservicios Basados en Blockchain para Trazabilidad de Certificados Académicos', 'Desarrollo de un sistema de registro distribuido (DLT) y credenciales verificables según el estándar W3C para evitar la falsificación y agilizar la verificación instantánea de actas de grado y diplomas universitarios.', 'Construir un ecosistema descentralizado de verificación y emisión de certificados académicos mediante contratos inteligentes.', '1. Diseñar el contrato inteligente ERC-721/Soulbound para diplomas inmutables.
2. Construir una API REST y microservicio de notarización criptográfica.
3. Desarrollar un portal público de validación por código QR sin intermediarios.', 1, 2, 1, 'Blockchain, Web3, Smart Contracts, Credenciales Verificables, Identidad Digital', 'Idea aprobada previamente por el Comité de Investigaciones en estado inactivo por actualización de especificación.', 'admin001', 'Administrador', 'Inactivo', NULL, NULL, '2025-11-20 15:30:00', '2025-11-20 15:30:00'),
(7, 'Estrategias de Intervención Psicoeducativa para la Deserción Universitaria Temprana', 'Diseño y validación de un programa de mentoría y fortalecimiento de habilidades blandas dirigido a estudiantes de primeros semestres identificados con alto riesgo de abandono escolar.', 'Diseñar un modelo psicoeducativo preventivo de la deserción universitaria en la Universidad CESMAG.', '1. Caracterizar factores sociodemográficos y motivacionales asociados a la deserción temprana.
2. Estructurar talleres de autorregulación emocional y técnicas de estudio.
3. Medir el impacto en retención y autoeficacia percibida.', 6, NULL, 2, 'Deserción Estudiantil, Retención Académica, Autoeficacia, Orientación Vocacional, Pedagogía', 'Propuesta liderada desde la decanatura de ciencias sociales.', 'admin002', 'Administrador', 'Disponible', NULL, NULL, '2026-02-05 10:00:00', '2026-02-05 10:00:00'),
(8, 'Sistema Avanzado de Detección de Phishing con Transformers (Actualizado)', 'Descripción actualizada con técnicas ensemble y validación cruzada.', 'Construir un detector de correos fraudulentos de alta precisión.', '1. Recolectar corpus de correos en español.
2. Entrenar y evaluar modelo.
3. Implementar plugin para clientes de correo.', 3, 9, 1, 'NLP, Ciberseguridad, Phishing, Transformers', 'Idea de prueba automatizada', 'doc001', 'Docente', 'Asignado', 'est002', '2026-09-03 23:21:12.07352', '2026-09-03 23:21:12.050892', '2026-09-03 23:21:12.07352')
ON CONFLICT (project_bank_id) DO UPDATE
SET title = EXCLUDED.title, description = EXCLUDED.description, general_objective = EXCLUDED.general_objective, specific_objectives = EXCLUDED.specific_objectives, research_line_id = EXCLUDED.research_line_id, research_subline_id = EXCLUDED.research_subline_id, program_id = EXCLUDED.program_id, keywords = EXCLUDED.keywords, observations = EXCLUDED.observations, proposer_id = EXCLUDED.proposer_id, proposer_role = EXCLUDED.proposer_role, status = EXCLUDED.status, assigned_student_id = EXCLUDED.assigned_student_id;
