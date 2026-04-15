// ─────────────────────────────────────────────
//  reservations.js  —  Lógica de negocio de turnos
//  PredicApp v3.0
// ─────────────────────────────────────────────

import { MAX_RESERVATIONS_PER_SLOT } from './config.js';

// ── Utilidades ────────────────────────────────

/**
 * Total de personas en un turno (principal + compañeros de cada reserva).
 * @param {object} slot
 * @returns {number}
 */
export function countPeople(slot) {
  return slot.reservations.reduce((sum, r) => {
    return sum + 1 + (r.companions?.length ?? 0);
  }, 0);
}

/**
 * Calcula el estado del turno según ocupación.
 * @param {object} slot
 * @returns {'free'|'partial'|'ready'|'complete'}
 */
export function computeStatus(slot) {
  const n = countPeople(slot);
  if (n === 0)                        return 'free';
  if (n >= MAX_RESERVATIONS_PER_SLOT) return 'complete';
  if (n === 2)                        return 'ready';
  return 'partial';
}

/**
 * Todos los nombres del turno (principales + compañeros), sin duplicados.
 * @param {object} slot
 * @returns {string[]}
 */
export function getPeopleNames(slot) {
  const names = new Set();
  slot.reservations.forEach(r => {
    names.add(r.name);
    r.companions?.forEach(c => names.add(c));
  });
  return [...names];
}

/**
 * Punto de predicación del turno (del primer reservante).
 * @param {object} slot
 * @returns {string}
 */
export function getSlotPoint(slot) {
  return slot.reservations[0]?.point ?? '';
}

// ── Validación ────────────────────────────────

/**
 * Valida si se puede agregar una reserva al turno.
 * Los compañeros son opcionales (se filtran los vacíos).
 *
 * @param {object}   slot
 * @param {string}   name        - Participante principal
 * @param {string}   point       - Punto de predicación
 * @param {string[]} companions  - 0, 1 o 2 compañeros
 * @returns {{ok:boolean, error?:string, companions?:string[]}}
 */
export function validateReservation(slot, name, point, companions = []) {
  if (!name || !point) {
    return { ok: false, error: 'Debes seleccionar participante y punto.' };
  }

  const valid = companions.filter(c => c && c !== '');

  if (valid.length > 2) {
    return { ok: false, error: 'Maximo dos companeros por reserva.' };
  }
  if (valid.some(c => c === name)) {
    return { ok: false, error: 'Un companero no puede ser el mismo que el participante principal.' };
  }
  if (valid.length === 2 && valid[0] === valid[1]) {
    return { ok: false, error: 'Los dos companeros no pueden ser la misma persona.' };
  }

  const current  = countPeople(slot);
  const incoming = 1 + valid.length;

  if (current + incoming > MAX_RESERVATIONS_PER_SLOT) {
    return { ok: false, error: 'Solo quedan ' + (MAX_RESERVATIONS_PER_SLOT - current) + ' cupo(s).' };
  }
  if (slot.reservations.some(r => r.name === name)) {
    return { ok: false, error: name + ' ya esta en este turno.' };
  }

  // FIX [Error 8]: Validar también que el participante principal no aparezca
  // ya como compañero en otra reserva del mismo turno. Sin esta verificación,
  // la misma persona podía estar como "companion" en una reserva existente y
  // luego registrarse como "name" en una nueva, creando duplicados silenciosos.
  if (slot.reservations.some(r => r.companions?.includes(name))) {
    return { ok: false, error: name + ' ya participa en este turno como companero.' };
  }

  for (const comp of valid) {
    const used = slot.reservations.some(r =>
      r.name === comp || r.companions?.includes(comp)
    );
    if (used) return { ok: false, error: comp + ' ya participa en este turno.' };
  }

  return { ok: true, companions: valid };
}

// ── Mutaciones ────────────────────────────────

/**
 * Agrega una reserva al turno. Muta el objeto slot.
 */
export function addReservation(slot, name, point, companions = []) {
  const validation = validateReservation(slot, name, point, companions);
  if (!validation.ok) return validation;

  slot.reservations.push({
    name,
    point,
    companions: companions.filter(c => c && c !== '')
  });
  slot.status = computeStatus(slot);
  return { ok: true };
}

/**
 * Elimina la reserva de un participante principal. Muta el objeto slot.
 */
export function removeReservation(slot, name) {
  const idx = slot.reservations.findIndex(r => r.name === name);
  if (idx === -1) return { ok: false, error: 'Reserva no encontrada.' };

  slot.reservations.splice(idx, 1);
  slot.status = computeStatus(slot);
  return { ok: true };
}

/**
 * Cancela el turno completo: limpia todas las reservas. Muta el objeto slot.
 */
export function cancelSlot(slot) {
  slot.reservations = [];
  slot.status       = 'free';
  return { ok: true };
}
