// ─────────────────────────────────────────────
//  reports.js  —  PredicApp · Reportes + PDF
//  PredicApp v3.0
//
//  Exporta:
//    Reports          — CRUD de reportes sobre Firestore
//    generatePDF      — PDF de reportes individuales / todos
//    generateWeeklyPDF — PDF semanal con todos los turnos por día
//
//  Estructura de un reporte en Firestore (predicapp_data/reports):
//  {
//    id:           string,     // slotId-timestamp
//    slotId:       string,     // "Lun-07:00-09:00"
//    day:          string,     // "Lun"
//    time:         string,     // "07:00-09:00"
//    point:        string,
//    participants: string[],
//    date:         string,     // ISO "2025-06-10"
//    startTime:    string,     // "07:15"
//    fulfilled:    boolean,
//    conversation: boolean,
//    bibleStudy:   boolean,
//    revisits:     number,
//    studies:      number,
//    notes:        string,
//    createdAt:    number      // timestamp ms
//  }
// ─────────────────────────────────────────────

import { DB } from './db.js';

// ── Sanitización de datos ─────────────────────
// Garantiza que ningún campo sea undefined/null antes de enviarse a Firestore.
// Firestore rechaza campos undefined con "invalid-argument".
function _sanitize(data) {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const HH_MM    = /^\d{2}:\d{2}$/;

  return {
    slotId:       String(data.slotId        ?? '').slice(0, 100),
    day:          String(data.day           ?? '').slice(0, 10),
    time:         String(data.time          ?? '').slice(0, 20),
    point:        String(data.point         ?? '').slice(0, 100),
    participants: Array.isArray(data.participants)
                    ? data.participants.map(p => String(p).slice(0, 80)).slice(0, 10)
                    : [],
    date:         ISO_DATE.test(data.date)   ? data.date : new Date().toISOString().slice(0, 10),
    startTime:    HH_MM.test(data.startTime) ? data.startTime : '',
    fulfilled:    Boolean(data.fulfilled),
    conversation: Boolean(data.conversation),
    bibleStudy:   Boolean(data.bibleStudy),
    revisits:     Math.max(0, Math.min(9999, parseInt(data.revisits)  || 0)),
    studies:      Math.max(0, Math.min(9999, parseInt(data.studies)   || 0)),
    notes:        String(data.notes ?? '').slice(0, 500)
  };
}

// ── CRUD de reportes ──────────────────────────

export const Reports = {

  /** Todos los reportes desde el cache local. */
  getAll() {
    return DB.get('reports', []);
  },

  /** Reporte de un turno específico, o undefined si no existe. */
  getBySlot(slotId) {
    return this.getAll().find(r => r.slotId === slotId);
  },

  /**
   * Guarda o actualiza un reporte.
   * Sanitiza todos los campos antes de escribir a Firestore.
   * Preserva id y createdAt originales en actualizaciones.
   */
  async save(reportData) {
    if (!reportData?.slotId) {
      return { ok: false, code: 'invalid-argument', message: 'slotId es obligatorio.' };
    }

    const clean   = _sanitize(reportData);
    const reports = this.getAll();
    const idx     = reports.findIndex(r => r.slotId === clean.slotId);

    if (idx >= 0) {
      reports[idx] = { ...reports[idx], ...clean, updatedAt: Date.now() };
    } else {
      reports.push({ ...clean, id: clean.slotId + '-' + Date.now(), createdAt: Date.now() });
    }

    return DB.set('reports', reports);
  },

  /** Elimina el reporte de un turno. */
  async remove(slotId) {
    if (!slotId) return { ok: false, code: 'invalid-argument', message: 'slotId es obligatorio.' };
    return DB.set('reports', this.getAll().filter(r => r.slotId !== slotId));
  }
};

// ── Carga lazy de jsPDF ───────────────────────

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let _jsPDFLoaded = false;

async function loadJsPDF() {
  if (_jsPDFLoaded || window.jspdf) { _jsPDFLoaded = true; return; }
  return new Promise((resolve, reject) => {
    const s  = document.createElement('script');
    s.src    = JSPDF_URL;
    s.onload  = () => { _jsPDFLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('No se pudo cargar jsPDF. Verifica tu conexión.'));
    document.head.appendChild(s);
  });
}

// ── Helpers PDF compartidos ───────────────────

function _fmtDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

function _bool(val) {
  return val ? 'Si' : 'No';
}

async function _exportDoc(doc, filename, action) {
  if (action === 'share' && navigator.canShare) {
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'PredicApp' });
      return;
    }
  }
  doc.save(filename);
}

// ── PDF de reportes individuales / todos ──────

/**
 * Genera un PDF con uno o varios reportes de turno.
 * @param {object[]} reports
 * @param {'download'|'share'} action
 */
export async function generatePDF(reports, action = 'download') {
  if (!reports.length) throw new Error('No hay reportes para exportar.');
  await loadJsPDF();

  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210, MARGIN = 14, COL_W = PAGE_W - MARGIN * 2, LINE_H = 7;
  let y = MARGIN;

  const checkPage = (n = LINE_H * 3) => {
    if (y + n > 282) { doc.addPage(); y = MARGIN; }
  };

  // Cabecera
  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, PAGE_W, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('PredicApp - Reporte de Turnos', MARGIN, 12);
  doc.setTextColor(35, 35, 35);
  y = 24;

  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Generado: ' + new Date().toLocaleString('es'), MARGIN, y);
  doc.setTextColor(35, 35, 35);
  y += LINE_H + 2;

  const sectionTitle = (text) => {
    checkPage(14);
    doc.setFillColor(240, 244, 248);
    doc.rect(MARGIN, y - 5, COL_W, 9, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 58, 92);
    doc.text(text, MARGIN + 2, y);
    doc.setTextColor(35, 35, 35);
    y += LINE_H;
  };

  const row = (label, value) => {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value ?? '-'), COL_W - 45);
    doc.text(lines, MARGIN + 45, y);
    y += LINE_H * lines.length;
  };

  reports.forEach((r, i) => {
    if (i > 0) { checkPage(20); y += 4; }
    sectionTitle('Turno ' + (i + 1) + ': ' + (r.day ?? '') + ' - ' + (r.time ?? '') + ' - ' + (r.point ?? ''));
    row('Fecha:', _fmtDate(r.date));
    row('Hora inicio:', r.startTime || '-');
    row('Participantes:', (r.participants ?? []).join(', ') || '-');
    y += 2;
    row('Cumplido:', _bool(r.fulfilled));
    row('Conversaciones:', _bool(r.conversation));
    row('Est. biblico:', _bool(r.bibleStudy));
    row('Revisitas:', r.revisits ?? 0);
    row('Estudios:', r.studies ?? 0);
    if (r.notes) { y += 2; row('Notas:', r.notes); }

    doc.setDrawColor(210, 215, 220);
    doc.line(MARGIN, y + 1, MARGIN + COL_W, y + 1);
    y += 6;
  });

  // Pie de página
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('PredicApp - Pagina ' + p + ' de ' + total, PAGE_W / 2, 292, { align: 'center' });
  }

  await _exportDoc(doc, 'predicapp-reporte-' + new Date().toISOString().slice(0, 10) + '.pdf', action);
}

// ── PDF semanal por día ───────────────────────

/**
 * Genera un PDF con todos los turnos de la semana agrupados por día.
 * Los turnos con reporte muestran sus datos completos.
 *
 * @param {object} slots    - Cache: { Lun: [slot,...], ... }
 * @param {'download'|'share'} action
 */
export async function generateWeeklyPDF(slots, action = 'download') {
  await loadJsPDF();

  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210, MARGIN = 14, COL_W = PAGE_W - MARGIN * 2, LINE_H = 6.5;
  let y = MARGIN;

  const reports = Reports.getAll();

  const checkPage = (n = LINE_H * 3) => {
    if (y + n > 284) { doc.addPage(); y = MARGIN; _pageHeader(); }
  };

  const _pageHeader = () => {
    doc.setFillColor(26, 58, 92);
    doc.rect(0, 0, PAGE_W, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('PredicApp - Reporte Semanal de Turnos', MARGIN, 11);
    doc.setTextColor(35, 35, 35);
  };

  const _dayBanner = (name) => {
    checkPage(16);
    doc.setFillColor(26, 58, 92);
    doc.roundedRect(MARGIN, y - 5, COL_W, 10, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(name.toUpperCase(), MARGIN + 3, y + 1.5);
    doc.setTextColor(35, 35, 35);
    y += 10;
  };

  const STATUS_LABEL = { free: 'Libre', partial: 'Parcial', ready: 'Listo', complete: 'Completo' };
  const STATUS_COLOR = { free: [120,120,120], partial: [180,130,0], ready: [30,100,180], complete: [40,130,60] };

  const _slotRow = (slot, report) => {
    const people = slot.reservations.reduce((s, r) => s + 1 + (r.companions?.length ?? 0), 0);
    const names  = [];
    slot.reservations.forEach(r => { names.push(r.name); r.companions?.forEach(c => names.push(c)); });
    const rowH = report ? 42 : 16;

    checkPage(rowH + 4);

    doc.setFillColor(248, 249, 250);
    doc.roundedRect(MARGIN, y - 4, COL_W, rowH, 2, 2, 'F');

    // Horario
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 58, 92);
    doc.text(slot.time, MARGIN + 2, y + 1);

    // Badge estado
    const [sr, sg, sb] = STATUS_COLOR[slot.status] ?? [120, 120, 120];
    doc.setFillColor(sr, sg, sb);
    doc.roundedRect(MARGIN + 40, y - 3, 22, 6, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[slot.status] ?? slot.status, MARGIN + 42, y + 1);
    doc.setTextColor(35, 35, 35);

    // Personas y punto
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(people + '/3 personas', MARGIN + 68, y + 1);
    if (slot.reservations[0]?.point) {
      doc.setTextColor(80, 80, 80);
      doc.text('Punto: ' + slot.reservations[0].point, MARGIN + 100, y + 1);
      doc.setTextColor(35, 35, 35);
    }
    y += 7;

    // Nombres
    if (names.length) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const nl = doc.splitTextToSize('Participantes: ' + names.join(', '), COL_W - 6);
      doc.text(nl, MARGIN + 3, y);
      y += LINE_H * nl.length;
      doc.setTextColor(35, 35, 35);
    }

    // Datos del reporte
    if (report) {
      y += 1;
      doc.setDrawColor(200, 210, 220);
      doc.line(MARGIN + 3, y, MARGIN + COL_W - 3, y);
      y += 3;

      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 58, 92);
      doc.text('Reporte', MARGIN + 3, y);
      doc.setTextColor(35, 35, 35);
      y += LINE_H - 1;

      const c1 = MARGIN + 3, c2 = MARGIN + 55, c3 = MARGIN + 110;
      doc.setFontSize(7);

      // Fila 1
      doc.setFont('helvetica', 'bold'); doc.text('Fecha:', c1, y);
      doc.setFont('helvetica', 'normal'); doc.text(_fmtDate(report.date), c1 + 13, y);
      doc.setFont('helvetica', 'bold'); doc.text('Inicio:', c2, y);
      doc.setFont('helvetica', 'normal'); doc.text(report.startTime || '-', c2 + 13, y);
      doc.setFont('helvetica', 'bold'); doc.text('Cumplido:', c3, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(report.fulfilled ? 40 : 190, report.fulfilled ? 130 : 40, 40);
      doc.text(_bool(report.fulfilled), c3 + 20, y);
      doc.setTextColor(35, 35, 35);
      y += LINE_H - 1;

      // Fila 2
      doc.setFont('helvetica', 'bold'); doc.text('Revisitas:', c1, y);
      doc.setFont('helvetica', 'normal'); doc.text(String(report.revisits ?? 0), c1 + 18, y);
      doc.setFont('helvetica', 'bold'); doc.text('Estudios:', c2, y);
      doc.setFont('helvetica', 'normal'); doc.text(String(report.studies ?? 0), c2 + 18, y);
      doc.setFont('helvetica', 'bold'); doc.text('Conversac.:', c3, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(report.conversation ? 40 : 190, report.conversation ? 130 : 40, 40);
      doc.text(_bool(report.conversation), c3 + 22, y);
      doc.setTextColor(35, 35, 35);
      y += LINE_H - 1;

      // Fila 3
      doc.setFont('helvetica', 'bold'); doc.text('Est. biblico:', c1, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(report.bibleStudy ? 40 : 190, report.bibleStudy ? 130 : 40, 40);
      doc.text(_bool(report.bibleStudy), c1 + 24, y);
      doc.setTextColor(35, 35, 35);
      if (report.notes) {
        doc.setFont('helvetica', 'bold'); doc.text('Notas:', c2, y);
        doc.setFont('helvetica', 'normal');
        const nl = doc.splitTextToSize(report.notes, COL_W - 65);
        doc.text(nl, c2 + 13, y);
        y += LINE_H * Math.max(0, nl.length - 1);
      }
      y += LINE_H - 1;
    }

    y += 3;
  };

  // ── Portada ───────────────────────────────────────────────────────────────
  _pageHeader();
  y = 22;

  const now = new Date();
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    'Generado: ' + now.toLocaleString('es') + '   |   Semana del ' +
    now.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }),
    MARGIN, y
  );
  doc.setTextColor(35, 35, 35);
  y += LINE_H + 2;

  // Resumen global
  let totalFree = 0, totalComplete = 0, totalWithReport = 0, totalSlots = 0;
  Object.values(slots).forEach(daySlots => {
    daySlots?.forEach(slot => {
      totalSlots++;
      if (slot.status === 'free')     totalFree++;
      if (slot.status === 'complete') totalComplete++;
      if (reports.some(r => r.slotId === slot.id)) totalWithReport++;
    });
  });

  doc.setFillColor(240, 244, 248);
  doc.roundedRect(MARGIN, y - 4, COL_W, 12, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 58, 92);
  [
    'Total: ' + totalSlots,
    'Libres: ' + totalFree,
    'Completos: ' + totalComplete,
    'Con reporte: ' + totalWithReport
  ].forEach((item, i) => doc.text(item, MARGIN + 4 + i * 46, y + 3));
  doc.setTextColor(35, 35, 35);
  y += 16;

  // ── Contenido por día ─────────────────────────────────────────────────────
  const DAY_NAMES_PDF = {
    Lun: 'Lunes', Mar: 'Martes', 'Mié': 'Miercoles',
    Jue: 'Jueves', Vie: 'Viernes', 'Sáb': 'Sabado', Dom: 'Domingo'
  };

  Object.keys(slots).forEach(day => {
    const daySlots = slots[day];
    if (!daySlots?.length) return;

    _dayBanner(DAY_NAMES_PDF[day] ?? day);
    y += 2;

    daySlots.forEach(slot => {
      _slotRow(slot, reports.find(r => r.slotId === slot.id));
    });
    y += 2;
  });

  // Pie de página
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('PredicApp - Pagina ' + p + ' de ' + totalPages, PAGE_W / 2, 292, { align: 'center' });
  }

  await _exportDoc(doc, 'predicapp-semana-' + now.toISOString().slice(0, 10) + '.pdf', action);
  }
      
