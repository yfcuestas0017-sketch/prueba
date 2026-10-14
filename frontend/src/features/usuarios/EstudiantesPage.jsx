import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  BadgeInfo,
  Check,
  FileSpreadsheet,
  Search,
  Upload,
  UsersRound,
} from 'lucide-react';
import JSZip from 'jszip';
import DashboardLayout from '../../components/layout/DashboardLayout';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { userIsGeneralAdmin } from '../../lib/roles';
import { normalizeImportHeader, readFirstWorksheet } from '../../lib/xlsxImport';
import './EstudiantesPage.css';

const IMPORT_COLUMNS = ['full_name', 'email', 'program_name', 'semester_number'];

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
}

async function downloadStudentTemplate(programName) {
  const zip = new JSZip();
  const columns = [
    { label: 'full_name', width: 34 },
    { label: 'email', width: 38 },
    { label: 'program_name', width: 34 },
    { label: 'semester_number', width: 22 },
  ];
  const example = ['Nombre completo de ejemplo', 'estudiante@universidad.edu.co', programName || 'Nombre del programa', 8];
  const columnName = (index) => {
    let value = index + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  };
  const cellXml = (address, value, style) => (
    typeof value === 'number'
      ? `<c r="${address}" s="${style}"><v>${value}</v></c>`
      : `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
  );
  const headerRow = columns.map((column, index) => cellXml(`${columnName(index)}1`, column.label, 1)).join('');
  const exampleRow = example.map((value, index) => cellXml(`${columnName(index)}2`, value, 2)).join('');
const guideCell = (address, value, style) => `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
const guideRows = [
  `<row r="1" ht="38" customHeight="1">${guideCell('A1', 'GUÍA DE IMPORTACIÓN · ESTUDIANTES', 3)}</row>`,
  '<row r="2" ht="12" customHeight="1"/>',
  `<row r="3" ht="25" customHeight="1">${guideCell('A3', '01  ·  Completa el formato', 4)}</row>`,
  `<row r="4" ht="32" customHeight="1">${guideCell('A4', 'Usa la hoja “Estudiantes” y conserva los nombres de columna tal como aparecen.', 5)}</row>`,
  `<row r="5" ht="25" customHeight="1">${guideCell('A5', '02  ·  Verifica los datos', 4)}</row>`,
  `<row r="6" ht="32" customHeight="1">${guideCell('A6', 'El correo debe ser válido. El programa debe corresponder al autorizado y el semestre debe existir.', 5)}</row>`,
  `<row r="7" ht="25" customHeight="1">${guideCell('A7', '03  ·  Importa con seguridad', 4)}</row>`,
  `<row r="8" ht="46" customHeight="1">${guideCell('A8', 'Las cuentas existentes conservan sus datos y contraseña; solo cambia su semestre. Las nuevas se crean activas con clave temporal 12345678.', 5)}</row>`,
  `<row r="9" ht="30" customHeight="1">${guideCell('A9', 'Referencia de campos', 4)}</row>`,
  ...[
    'full_name  —  Nombre y apellidos del estudiante',
    'email  —  Correo institucional único',
    'program_name  —  Nombre exacto del programa académico',
    'semester_number  —  Número de semestre (por ejemplo, 8)',
  ].map((value, index) => `<row r="${index + 10}" ht="24" customHeight="1">${guideCell(`A${index + 10}`, value, 6)}</row>`),
].join('');
zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Estudiantes" sheetId="1" r:id="rId1"/><sheet name="Guía" sheetId="2" r:id="rId2"/></sheets>
</workbook>`);
zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
  <font><sz val="11"/><color rgb="FF526176"/><name val="Aptos"/></font>
  <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
  <font><i/><sz val="10"/><color rgb="FF6B7890"/><name val="Aptos"/></font>
  <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
</fonts>
<fills count="5">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF1F5BA3"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FC"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF173552"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left/><right/><top/><bottom style="thin"><color rgb="FFDCE5EF"/></bottom><diagonal/></border>
  <border><left style="thin"><color rgb="FFDCE5EF"/></left><right style="thin"><color rgb="FFDCE5EF"/></right><top/><bottom style="thin"><color rgb="FFDCE5EF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>
  <row r="1" ht="30" customHeight="1">${headerRow}</row>
  <row r="2" ht="25" customHeight="1">${exampleRow}</row>
</sheetData>
<autoFilter ref="A1:D2"/>
</worksheet>`);
zip.file('xl/worksheets/sheet2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
<cols><col min="1" max="1" width="100" customWidth="1"/></cols>
<sheetFormatPr defaultRowHeight="22"/>
<sheetData>${guideRows}</sheetData>
</worksheet>`);
const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-estudiantes.xlsx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function EstudiantesPage() {
  const { user } = useAuth();
  const isGeneralAdmin = userIsGeneralAdmin(user);
  const fileInputRef = useRef(null);
  const [catalogs, setCatalogs] = useState({ programs: [], semesters: [] });
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('all');
  const [students, setStudents] = useState([]);
  const [loadedStudentQuery, setLoadedStudentQuery] = useState('');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    api.getCatalogs()
      .then((data) => {
        if (!mounted) return;
        const programs = data.programs || [];
        setCatalogs({ programs, semesters: data.semesters || [] });
        if (!isGeneralAdmin && user?.programId) setProgramId(String(user.programId));
        else if (programs.length === 1) setProgramId(String(programs[0].program_id));
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'No fue posible cargar los programas y semestres.');
      });
    return () => { mounted = false; };
  }, [isGeneralAdmin, user?.programId]);

  const studentQuery = `${programId}:${semesterId}`;
  const loading = Boolean(programId && loadedStudentQuery !== studentQuery);

  useEffect(() => {
    if (!programId) return undefined;
    let current = true;
    const filters = { programId };
    if (semesterId !== 'all') filters.semesterId = semesterId;
    api.getAdminStudents(filters)
      .then((response) => {
        if (!current) return;
        setStudents(response.students || []);
        setLoadedStudentQuery(studentQuery);
      })
      .catch((err) => {
        if (!current) return;
        setStudents([]);
        setError(err.message || 'No fue posible cargar los estudiantes.');
        setLoadedStudentQuery(studentQuery);
      });
    return () => { current = false; };
  }, [programId, semesterId, studentQuery]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter((student) => (
      student.full_name?.toLowerCase().includes(term)
      || student.email?.toLowerCase().includes(term)
    ));
  }, [search, students]);

  const selectedProgram = catalogs.programs.find((program) => String(program.program_id) === String(programId));
  const handleDownloadTemplate = async () => {
    setError('');
    try {
      await downloadStudentTemplate(selectedProgram?.name);
    } catch (err) {
      setError(err.message || 'No fue posible generar la plantilla Excel.');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    setError('');
    setMessage('');
    setPreviewRows([]);
    setFileName('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera el límite de 10 MB.');
      event.target.value = '';
      return;
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Selecciona un archivo de Excel .xlsx o .xls.');
      event.target.value = '';
      return;
    }
    try {
      const [headerRow, ...dataRows] = await readFirstWorksheet(await file.arrayBuffer());
      const headers = (headerRow || []).map(normalizeImportHeader);
      const missing = IMPORT_COLUMNS.filter((column) => !headers.includes(column));
      if (missing.length) {
        throw new Error(`Faltan estas columnas obligatorias: ${missing.join(', ')}.`);
      }
      const parsedRows = dataRows.map((row) => Object.fromEntries(
        IMPORT_COLUMNS.map((column) => [column, row[headers.indexOf(column)] ?? '']),
      )).filter((row) => Object.values(row).some((value) => String(value).trim()));
      if (parsedRows.length === 0) throw new Error('La hoja no contiene estudiantes para importar.');
      if (parsedRows.length > 2000) throw new Error('La importación permite un máximo de 2000 estudiantes por archivo.');
      setPreviewRows(parsedRows);
      setFileName(file.name);
    } catch (err) {
      setError(err.message || 'No fue posible leer el archivo de Excel.');
      event.target.value = '';
    }
  };

  const importStudents = async () => {
    if (!previewRows.length) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const result = await api.importAdminStudents(previewRows);
      const promotionMessage = result.advancedProjects
        ? ` ${result.advancedProjects} proyecto${result.advancedProjects === 1 ? '' : 's'} avanzó${result.advancedProjects === 1 ? '' : 'aron'} de fase.`
        : '';
      setMessage(`Importación completada: ${result.created} cuentas nuevas y ${result.updated} semestres actualizados.${promotionMessage}`);
      setPreviewRows([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      const filters = { programId };
      if (semesterId !== 'all') filters.semesterId = semesterId;
      const response = await api.getAdminStudents(filters);
      setStudents(response.students || []);
      setLoadedStudentQuery(studentQuery);
    } catch (err) {
      setError(err.message || 'No fue posible importar los estudiantes.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <DashboardLayout title="Estudiantes" subtitle="Consulta académica e importación por programa">
      <main className="students-page">
        {error && <div className="students-notice students-notice--error" role="alert">{error}</div>}
        {message && <div className="students-notice students-notice--success" role="status">{message}</div>}

        <section className="students-import-panel">
          <div className="students-import-intro">
            <div className="students-import-icon"><Upload size={19} /></div>
            <div>
              <span className="students-kicker">Carga por lotes</span>
              <h2>Importar estudiantes</h2>
              <p>Las cuentas existentes conservan su contraseña y datos personales: solo se actualiza el semestre. Las nuevas se crean activas con clave temporal <code>12345678</code>.</p>
            </div>
          </div>
          <div className="students-import-controls">
            <Button variant="outline" icon={ArrowDownToLine} onClick={handleDownloadTemplate} disabled={!programId}>
              Descargar plantilla
            </Button>
            <input
              ref={fileInputRef}
              className="students-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              aria-label="Seleccionar archivo Excel de estudiantes"
            />
            <Button variant="primary" icon={FileSpreadsheet} onClick={() => fileInputRef.current?.click()}>
              Elegir Excel
            </Button>
          </div>
          <div className="students-import-schema">
            <div className="students-schema-heading"><BadgeInfo size={16} /><strong>Formato requerido del archivo</strong><span>4 columnas obligatorias</span></div>
            <div className="students-schema-columns">
              {[
                { key: 'full_name', description: 'Nombres y apellidos' },
                { key: 'email', description: 'Correo institucional' },
                { key: 'program_name', description: 'Nombre del programa' },
                { key: 'semester_number', description: 'Número de semestre' },
              ].map((column) => (
                <div className="students-schema-column" key={column.key}>
                  <code>{column.key}</code>
                  <small>{column.description}</small>
                  <Check size={14} aria-hidden="true" />
                </div>
              ))}
            </div>
            <small className="students-schema-note">La cuenta nueva queda activa por defecto. Si ya existe, se actualiza solo su semestre.</small>
          </div>
          {fileName && (
            <div className="students-preview">
              <div className="students-preview-heading">
                <div><strong>{fileName}</strong><span>{previewRows.length} registros listos para validar e importar</span></div>
                <Button variant="primary" loading={importing} disabled={importing} onClick={importStudents}>
                  Importar {previewRows.length}
                </Button>
              </div>
              <div className="students-preview-list">
                {previewRows.slice(0, 4).map((row, index) => (
                  <div key={`${row.email}-${index}`}>
                    <span>{row.full_name || 'Nombre pendiente'}</span>
                    <small>{row.email || 'Correo pendiente'}</small>
                    <small>{row.program_name || 'Programa pendiente'} · Semestre {row.semester_number || '—'}°</small>
                  </div>
                ))}
                {previewRows.length > 4 && <span className="students-preview-more">y {previewRows.length - 4} estudiantes más…</span>}
              </div>
            </div>
          )}
        </section>

        <section className="students-roster">
          <header className="students-roster-header">
            <div>
              <span className="students-kicker">Directorio del programa</span>
              <h2>Listado de estudiantes</h2>
              <p>{selectedProgram?.name || (programId ? 'Programa académico' : 'Selecciona un programa para consultar su listado')}</p>
            </div>
            <div className="students-total">
              <UsersRound size={18} />
              <strong>{loading ? '—' : visibleStudents.length}</strong>
              <span>{semesterId === 'all' ? 'en el programa' : 'en el semestre'}</span>
            </div>
          </header>

          <div className="students-filters">
            {isGeneralAdmin && (
              <label>
                <span>Programa</span>
                <select value={programId} onChange={(event) => { setError(''); setProgramId(event.target.value); }}>
                  <option value="">Selecciona programa</option>
                  {catalogs.programs.map((program) => <option key={program.program_id} value={program.program_id}>{program.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Semestre</span>
              <select value={semesterId} onChange={(event) => { setError(''); setSemesterId(event.target.value); }}>
                <option value="all">Todos los semestres</option>
                {catalogs.semesters.map((semester) => (
                  <option key={semester.semester_id} value={semester.semester_id}>{semester.semester_number}° semestre</option>
                ))}
              </select>
            </label>
            <label className="students-search">
              <span>Buscar estudiante</span>
              <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o correo institucional" /></div>
            </label>
          </div>

          <div className="students-table-wrap">
            <table className="students-table">
              <thead><tr><th>Estudiante</th><th>Correo</th><th>Semestre</th><th>Proyectos</th><th>Cuenta</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr className="students-table-message-row"><td colSpan="5" className="students-empty">Cargando estudiantes…</td></tr>
                ) : visibleStudents.length ? visibleStudents.map((student) => (
                  <tr key={student.user_id}>
                    <td><div className="students-person"><span>{student.full_name?.charAt(0)?.toUpperCase() || 'E'}</span><strong>{student.full_name}</strong></div></td>
                    <td data-label="Correo">{student.email}</td>
                    <td data-label="Semestre">{student.semester_number ? <span className="students-semester">{student.semester_number}° semestre</span> : <span className="students-muted">Sin semestre</span>}</td>
                    <td data-label="Proyectos">{student.project_count || 0}</td>
                    <td data-label="Cuenta"><span className={`students-account${student.is_active ? '' : ' students-account--inactive'}`}>{student.is_active ? 'Activa' : 'Inactiva'}</span></td>
                  </tr>
                )) : (
                  <tr className="students-table-message-row"><td colSpan="5" className="students-empty">{programId ? 'No hay estudiantes que coincidan con este filtro.' : 'Selecciona un programa para cargar estudiantes.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}

export default EstudiantesPage;
