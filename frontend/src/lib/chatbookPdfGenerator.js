import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colores Institucionales Universidad CESMAG
const PRIMARY_COLOR = [31, 91, 163]; // Azul Institucional CESMAG #1F5BA3
const SECONDARY_COLOR = [186, 24, 40]; // Rojo/Carmesí Institucional #BA1828
const DARK_TEXT = [24, 34, 56];
const MUTED_TEXT = [100, 116, 139];
const LIGHT_BG = [245, 247, 250];

function drawHeader(doc, title, subtitle, user) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Barra superior azul institucional
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 18, 'F');

  // Franja secundaria
  doc.setFillColor(...SECONDARY_COLOR);
  doc.rect(0, 18, pageWidth, 2.5, 'F');

  // Textos del encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('UNIVERSIDAD CESMAG', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Dirección de Investigaciones · Trabajos de Grado', pageWidth - 14, 11, { align: 'right' });

  // Título del Documento
  doc.setTextColor(...DARK_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED_TEXT);

  const prog = user?.programName || 'Universidad CESMAG';
  const fac = user?.facultyName || 'Comité de Investigaciones';
  doc.text(`${subtitle}  |  ${prog}  |  ${fac}`, 14, 34);

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const userName = user?.name || user?.fullName || 'Estudiante CESMAG';
  doc.text(`Fecha de emisión: ${dateStr} ${timeStr}  |  Elaborado por: ${userName}`, 14, 39);

  doc.setDrawColor(220, 227, 238);
  doc.setLineWidth(0.5);
  doc.line(14, 42, pageWidth - 14, 42);
}

function drawFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 227, 238);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_TEXT);
    doc.text('Universidad CESMAG · Sistema Institucional de Gestión de Trabajos de Grado (Chatbot AI)', 14, pageHeight - 9);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 9, { align: 'right' });
  }
}

/**
 * Genera el documento PDF formal de Ficha Técnica de Propuesta de Grado
 */
export function generateProposalPdf(proposal, user) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, 'FICHA TÉCNICA DE PROPUESTA DE TRABAJO DE GRADO', 'Asistente Académico Chatbot', user);

  let currentY = 48;

  // 1. TÍTULO PROPUESTO
  autoTable(doc, {
    startY: currentY,
    head: [['1. TÍTULO PROPUESTO DEL PROYECTO']],
    body: [[proposal.suggestedTitle || proposal.title || 'Propuesta de Trabajo de Grado']],
    theme: 'plain',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: DARK_TEXT,
      cellPadding: 4,
      fillColor: LIGHT_BG,
      fontStyle: 'bold',
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // 2. METADATOS Y LÍNEA DE INVESTIGACIÓN
  const metaRows = [
    ['Programa Académico:', user?.programName || proposal.program || 'No especificado'],
    ['Facultad:', user?.facultyName || proposal.faculty || 'Facultad de Ingeniería'],
    ['Línea de Investigación:', proposal.researchLine || 'Innovación y Desarrollo Tecnológico'],
  ];

  autoTable(doc, {
    startY: currentY,
    body: metaRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: PRIMARY_COLOR, cellWidth: 45 },
      1: { textColor: DARK_TEXT },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // 3. PLANTEAMIENTO DEL PROBLEMA
  if (proposal.problemStatement) {
    autoTable(doc, {
      startY: currentY,
      head: [['2. PLANTEAMIENTO DEL PROBLEMA Y PREGUNTA DE INVESTIGACIÓN']],
      body: [[proposal.problemStatement]],
      theme: 'plain',
      headStyles: {
        fillColor: PRIMARY_COLOR,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9.5,
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: DARK_TEXT,
        cellPadding: 4,
        fillColor: [255, 255, 255],
      },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 5;
  }

  // 4. OBJETIVO GENERAL
  autoTable(doc, {
    startY: currentY,
    head: [['3. OBJETIVO GENERAL (TAXONOMÍA DE BLOOM)']],
    body: [[proposal.generalObjective || 'Desarrollar la propuesta metodológica planteada.']],
    theme: 'plain',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: DARK_TEXT,
      cellPadding: 4,
      fillColor: LIGHT_BG,
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // 5. OBJETIVOS ESPECÍFICOS
  const specificList = Array.isArray(proposal.specificObjectives)
    ? proposal.specificObjectives.map((obj, idx) => [`Fase ${idx + 1}:`, obj])
    : [['1.', 'Definir requerimientos'], ['2.', 'Construir prototipo'], ['3.', 'Evaluar resultados']];

  autoTable(doc, {
    startY: currentY,
    head: [['4. OBJETIVOS ESPECÍFICOS SECUENCIALES', '']],
    body: specificList,
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: PRIMARY_COLOR, cellWidth: 22 },
      1: { textColor: DARK_TEXT },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // 6. METODOLOGÍA RECOMENDADA
  if (proposal.methodology) {
    autoTable(doc, {
      startY: currentY,
      head: [['5. METODOLOGÍA PROPUESTA']],
      body: [[proposal.methodology]],
      theme: 'plain',
      headStyles: {
        fillColor: PRIMARY_COLOR,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9.5,
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: DARK_TEXT,
        cellPadding: 4,
        fillColor: LIGHT_BG,
      },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 5;
  }

  // 7. ANTECEDENTES DEL CRAI CESMAG (SI EXISTEN)
  if (proposal.antecedents && proposal.antecedents.length > 0) {
    const antecedentRows = proposal.antecedents.map((a, i) => [
      `${i + 1}.`,
      `${a.apaCitation || `${a.authors} (${a.year}). ${a.title}. Trabajo de Grado, CESMAG.`}\nSignatura: ${a.callNumber || 'CRAI-CESMAG'} | Distinción: ${a.distinction || 'Aprobado'}`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['6. ANTECEDENTES IDENTIFICADOS EN REPOSITORIO CRAI CESMAG (NORMA APA 7ma ED.)', '']],
      body: antecedentRows,
      theme: 'grid',
      headStyles: {
        fillColor: PRIMARY_COLOR,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9.5,
      },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: PRIMARY_COLOR, cellWidth: 10 },
        1: { textColor: DARK_TEXT },
      },
      margin: { left: 14, right: 14 },
    });

    currentY = doc.lastAutoTable.finalY + 12;
  } else {
    currentY += 12;
  }

  // Comprobar si cabe la sección de firmas o si requiere nueva página
  if (currentY > doc.internal.pageSize.getHeight() - 45) {
    doc.addPage();
    currentY = 25;
  }

  // 8. ESPACIO FORMAL DE FIRMAS Y AVAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('7. AVAL INSTITUCIONAL Y REVISIÓN', 14, currentY);

  currentY += 15;

  const colWidth = (pageWidth - 28) / 3;
  // Línea Estudiante
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.5);
  doc.line(14, currentY, 14 + colWidth - 5, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK_TEXT);
  doc.text('Firma del Estudiante / Proponente', 14, currentY + 4);
  doc.text(`Nombre: ${user?.name || user?.fullName || ''}`, 14, currentY + 8);

  // Línea Docente Asesor
  doc.line(14 + colWidth, currentY, 14 + (colWidth * 2) - 5, currentY);
  doc.text('Firma Docente Asesor / Director', 14 + colWidth, currentY + 4);
  doc.text('Visto Bueno Metodológico', 14 + colWidth, currentY + 8);

  // Línea Comité Curricular
  doc.line(14 + (colWidth * 2), currentY, pageWidth - 14, currentY);
  doc.text('Comité Curricular / Coordinación', 14 + (colWidth * 2), currentY + 4);
  doc.text('Estado: [  ] Avalado   [  ] Corregir', 14 + (colWidth * 2), currentY + 8);

  drawFooter(doc);

  const safeFilename = `Ficha_Propuesta_Grado_CESMAG_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeFilename);
}

/**
 * Genera el documento PDF de Rúbrica y Evaluación del Simulador de Sustentación
 */
export function generateDefenseSimulationPdf(simulation, evaluation, user) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  drawHeader(doc, 'CONSTANCIA DE SIMULADOR DE SUSTENTACIÓN ORAL', 'Jurado Evaluador Institucional Chatbot', user);

  let currentY = 48;

  // 1. TEMA Y VEREDICTO GENERAL
  const verdictRows = [
    ['Proyecto Evaluado:', simulation?.topic || 'Trabajo de Grado'],
    ['Calificación Obtenida:', `${evaluation?.score?.toFixed(1) || '0.0'} / 5.0 (Mínimo aprobatorio: 3.5)`],
    ['Concepto del Jurado:', evaluation?.verdict || 'Evaluación en Proceso'],
    ['Nivel de Preparación:', evaluation?.score >= 4.5 ? 'Excelente (Candidato a Meritorio)' : evaluation?.score >= 3.5 ? 'Aprobado (Defensa Sólida)' : 'Requiere Mayor Sustentación'],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['RESULTADOS GENERALES DE LA SIMULACIÓN DE DEFENSA', '']],
    body: verdictRows,
    theme: 'grid',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: PRIMARY_COLOR, cellWidth: 45 },
      1: { textColor: DARK_TEXT, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // 2. CONCEPTO DEL JURADO
  if (evaluation?.feedback) {
    autoTable(doc, {
      startY: currentY,
      head: [['DICTAMEN DETALLADO DEL JURADO EVALUADOR']],
      body: [[evaluation.feedback]],
      theme: 'plain',
      headStyles: { fillColor: PRIMARY_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5, textColor: DARK_TEXT, cellPadding: 4, fillColor: LIGHT_BG },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 6;
  }

  // 3. FORTALEZAS Y PUNTOS A MEJORAR
  const strengthsText = (evaluation?.strengths || []).map((s) => `• ${s}`).join('\n') || 'No se registraron fortalezas destacadas.';
  const improvementsText = (evaluation?.improvements || []).map((i) => `• ${i}`).join('\n') || 'Mantener el nivel técnico demostrado.';

  autoTable(doc, {
    startY: currentY,
    head: [['PUNTOS FUERTES DE LA DEFENSA', 'ASPECTOS CRÍTICOS A REFORZAR ANTES DEL DÍA REAL']],
    body: [[strengthsText, improvementsText]],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 4, textColor: DARK_TEXT },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 88 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // 4. CONSEJO TÁCTICO DE ORATORIA
  if (evaluation?.proTip) {
    autoTable(doc, {
      startY: currentY,
      head: [['CONSEJO TÁCTICO DE ORATORIA Y DEFENSA ANTE EL JURADO']],
      body: [[`💡 ${evaluation.proTip}`]],
      theme: 'plain',
      headStyles: { fillColor: SECONDARY_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8.5, textColor: DARK_TEXT, cellPadding: 4, fillColor: [254, 242, 242] },
      margin: { left: 14, right: 14 },
    });
  }

  drawFooter(doc);

  const safeFilename = `Evaluacion_Sustentacion_CESMAG_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(safeFilename);
}
