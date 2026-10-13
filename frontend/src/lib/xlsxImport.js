import JSZip from 'jszip';

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase();
}

function parseXml(xmlText, label) {
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`No se pudo leer la estructura ${label} del archivo.`);
  return document;
}

function columnIndex(cellReference) {
  const letters = String(cellReference || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export async function readFirstWorksheet(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookFile = zip.file('xl/workbook.xml');
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relationshipsFile) throw new Error('El archivo seleccionado no parece ser un libro de Excel válido.');

  const workbookXml = parseXml(await workbookFile.async('text'), 'del libro');
  const relationshipXml = parseXml(await relationshipsFile.async('text'), 'de relaciones');
  const firstSheet = workbookXml.querySelector('sheets sheet');
  if (!firstSheet) throw new Error('El archivo no contiene hojas de cálculo.');
  const relationshipId = firstSheet.getAttribute('r:id')
    || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationship = [...relationshipXml.querySelectorAll('Relationship')]
    .find((item) => item.getAttribute('Id') === relationshipId);
  if (!relationship) throw new Error('No fue posible localizar la primera hoja del archivo.');
  const target = relationship.getAttribute('Target') || '';
  const sheetPath = target.startsWith('/')
    ? target.slice(1)
    : target.startsWith('xl/') ? target : `xl/${target}`;
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error('La primera hoja del archivo no está disponible.');

  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? [...parseXml(await sharedStringsFile.async('text'), 'de textos').querySelectorAll('si')]
      .map((item) => [...item.querySelectorAll('t')].map((node) => node.textContent || '').join(''))
    : [];
  const sheetXml = parseXml(await sheetFile.async('text'), 'de la hoja');
  return [...sheetXml.querySelectorAll('sheetData row')]
    .sort((first, second) => Number(first.getAttribute('r')) - Number(second.getAttribute('r')))
    .map((row) => {
      const values = [];
      for (const cell of row.querySelectorAll('c')) {
        const index = columnIndex(cell.getAttribute('r'));
        if (index < 0) continue;
        const type = cell.getAttribute('t');
        const value = type === 'inlineStr'
          ? [...cell.querySelectorAll('is t')].map((node) => node.textContent || '').join('')
          : cell.querySelector('v')?.textContent || '';
        values[index] = type === 's' ? sharedStrings[Number(value)] || '' : value;
      }
      return values;
    });
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('El archivo CSV contiene comillas sin cerrar.');
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export function normalizeImportHeader(value) {
  return normalizeHeader(value);
}
