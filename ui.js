// ─────────────────────────────────────────────
//  ui.js  —  PredicApp · Capa de presentación
//  PredicApp v3.0
// ─────────────────────────────────────────────

import { DAYS, FULL_DAY_NAMES } from './config.js';
import { countPeople, getPeopleNames } from './reservations.js';

// ── Helper DOM ────────────────────────────────
function el(tag, classes = '', text = '') {
  const e = document.createElement(tag);
  if (classes) e.className = classes;
  if (text)    e.textContent = text;
  return e;
}

// ── API pública ───────────────────────────────
export const UI = {

  /**
   * Renderiza el tablero completo (tabla desktop + cards móvil).
   *
   * @param {object}   slots         - { Lun: [slot,...], Mar: [...], ... }
   * @param {Function} onReserve     - Callback(day, slot) al pulsar Reservar
   * @param {object}   [opts]
   * @param {boolean}  [opts.isAdmin]   - Muestra botones admin
   * @param {Function} [opts.onCancel]  - Admin: cancelar turno completo
   * @param {Function} [opts.onEdit]    - Admin: editar reservas del turno
   * @param {Function} [opts.onReport]  - Registrar/ver reporte del turno
   * @param {object[]} [opts.reports]   - Reportes existentes (para mostrar badge)
   */
  renderBoard(slots, onReserve, opts = {}) {
    this._renderDesktopTable(slots, onReserve, opts);
    this._renderMobileCards(slots, onReserve, opts);
  },

  // ── Desktop ───────────────────────────────────────────────────────────────
  _renderDesktopTable(slots, onReserve, opts) {
    const tbody = document.getElementById('table-body');

    // FIX [Error 9]: Si tbody no existe en el DOM (vista móvil sin tabla),
    // evitar crash de null reference al asignar innerHTML.
    if (!tbody) return;

    const fragment = document.createDocumentFragment();

    // Importar TIMES dinámicamente para evitar dependencia circular
    const times = Object.values(slots)[0]?.map(s => s.time) ?? [];

    times.forEach(time => {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', 'td-time', time));

      DAYS.forEach(day => {
        const slot = slots[day]?.find(s => s.time === time);
        const td   = document.createElement('td');
        td.appendChild(slot
          ? this._buildSlotCell(slot, day, onReserve, opts)
          : el('span', 'td-empty', '—')
        );
        tr.appendChild(td);
      });

      fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  },

  _buildSlotCell(slot, day, onReserve, opts) {
    const cell   = el('div', 'slot-cell ' + slot.status);
    const people = countPeople(slot);
    const names  = getPeopleNames(slot);

    cell.appendChild(el('div', 'slot-count', '👥 ' + people + '/3'));

    if (names.length) {
      const namesList = el('div', 'slot-names');
      namesList.textContent = names.join(', ');
      cell.appendChild(namesList);
    }

    if (people < 3) {
      const btn = el('button', 'slot-btn-reserve', '+ Reservar');
      btn.onclick = (e) => { e.stopPropagation(); onReserve(day, slot); };
      cell.appendChild(btn);
    }

    if (opts.isAdmin && people > 0) {
      const actions   = el('div', 'slot-admin-actions');
      const btnEdit   = el('button', 'slot-btn-admin slot-btn-edit', '✏️');
      const btnCancel = el('button', 'slot-btn-admin slot-btn-cancel', '🗑');
      btnEdit.title   = 'Editar turno';
      btnCancel.title = 'Cancelar turno';
      btnEdit.onclick   = (e) => { e.stopPropagation(); opts.onEdit?.(day, slot); };
      btnCancel.onclick = (e) => { e.stopPropagation(); opts.onCancel?.(day, slot); };
      actions.appendChild(btnEdit);
      actions.appendChild(btnCancel);
      cell.appendChild(actions);
    }

    // FIX [Error 10]: Agregar el botón de reporte también en la vista desktop,
    // no solo en mobile. La versión original solo mostraba el badge 📋 en desktop
    // pero no el botón interactivo, lo que impedía abrir el modal de reporte
    // desde la tabla en pantallas grandes.
    if (people > 0 && opts.onReport) {
      const hasReport = opts.reports?.some(r => r.slotId === slot.id);
      const btnRep    = el('button', 'slot-btn-report', hasReport ? '📋 Ver' : '📋 Reporte');
      btnRep.title    = hasReport ? 'Ver reporte' : 'Registrar reporte';
      btnRep.onclick  = (e) => { e.stopPropagation(); opts.onReport(day, slot); };
      cell.appendChild(btnRep);
    } else if (opts.reports?.some(r => r.slotId === slot.id)) {
      // Si no hay onReport (no admin), mostrar solo el badge visual
      cell.appendChild(el('div', 'slot-report-badge', '📋'));
    }

    return cell;
  },

  // ── Móvil ─────────────────────────────────────────────────────────────────
  _renderMobileCards(slots, onReserve, opts) {
    const container = document.getElementById('mobile-cards');

    // FIX [Error 9]: Guardia si el contenedor no existe en el DOM.
    if (!container) return;

    const fragment  = document.createDocumentFragment();

    DAYS.forEach(day => {
      if (!slots[day]?.length) return;

      fragment.appendChild(el('div', 'day-header', FULL_DAY_NAMES[day]));

      slots[day].forEach(slot => {
        fragment.appendChild(this._buildSlotCard(slot, day, onReserve, opts));
      });
    });

    container.innerHTML = '';
    container.appendChild(fragment);
  },

  _buildSlotCard(slot, day, onReserve, opts) {
    const card   = el('div', 'slot-card');
    const people = countPeople(slot);
    const names  = getPeopleNames(slot);

    card.dataset.status = slot.status;

    // Fila superior: horario + badge de reporte
    const rowTop = el('div', 'card-row-top');
    rowTop.appendChild(el('div', 'card-time', slot.time));
    if (opts.reports?.some(r => r.slotId === slot.id)) {
      rowTop.appendChild(el('span', 'card-report-badge', '📋 Reporte'));
    }
    card.appendChild(rowTop);

    card.appendChild(el('div', 'card-capacity', '👥 ' + people + '/3'));

    if (names.length) {
      const nameDiv = el('div', 'card-names');
      nameDiv.textContent = names.join(' · ');
      card.appendChild(nameDiv);
    }

    // Acciones principales
    const actions = el('div', 'card-actions');

    if (people < 3) {
      const cls = people === 2 ? 'btn-reserve btn-last' : 'btn-reserve';
      const btn = el('button', cls, people === 2 ? 'Último cupo' : 'Reservar');
      btn.onclick = () => onReserve(day, slot);
      actions.appendChild(btn);
    } else {
      const btn = el('button', 'btn-reserve btn-full', 'Turno lleno');
      btn.disabled = true;
      actions.appendChild(btn);
    }

    if (people > 0 && opts.onReport) {
      const hasReport = opts.reports?.some(r => r.slotId === slot.id);
      const btnRep = el('button', 'btn-report', hasReport ? '📋 Ver reporte' : '📋 Registrar');
      btnRep.onclick = () => opts.onReport(day, slot);
      actions.appendChild(btnRep);
    }

    card.appendChild(actions);

    // Acciones admin
    if (opts.isAdmin && people > 0) {
      const adminRow  = el('div', 'card-admin-actions');
      const btnEdit   = el('button', 'btn-admin-sm', '✏️ Editar');
      const btnCancel = el('button', 'btn-admin-sm btn-danger-sm', '🗑 Cancelar');
      btnEdit.onclick   = () => opts.onEdit?.(day, slot);
      btnCancel.onclick = () => opts.onCancel?.(day, slot);
      adminRow.appendChild(btnEdit);
      adminRow.appendChild(btnCancel);
      card.appendChild(adminRow);
    }

    return card;
  }
};
