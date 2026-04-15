// ─────────────────────────────────────────────
//  config.js  —  Fuente única de verdad
//  PredicApp v3.0
// ─────────────────────────────────────────────

// ── Versión de la app ─────────────────────────
// Sincronizar con CACHE_NAME en sw.js al actualizar
export const APP_VERSION = '3.0';

// ── Días de la semana ─────────────────────────
// Claves cortas usadas como IDs internos y en Firestore
export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Nombres completos para UI y PDF
export const FULL_DAY_NAMES = {
  Lun: 'Lunes',
  Mar: 'Martes',
  Mié: 'Miércoles',
  Jue: 'Jueves',
  Vie: 'Viernes',
  Sáb: 'Sábado',
  Dom: 'Domingo'
};

// Nombres sin tildes para jsPDF (evita caracteres no soportados)
export const FULL_DAY_NAMES_PDF = {
  Lun: 'Lunes',
  Mar: 'Martes',
  Mié: 'Miercoles',
  Jue: 'Jueves',
  Vie: 'Viernes',
  Sáb: 'Sabado',
  Dom: 'Domingo'
};

// ── Franjas horarias ──────────────────────────
export const TIMES = [
  '07:00-09:00',
  '09:00-11:00',
  '11:00-13:00',
  '13:00-15:00',
  '15:00-17:00',
  '17:00-19:00'
];

// ── Capacidad por turno ───────────────────────
// Estados resultantes:
//   0 personas → 'free'     (gris    — libre)
//   1 persona  → 'partial'  (amarillo — incompleto)
//   2 personas → 'ready'    (azul    — listo, acepta uno más)
//   3 personas → 'complete' (verde   — bloqueado)
export const MIN_RESERVATIONS_PER_SLOT = 2;
export const MAX_RESERVATIONS_PER_SLOT = 3;

// ── Puntos de predicación por defecto ─────────
// Solo se usan la primera vez que se inicializa Firestore.
// El admin puede agregar/eliminar puntos desde el panel.
export const DEFAULT_POINTS = [
  'Parroquia Central',
  'Plaza Norte',
  'Barrio Sur'
];

// ── Firestore ─────────────────────────────────
// Nombre de la colección raíz en Firestore
export const FIRESTORE_COLLECTION = 'predicapp_data';

// Claves de documentos — deben coincidir con las reglas de seguridad
export const DB_KEYS = {
  SLOTS:      'slots',
  POINTS:     'points',
  PARTICIPANTS: 'participants',
  PASS_HASH:  'admin_pass_hash',
  REPORTS:    'reports'
};

// ── Autenticación ─────────────────────────────
// Hash SHA-256 de 'admin' — cambiar desde el panel Admin tras el primer uso.
// Para regenerar: en consola del navegador ejecuta:
//   const e = new TextEncoder();
//   const b = await crypto.subtle.digest('SHA-256', e.encode('tu_pass'));
//   console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''));
export const DEFAULT_PASS_HASH =
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// ── Prefijo legacy (ya no se usa, conservado por compatibilidad) ──
export const STORAGE_PREFIX = 'predicapp_';
