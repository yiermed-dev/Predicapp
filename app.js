// ─────────────────────────────────────────────
//  app.js  —  PredicApp · Controlador principal
//  PredicApp v3.0
// ─────────────────────────────────────────────

import { DB, initDB, onConnectionChange }          from './db.js';
import { UI }                                      from './ui.js';
import { addReservation, countPeople, cancelSlot,
         computeStatus, getPeopleNames,
         getSlotPoint }                            from './reservations.js';
import { verifyPassword, changePassword }          from './auth.js';
import { toast, confirm, promptInput }             from './toast.js';
import { Reports, generatePDF,
         generateWeeklyPDF }                       from './reports.js';

// ── Estado global ─────────────────────────────
const state = {
  slots:       {},
  currentSlot: null,   // { day, slot } — turno abierto en modal
  isAdmin:     false
};

// ── Arranque ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // FIX [Error 1]: initDB dispara el callback una vez por cada clave de BD
  // (5 veces). Se usa un Set para renderizar solo cuando todas las claves
  // han cargado al menos una vez, evitando 5 renders consecutivos al inicio.
  const TOTAL_KEYS    = 5; // slots, points, participants, admin_pass_hash, reports
  const loadedKeys    = new Set();
  let   initialRender = false;

  const unsubDB = initDB(({ key }) => {
    loadedKeys.add(key);

    if (!initialRender && loadedKeys.size >= TOTAL_KEYS) {
      initialRender = true;
      loadState();
      render();
    } else if (initialRender) {
      // Actualización en tiempo real posterior a la carga inicial
      loadState();
      render();
    }
  });

  // Guardar unsubscriber para evitar memory leaks si la PWA lo necesita
  window._dbUnsub = unsubDB;

  registerPWA();
  setupConnectionBadge();
  setupNav();
  setupModals();
  setupReserve();
  setupAdmin();
  setupParticipants();
  setupPoints();
  setupReports();
  setupInstallPrompt();
});

// ── Estado y render ───────────────────────────
function loadState() {
  state.slots = DB.get('slots', {});
}

function render() {
  loadState();
  UI.renderBoard(state.slots, openReserve, {
    isAdmin:  state.isAdmin,
    onCancel: adminCancelSlot,
    onEdit:   adminEditSlot,
    onReport: openReportModal,
    reports:  Reports.getAll()
  });
  updateStats();
}

function updateStats() {
  const participants = DB.get('participants', []);
  const points       = DB.get('points', []);
  let partial = 0, complete = 0;

  Object.values(state.slots).forEach(daySlots => {
    daySlots?.forEach(slot => {
      if (slot.status === 'partial' || slot.status === 'ready') partial++;
      if (slot.status === 'complete') complete++;
    });
  });

  _setText('count-part',  participants.length);
  _setText('count-point', points.length);
  _setText('count-parti', partial);
  _setText('count-comp',  complete);
}

function _setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ── Conexión ──────────────────────────────────
function setupConnectionBadge() {
  const badge = document.getElementById('offline-badge');
  onConnectionChange(online => {
    if (badge) badge.style.display = online ? 'none' : 'inline-flex';
  });
}

// ── Navegación ────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      document.querySelectorAll('main[id^="view-"]').forEach(v => v.style.display = 'none');
      const target = document.getElementById('view-' + tab.dataset.view);
      if (target) target.style.display = '';
    });
  });
}

// ── Modales ───────────────────────────────────
function setupModals() {
  document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) closeAllModals(); });
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

// ── Reservas ──────────────────────────────────
function openReserve(day, slot) {
  if (countPeople(slot) >= 3) { toast('Turno lleno', 'error'); return; }

  state.currentSlot = { day, slot };

  const infoEl = document.getElementById('res-info');
  if (infoEl) infoEl.value = day + ' · ' + slot.time;

  const participants = DB.get('participants', []);
  const mainOpts = participants.length
    ? participants.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('')
    : '<option value="" disabled selected>Sin participantes registrados</option>';
  const compOpts = '<option value="">— Ninguno —</option>' +
    participants.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('');

  _setHTML('sel-participant',  mainOpts);
  _setHTML('sel-companion1',   compOpts);
  _setHTML('sel-companion2',   compOpts);

  const points = DB.get('points', []);
  _setHTML('sel-point', points.length
    ? points.map(p => '<option value="' + p + '">' + p + '</option>').join('')
    : '<option value="" disabled selected>Sin puntos registrados</option>'
  );

  openModal('modal-reserve');
}

function setupReserve() {
  document.getElementById('btn-confirm-reserve')?.addEventListener('click', async () => {
    const name  = document.getElementById('sel-participant')?.value;
    const point = document.getElementById('sel-point')?.value;
    if (!name || !point) { toast('Selecciona participante y punto', 'error'); return; }

    loadState();
    const { day, slot } = state.currentSlot;

    // FIX [Error 4]: Buscar por slot.id (identificador único) en lugar de slot.time
    // para evitar colisiones si hubiera dos slots con el mismo horario.
    const target = state.slots[day]?.find(s => s.id === slot.id);
    if (!target) { toast('Error al encontrar el turno', 'error'); return; }

    const comp1      = document.getElementById('sel-companion1')?.value || '';
    const comp2      = document.getElementById('sel-companion2')?.value || '';
    const companions = [comp1, comp2].filter(c => c !== '');

    const result = addReservation(target, name, point, companions);
    if (!result.ok) { toast(result.error, 'error'); return; }

    // FIX [Error 2]: Verificar el resultado de DB.set antes de mostrar éxito
    const saveResult = await DB.set('slots', state.slots);
    if (!saveResult.ok) {
      // Revertir la mutación local si Firestore rechazó la escritura
      target.reservations.pop();
      target.status = computeStatus(target);
      toast(saveResult.message ?? 'Error al guardar la reserva.', 'error');
      return;
    }

    closeAllModals();
    render();

    const msg = saveResult.offline
      ? 'Reserva guardada localmente. Se sincronizara al reconectar.'
      : 'Reserva confirmada (' + countPeople(target) + '/3)';
    toast(msg, saveResult.offline ? 'warning' : 'success');
  });
}

// ── Admin: login y panel ──────────────────────
function setupAdmin() {
  document.getElementById('btn-admin-login')?.addEventListener('click', async () => {
    if (state.isAdmin) { openModal('modal-admin'); renderAdminLists(); return; }

    const pass = await promptInput('Contrasena de encargado:');
    if (!pass) return;

    const ok = await verifyPassword(pass);
    if (!ok) { toast('Contrasena incorrecta', 'error'); return; }

    state.isAdmin = true;
    _setText('role-badge', 'Admin');
    document.getElementById('tab-admin').style.display = '';
    render();
    toast('Acceso concedido', 'success');
    openModal('modal-admin');
    renderAdminLists();
  });

  document.getElementById('btn-change-pass')?.addEventListener('click', async () => {
    const oldPass = document.getElementById('old-pass')?.value;
    const newPass = document.getElementById('new-pass')?.value;
    const result  = await changePassword(oldPass, newPass);
    if (!result.ok) { toast(result.error, 'error'); return; }
    document.getElementById('old-pass').value = '';
    document.getElementById('new-pass').value = '';
    toast(result.warning ?? 'Contrasena actualizada', result.warning ? 'warning' : 'success');
  });
}

function renderAdminLists() {
  // Participantes
  const listParts = document.getElementById('list-parts');
  if (listParts) {
    const list = DB.get('participants', []);
    listParts.innerHTML = list.length
      ? list.map((p, i) =>
          '<li>' + p.name + (p.phone ? ' <small>(' + p.phone + ')</small>' : '') +
          ' <button class="btn-delete-part" data-index="' + i + '" aria-label="Eliminar">🗑</button></li>'
        ).join('')
      : '<li><em>Sin participantes</em></li>';

    listParts.querySelectorAll('.btn-delete-part').forEach(btn => {
      btn.addEventListener('click', async () => {
        const l = DB.get('participants', []);
        l.splice(parseInt(btn.dataset.index), 1);
        await DB.set('participants', l);
        toast('Participante eliminado', 'success');
        renderAdminLists(); updateStats();
      });
    });
  }

  // Puntos
  const listPoints = document.getElementById('list-points');
  if (listPoints) {
    const list = DB.get('points', []);
    listPoints.innerHTML = list.length
      ? list.map((p, i) =>
          '<li>' + p +
          ' <button class="btn-delete-point" data-index="' + i + '" aria-label="Eliminar">🗑</button></li>'
        ).join('')
      : '<li><em>Sin puntos</em></li>';

    listPoints.querySelectorAll('.btn-delete-point').forEach(btn => {
      btn.addEventListener('click', async () => {
        const l = DB.get('points', []);
        l.splice(parseInt(btn.dataset.index), 1);
        await DB.set('points', l);
        toast('Punto eliminado', 'success');
        renderAdminLists(); updateStats();
      });
    });
  }
}

// ── Admin: cancelar turno ─────────────────────
async function adminCancelSlot(day, slot) {
  const names = getPeopleNames(slot).join(', ');
  const ok    = await confirm('Cancelar turno ' + day + ' · ' + slot.time + '?\nParticipantes: ' + names);
  if (!ok) return;

  loadState();

  // FIX [Error 4]: Buscar por slot.id en lugar de slot.time
  const target = state.slots[day]?.find(s => s.id === slot.id);
  if (!target) return;

  // Guardar copia para poder revertir si DB.set falla
  const backupReservations = [...target.reservations];
  const backupStatus       = target.status;

  cancelSlot(target);

  // FIX [Error 3]: Verificar el resultado de DB.set al cancelar
  const saveResult = await DB.set('slots', state.slots);
  if (!saveResult.ok) {
    // Revertir mutación local
    target.reservations = backupReservations;
    target.status       = backupStatus;
    toast(saveResult.message ?? 'Error al cancelar el turno.', 'error');
    return;
  }

  render();
  toast(saveResult.offline ? 'Turno cancelado (pendiente de sincronizar).' : 'Turno cancelado', 'success');
}

// ── Admin: editar turno ───────────────────────
async function adminEditSlot(day, slot) {
  state.currentSlot = { day, slot };

  const infoEl = document.getElementById('edit-slot-info');
  if (infoEl) infoEl.value = day + ' · ' + slot.time;

  const listEl = document.getElementById('edit-reservations-list');
  if (listEl) {
    listEl.innerHTML = '';
    if (!slot.reservations.length) {
      listEl.innerHTML = '<li><em>Sin reservas</em></li>';
    } else {
      slot.reservations.forEach((r, i) => {
        const allNames = [r.name, ...(r.companions ?? [])].join(', ');
        const li = document.createElement('li');
        li.innerHTML =
          '<span>' + allNames + ' — <small>' + r.point + '</small></span>' +
          ' <button class="btn-delete-res" data-index="' + i + '">🗑</button>';
        listEl.appendChild(li);
      });

      listEl.querySelectorAll('.btn-delete-res').forEach(btn => {
        btn.addEventListener('click', async () => {
          loadState();

          // FIX [Error 4]: Buscar por slot.id para mayor robustez
          const target = state.slots[day]?.find(s => s.id === slot.id);
          if (!target) return;

          // FIX [Error 5]: Re-leer el índice desde el estado actual para evitar
          // desalineamiento si otro usuario eliminó una reserva mientras el modal
          // estaba abierto. Usamos el índice del dataset solo como hint inicial;
          // verificamos que la reserva en esa posición sigue siendo la misma.
          const idx = parseInt(btn.dataset.index);
          const expectedName = slot.reservations[idx]?.name;
          const freshIdx = expectedName
            ? target.reservations.findIndex(r => r.name === expectedName)
            : idx;

          if (freshIdx === -1) {
            toast('La reserva ya no existe. Recarga la pagina.', 'warning');
            closeAllModals();
            render();
            return;
          }

          target.reservations.splice(freshIdx, 1);
          target.status = computeStatus(target);

          const saveResult = await DB.set('slots', state.slots);
          if (!saveResult.ok) {
            toast(saveResult.message ?? 'Error al eliminar la reserva.', 'error');
            loadState(); // Revertir estado local desde caché
            return;
          }

          render();
          closeAllModals();
          toast('Reserva eliminada del turno', 'success');
        });
      });
    }
  }

  openModal('modal-edit-slot');
}

// ── Participantes ─────────────────────────────
function setupParticipants() {
  document.getElementById('btn-open-add-part')?.addEventListener('click', () => {
    document.getElementById('inp-part-name').value  = '';
    document.getElementById('inp-part-phone').value = '';
    openModal('modal-participant');
  });

  document.getElementById('btn-save-part')?.addEventListener('click', async () => {
    const name  = document.getElementById('inp-part-name')?.value.trim();
    const phone = document.getElementById('inp-part-phone')?.value.trim();
    if (!name) { toast('El nombre es obligatorio', 'error'); return; }

    const list = DB.get('participants', []);
    if (list.some(p => p.name === name)) {
      toast('Ya existe un participante con ese nombre', 'error'); return;
    }
    list.push({ name, phone });
    await DB.set('participants', list);
    closeAllModals();
    openModal('modal-admin');
    renderAdminLists(); updateStats();
    toast(name + ' agregado', 'success');
  });
}

// ── Puntos ────────────────────────────────────
function setupPoints() {
  document.getElementById('btn-add-point')?.addEventListener('click', async () => {
    const name = await promptInput('Nombre del nuevo punto de predicacion:');
    if (!name) return;
    const list = DB.get('points', []);
    if (list.includes(name)) { toast('Ese punto ya existe', 'error'); return; }
    list.push(name);
    await DB.set('points', list);
    renderAdminLists(); updateStats();
    toast('Punto "' + name + '" agregado', 'success');
  });
}

// ── Reportes ──────────────────────────────────
function openReportModal(day, slot) {
  state.currentSlot = { day, slot };
  const existing    = Reports.getBySlot(slot.id);
  const names       = getPeopleNames(slot);

  _setVal('rep-slot-info',    day + ' · ' + slot.time);
  _setVal('rep-participants', names.join(', '));
  _setVal('rep-date',         existing?.date      ?? _today());
  _setVal('rep-start-time',   existing?.startTime ?? '');
  _setVal('rep-revisits',     existing?.revisits  ?? 0);
  _setVal('rep-studies',      existing?.studies   ?? 0);
  _setVal('rep-notes',        existing?.notes     ?? '');
  _setChecked('rep-fulfilled',    existing?.fulfilled    ?? false);
  _setChecked('rep-conversation', existing?.conversation ?? false);
  _setChecked('rep-bible-study',  existing?.bibleStudy   ?? false);

  openModal('modal-report');
}

function setupReports() {
  // Guardar reporte — con guardia anti-doble-click y feedback de carga
  document.getElementById('btn-save-report')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;                     // guardia doble-click

    const { day, slot } = state.currentSlot ?? {};
    if (!slot) {
      toast('No hay turno seleccionado', 'error');
      return;
    }

    // Re-verificar que el turno sigue existiendo en el estado actual
    loadState();

    // FIX [Error 4]: Buscar por slot.id
    const freshSlot = state.slots[day]?.find(s => s.id === slot.id);
    if (!freshSlot) {
      toast('El turno ya no existe. Recarga la pagina.', 'error');
      closeAllModals();
      return;
    }

    // Estado de carga: deshabilita botón para evitar doble envío
    const originalText  = btn.textContent;
    btn.disabled        = true;
    btn.textContent     = '⏳ Guardando...';

    try {
      const result = await Reports.save({
        slotId:       freshSlot.id,
        day,
        time:         freshSlot.time,
        point:        getSlotPoint(freshSlot),
        participants: getPeopleNames(freshSlot),
        date:         document.getElementById('rep-date')?.value           || _today(),
        startTime:    document.getElementById('rep-start-time')?.value     || '',
        fulfilled:    document.getElementById('rep-fulfilled')?.checked    ?? false,
        conversation: document.getElementById('rep-conversation')?.checked ?? false,
        bibleStudy:   document.getElementById('rep-bible-study')?.checked  ?? false,
        revisits:     parseInt(document.getElementById('rep-revisits')?.value)  || 0,
        studies:      parseInt(document.getElementById('rep-studies')?.value)   || 0,
        notes:        document.getElementById('rep-notes')?.value          || ''
      });

      if (!result.ok) {
        // Mostrar el mensaje de error real (viene de db.js → _friendlyError)
        const msg = result.message ?? 'Error desconocido al guardar el reporte.';
        toast(msg, 'error', 5000);
        return;
      }

      if (result.offline) {
        toast('Reporte guardado localmente. Se sincronizara al reconectar.', 'warning');
      } else {
        toast('Reporte guardado correctamente.', 'success');
      }

      closeAllModals();
      render();

    } catch (err) {
      console.error('[Reports] Error inesperado al guardar:', err);
      toast('Error inesperado. Intenta de nuevo.', 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = originalText;
    }
  });

  // PDF del turno actual
  document.getElementById('btn-pdf-single')?.addEventListener('click', async () => {
    const { slot } = state.currentSlot ?? {};
    if (!slot) return;
    const report = Reports.getBySlot(slot.id);
    if (!report) { toast('Guarda el reporte primero', 'error'); return; }
    try {
      await generatePDF([report], navigator.canShare ? 'share' : 'download');
    } catch (err) { toast(err.message ?? 'Error al generar PDF', 'error'); }
  });

  // PDF de todos los reportes
  document.getElementById('btn-pdf-all')?.addEventListener('click', async () => {
    const reports = Reports.getAll();
    if (!reports.length) { toast('No hay reportes para exportar', 'error'); return; }
    try {
      await generatePDF(reports, navigator.canShare ? 'share' : 'download');
    } catch (err) { toast(err.message ?? 'Error al generar PDF', 'error'); }
  });

  // PDF semanal
  document.getElementById('btn-pdf-week')?.addEventListener('click', async () => {
    loadState();
    if (!Object.keys(state.slots).length) { toast('No hay turnos cargados', 'error'); return; }
    try {
      toast('Generando reporte semanal...', 'info', 2000);
      await generateWeeklyPDF(state.slots, navigator.canShare ? 'share' : 'dow
