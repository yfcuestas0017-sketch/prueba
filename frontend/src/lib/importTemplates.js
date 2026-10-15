/**
 * GENERADOR DE PLANTILLAS DE IMPORTACIÓN (XLSX)
 * UNIVERSIDAD CESMAG
 *
 * Construye libros de Excel con:
 *  - Hoja de datos con título institucional, encabezados en español y
 *    filas preformateadas.
 *  - Validaciones nativas de Excel: listas desplegables (programa, semestre),
 *    formato de correo y correos no repetidos dentro del archivo.
 *  - Hoja "Guía" con pasos, descripción de cada campo y un ejemplo.
 *  - Hoja oculta "Listas" que alimenta los desplegables.
 *
 * No incluye filas de ejemplo en la hoja de datos: así no se importan por
 * error registros ficticios.
 */
import JSZip from 'jszip';

const DATA_START_ROW = 5;      // primera fila de datos (1-indexada)
const STYLED_ROWS = 300;       // filas con borde y formato visibles
const VALIDATED_ROWS = 2000;   // filas cubiertas por validaciones (límite de importación)

const S = {
  default: 0,
  title: 1,
  subtitle: 2,
  header: 3,
  cell: 4,
  sectionHeading: 5,
  body: 6,
  fieldName: 7,
  fieldText: 8,
  example: 9,
  listHeader: 10,
  headerOptional: 11,
};

function xmlEscape(value) {
  return String(value ?? '').replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
}

function columnLetter(index) {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function textCell(address, value, style) {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function valueCell(address, value, style) {
  if (value === '' || value === null || value === undefined) return `<c r="${address}" s="${style}"/>`;
  return typeof value === 'number'
    ? `<c r="${address}" s="${style}"><v>${value}</v></c>`
    : textCell(address, value, style);
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
  <font><sz val="11"/><color rgb="FF1F2A3D"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  <font><i/><sz val="10"/><color rgb="FFDCE6F2"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="12"/><color rgb="FF173552"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="11"/><color rgb="FF1F5BA3"/><name val="Calibri"/><family val="2"/></font>
  <font><i/><sz val="10"/><color rgb="FF6B7890"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="7">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF173552"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF1F5BA3"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FC"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF5A7FA8"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left style="thin"><color rgb="FFDCE5EF"/></left><right style="thin"><color rgb="FFDCE5EF"/></right><top style="thin"><color rgb="FFDCE5EF"/></top><bottom style="thin"><color rgb="FFDCE5EF"/></bottom><diagonal/></border>
  <border><left/><right/><top/><bottom style="medium"><color rgb="FF1F5BA3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
  <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>
  <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Construye la validación de Excel para una columna.
 * `lists` contiene { programs: { ref }, semesters: { ref } } con el rango en la hoja oculta.
 */
function buildValidation(column, letter, lists) {
  const first = DATA_START_ROW;
  const last = DATA_START_ROW + VALIDATED_ROWS - 1;
  const sqref = `${letter}${first}:${letter}${last}`;
  const cell = `${letter}${first}`;
  const prompt = column.prompt
    ? ` showInputMessage="1" promptTitle="${xmlEscape(column.header.slice(0, 32))}" prompt="${xmlEscape(column.prompt.slice(0, 250))}"`
    : '';
  const error = (title, message) => ` showErrorMessage="1" errorStyle="stop" errorTitle="${xmlEscape(title.slice(0, 32))}" error="${xmlEscape(message.slice(0, 250))}"`;

  switch (column.validation) {
    case 'name':
      return `<dataValidation type="textLength" operator="between" allowBlank="1"${prompt}${error('Nombre inválido', 'Escribe nombres y apellidos completos (entre 3 y 255 caracteres).')} sqref="${sqref}"><formula1>3</formula1><formula2>255</formula2></dataValidation>`;
    case 'email': {
      const range = `$${letter}$${first}:$${letter}$${last}`;
      const formula = `AND(ISERROR(FIND(" ",${cell})),LEN(${cell})-LEN(SUBSTITUTE(${cell},"@",""))=1,ISNUMBER(FIND(".",${cell},FIND("@",${cell}))),COUNTIF(${range},${cell})=1)`;
      return `<dataValidation type="custom" allowBlank="1"${prompt}${error('Correo inválido', 'Ingresa un correo válido, sin espacios y que no esté repetido en el archivo.')} sqref="${sqref}"><formula1>${xmlEscape(formula)}</formula1></dataValidation>`;
    }
    case 'program':
      if (!lists.programs) return '';
      return `<dataValidation type="list" allowBlank="1"${prompt}${error('Programa no válido', 'Selecciona el programa desde la lista desplegable.')} sqref="${sqref}"><formula1>${lists.programs.ref}</formula1></dataValidation>`;
    case 'semester':
      if (!lists.semesters) return '';
      return `<dataValidation type="list" allowBlank="1"${prompt}${error('Semestre no válido', 'Selecciona un semestre existente desde la lista desplegable.')} sqref="${sqref}"><formula1>${lists.semesters.ref}</formula1></dataValidation>`;
    default:
      return '';
  }
}

/**
 * @param {object} config
 * @param {string} config.sheetName   Nombre de la hoja de datos (ej. "Estudiantes").
 * @param {string} config.title       Título que aparece en la fila 1.
 * @param {string} config.subtitle    Indicaciones breves (fila 2).
 * @param {Array}  config.columns     [{ header, width, required, validation, prompt, description, example }]
 * @param {Array}  config.programs    Nombres de programas para el desplegable.
 * @param {Array}  config.semesters   Números de semestre para el desplegable.
 * @param {Array}  config.steps       Pasos de la guía.
 * @param {Array}  config.notes       Notas importantes de la guía.
 * @returns {Promise<Blob>}
 */
export async function buildImportTemplate(config) {
  const {
    sheetName = 'Datos',
    title = 'PLANTILLA DE IMPORTACIÓN',
    subtitle = '',
    columns = [],
    programs = [],
    semesters = [],
    steps = [],
    notes = [],
    outputType = (typeof Blob !== 'undefined' ? 'blob' : 'nodebuffer'),
  } = config;
  const lastLetter = columnLetter(Math.max(columns.length - 1, 0));

  // ── Hoja oculta de listas ────────────────────────────────────────────────
  const lists = {};
  const listRows = [];
  const maxListLength = Math.max(programs.length, semesters.length);
  listRows.push(`<row r="1">${textCell('A1', 'Programas', S.listHeader)}${textCell('B1', 'Semestres', S.listHeader)}</row>`);
  for (let index = 0; index < maxListLength; index += 1) {
    const rowNumber = index + 2;
    const cells = [];
    if (programs[index] !== undefined) cells.push(textCell(`A${rowNumber}`, programs[index], S.default));
    if (semesters[index] !== undefined) cells.push(valueCell(`B${rowNumber}`, Number(semesters[index]), S.default));
    listRows.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  }
  if (programs.length) lists.programs = { ref: `Listas!$A$2:$A$${programs.length + 1}` };
  if (semesters.length) lists.semesters = { ref: `Listas!$B$2:$B$${semesters.length + 1}` };

  // ── Hoja de datos ────────────────────────────────────────────────────────
  const headerRow = columns
    .map((column, index) => textCell(`${columnLetter(index)}4`, `${column.header}${column.required ? ' *' : ''}`, column.required ? S.header : S.headerOptional))
    .join('');
  const dataRows = [];
  for (let offset = 0; offset < STYLED_ROWS; offset += 1) {
    const rowNumber = DATA_START_ROW + offset;
    const cells = columns.map((_, index) => `<c r="${columnLetter(index)}${rowNumber}" s="${S.cell}"/>`).join('');
    dataRows.push(`<row r="${rowNumber}" ht="20" customHeight="1">${cells}</row>`);
  }
  const titleCells = columns.map((_, index) => (
    index === 0 ? textCell('A1', title, S.title) : `<c r="${columnLetter(index)}1" s="${S.title}"/>`
  )).join('');
  const subtitleCells = columns.map((_, index) => (
    index === 0 ? textCell('A2', subtitle, S.subtitle) : `<c r="${columnLetter(index)}2" s="${S.subtitle}"/>`
  )).join('');
  const validations = columns
    .map((column, index) => buildValidation(column, columnLetter(index), lists))
    .filter(Boolean);

  const dataSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><tabColor rgb="FF1F5BA3"/></sheetPr>
<sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"><pane ySplit="4" topLeftCell="A${DATA_START_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${DATA_START_ROW}" sqref="A${DATA_START_ROW}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>
<row r="1" ht="34" customHeight="1">${titleCells}</row>
<row r="2" ht="34" customHeight="1">${subtitleCells}</row>
<row r="3" ht="8" customHeight="1"/>
<row r="4" ht="32" customHeight="1">${headerRow}</row>
${dataRows.join('\n')}
</sheetData>
<autoFilter ref="A4:${lastLetter}${DATA_START_ROW + STYLED_ROWS - 1}"/>
<mergeCells count="2"><mergeCell ref="A1:${lastLetter}1"/><mergeCell ref="A2:${lastLetter}2"/></mergeCells>
${validations.length ? `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  // ── Hoja Guía ────────────────────────────────────────────────────────────
  const guideRows = [];
  let row = 1;
  const pushRow = (cells, height) => {
    guideRows.push(`<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`);
    row += 1;
  };
  const guideMerges = [];
  const mergedText = (text, style, height) => {
    guideMerges.push(`A${row}:D${row}`);
    pushRow(`${textCell(`A${row}`, text, style)}<c r="B${row}" s="${style}"/><c r="C${row}" s="${style}"/><c r="D${row}" s="${style}"/>`, height);
  };

  mergedText(`GUÍA DE IMPORTACIÓN · ${sheetName.toUpperCase()}`, S.title, 36);
  mergedText('Universidad CESMAG · Sistema de Gestión de Trabajos de Grado', S.subtitle, 22);
  pushRow('', 10);
  mergedText('Pasos', S.sectionHeading, 26);
  steps.forEach((step, index) => mergedText(`${index + 1}.  ${step}`, S.body, 34));
  pushRow('', 10);
  mergedText('Campos de la plantilla', S.sectionHeading, 26);
  pushRow(['Campo', 'Obligatorio', 'Descripción', 'Ejemplo']
    .map((label, index) => textCell(`${columnLetter(index)}${row}`, label, S.header)).join(''), 26);
  columns.forEach((column) => {
    pushRow([
      textCell(`A${row}`, column.header, S.fieldName),
      textCell(`B${row}`, column.required ? 'Sí' : 'No', S.fieldText),
      textCell(`C${row}`, column.description || '', S.fieldText),
      textCell(`D${row}`, column.example ?? '', S.example),
    ].join(''), 40);
  });
  if (notes.length) {
    pushRow('', 10);
    mergedText('Importante', S.sectionHeading, 26);
    notes.forEach((note) => mergedText(`•  ${note}`, S.body, 34));
  }

  const guideSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><tabColor rgb="FF173552"/></sheetPr>
<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="13" customWidth="1"/><col min="3" max="3" width="58" customWidth="1"/><col min="4" max="4" width="34" customWidth="1"/></cols>
<sheetData>${guideRows.join('')}</sheetData>
<mergeCells count="${guideMerges.length}">${guideMerges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>
</worksheet>`;

  const listSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/></cols>
<sheetData>${listRows.join('')}</sheetData>
</worksheet>`;

  // ── Empaquetado ──────────────────────────────────────────────────────────
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>
<sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>
<sheet name="Guía" sheetId="2" r:id="rId2"/>
<sheet name="Listas" sheetId="3" state="hidden" r:id="rId3"/>
</sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', STYLES_XML);
  zip.file('xl/worksheets/sheet1.xml', dataSheet);
  zip.file('xl/worksheets/sheet2.xml', guideSheet);
  zip.file('xl/worksheets/sheet3.xml', listSheet);

  return zip.generateAsync({ type: outputType, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    try {
      if (link.parentNode) link.parentNode.removeChild(link);
    } catch {
      // ya removido
    }
    URL.revokeObjectURL(url);
  }, 60000);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NOTE_PASSWORD = 'Las cuentas nuevas se crean activas con la clave temporal 12345678; el sistema pedirá cambiarla en el primer ingreso.';
const NOTE_LIMIT = 'Máximo 2000 registros por archivo. Todas las filas deben pertenecer al mismo programa académico.';
const NOTE_HEADERS = 'No cambies ni muevas los encabezados de la fila 4. Las filas sin nombre ni correo se ignoran.';

export async function downloadStudentTemplate({ programs = [], semesters = [], programName = '' } = {}) {
  const programList = programName ? [programName] : programs;
  const blob = await buildImportTemplate({
    sheetName: 'Estudiantes',
    title: 'PLANTILLA DE IMPORTACIÓN DE ESTUDIANTES · UNIVERSIDAD CESMAG',
    subtitle: `${programName ? `Programa: ${programName}  ·  ` : ''}Diligencia desde la fila 5. Los campos con * son obligatorios. Consulta la hoja "Guía" antes de importar.`,
    programs: programList,
    semesters,
    columns: [
      {
        header: 'Nombre completo', width: 36, required: true, validation: 'name',
        prompt: 'Nombres y apellidos completos del estudiante.',
        description: 'Nombres y apellidos tal como figuran en el registro académico.',
        example: 'Laura Sofía Martínez Rosero',
      },
      {
        header: 'Correo institucional', width: 40, required: true, validation: 'email',
        prompt: 'Correo institucional único. No puede repetirse en el archivo.',
        description: 'Correo único del estudiante. Si ya existe en el sistema, solo se actualiza su semestre.',
        example: 'laura.martinez@unicesmag.edu.co',
      },
      {
        header: 'Programa académico', width: 38, required: true, validation: 'program',
        prompt: 'Selecciona el programa desde la lista.',
        description: 'Debe coincidir exactamente con el programa del sistema. Usa la lista desplegable.',
        example: programList[0] || 'Ingeniería de Sistemas',
      },
      {
        header: 'Semestre', width: 14, required: true, validation: 'semester',
        prompt: 'Selecciona el semestre actual del estudiante.',
        description: 'Número del semestre que cursa actualmente.',
        example: semesters.includes(8) ? 8 : (semesters[0] ?? 8),
      },
    ],
    steps: [
      'Ve a la hoja "Estudiantes" y escribe un estudiante por fila, a partir de la fila 5.',
      'Elige el programa y el semestre usando las listas desplegables de cada celda.',
      'Guarda el archivo en formato .xlsx y cárgalo con el botón "Elegir Excel" en Gestión de Estudiantes.',
      'Revisa la vista previa y confirma con "Importar".',
    ],
    notes: [
      NOTE_PASSWORD,
      'Si el correo ya pertenece a un estudiante del programa, se conservan sus datos y contraseña; solo se actualiza el semestre.',
      NOTE_LIMIT,
      NOTE_HEADERS,
    ],
  });
  downloadBlob(blob, `plantilla-estudiantes${programName ? `-${slugify(programName)}` : ''}.xlsx`);
}

export async function downloadTeacherTemplate({ programs = [], programName = '' } = {}) {
  const programList = programName ? [programName] : programs;
  const blob = await buildImportTemplate({
    sheetName: 'Docentes',
    title: 'PLANTILLA DE IMPORTACIÓN DE DOCENTES · UNIVERSIDAD CESMAG',
    subtitle: `${programName ? `Programa: ${programName}  ·  ` : ''}Diligencia desde la fila 5. Los campos con * son obligatorios. Consulta la hoja "Guía" antes de importar.`,
    programs: programList,
    columns: [
      {
        header: 'Nombre completo', width: 38, required: true, validation: 'name',
        prompt: 'Nombres y apellidos completos del docente (puede incluir título: Mg., PhD.).',
        description: 'Nombres y apellidos del docente. Si ya existe, se actualiza su nombre.',
        example: 'Mg. Carlos Andrés Ramírez Ortega',
      },
      {
        header: 'Correo institucional', width: 40, required: true, validation: 'email',
        prompt: 'Correo institucional único. No puede repetirse en el archivo.',
        description: 'Correo único del docente. Si ya existe en el sistema, se actualizan nombre y programa sin cambiar la contraseña.',
        example: 'carlos.ramirez@unicesmag.edu.co',
      },
      {
        header: 'Programa académico', width: 38, required: true, validation: 'program',
        prompt: 'Selecciona el programa desde la lista.',
        description: 'Programa al que queda vinculado el docente. Usa la lista desplegable.',
        example: programList[0] || 'Ingeniería de Sistemas',
      },
    ],
    steps: [
      'Ve a la hoja "Docentes" y escribe un docente por fila, a partir de la fila 5.',
      'Elige el programa académico usando la lista desplegable de cada celda.',
      'Guarda el archivo en formato .xlsx y cárgalo con "Elegir archivo" en Gestión Docente.',
      'Revisa la vista previa y confirma con "Importar".',
    ],
    notes: [
      NOTE_PASSWORD,
      'Un correo que ya pertenezca a un usuario sin rol de docente (por ejemplo, un estudiante) detendrá la importación.',
      NOTE_LIMIT,
      NOTE_HEADERS,
    ],
  });
  downloadBlob(blob, `plantilla-docentes${programName ? `-${slugify(programName)}` : ''}.xlsx`);
}
