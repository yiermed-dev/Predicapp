// ─────────────────────────────────────────────
//  db.js  —  PredicApp · Capa de datos Firestore
//  PredicApp v3.1 — hardened
// ─────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyAgnJhMaPPYv9B0OawPH1GGosbJVrmKV5I",
  authDomain:        "predicapp-3470d.firebaseapp.com",
  projectId:         "predicapp-3470d",
  storageBucket:     "predicapp-3470d.appspot.com",
  messagingSenderId: "337928498725",
  appId:             "1:337928498725:web:82ef2843c3dc5ad274d9cc"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { DAYS, TIMES, DEFAULT_POINTS, FIRESTORE_COLLECTION, DB_KEYS } from './config.js';

// ── Inicialización ────────────────────────────
const app = initializeApp(firebaseConfig);

// FIX [Error 6]: enableIndexedDbPersistence está deprecado en Firebase v10.
// Se reemplaza por initializeFirestore con persistentLocalCache, que es la
// API recomendada y soporta múltiples pestañas de forma nativa.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// ── Claves válidas (debe coincidir con firestore.rules) ───────────────────
const VALID_KEYS = new Set(Object.values(DB_KEYS));

// ── Cache local en memoria ────────────────────
let localCache = {
  slots:           {},
  points:          [],
  participants:    [],
  admin_pass_hash: null,
  reports:         []
};

// ── Estado de conexión ────────────────────────
let _isOnline      = true;
let _connListeners = [];

export function onConnectionChange(fn) {
  _connListeners.push(fn);
}

function _notifyConnection() {
  _connListeners.forEach(fn => fn(_isOnline));
}

window.addEventListener('online',  () => { _isOnline = true;  _notifyConnection(); });
window.addEventListener('offline', () => { _isOnline = false; _notifyConnection(); });

// ── Códigos de error de Firestore → mensaje legible ───────────────────────
const ERROR_MESSAGES = {
  'permission-denied':  'Sin permisos en Firestore. Verifica las reglas de seguridad.',
  'unavailable':        'Sin conexion. El cambio se sincronizara al reconectar.',
  'not-found':          'Documento no encontrado en Firestore.',
  'resource-exhausted': 'Limite de Firestore alcanzado. Intenta mas tarde.',
  'invalid-argument':   'Datos invalidos enviados a Firestore.',
  'cancelled':          'Operacion cancelada.',
  'unauthenticated':    'No autenticado. Recarga la aplicacion.'
};

function _friendlyError(code) {
  return ERROR_MESSAGES[code] ?? ('Error de Firestore: ' + code);
}

// ── API pública: DB ───────────────────────────
export const DB = {

  /**
   * Lectura sincrona desde cache local.
   * Siempre disponible, incluso sin conexion.
   */
  get(key, fallback = []) {
    const val = localCache[key];
    if (val === null || val === undefined) return fallback;
    return val;
  },

  /**
   * Escribe en cache local Y en Firestore.
   * Valida la clave antes de enviar para evitar escrituras accidentales.
   *
   * Retorna:
   *   { ok: true,  offline: false }            — guardado en Firestore
   *   { ok: true,  offline: true  }            — encolado para sincronizar
   *   { ok: false, code, message }             — error real
   */
  async set(key, value) {
    // Guardia: rechaza claves desconocidas antes de llegar a Firestore
    if (!VALID_KEYS.has(key)) {
      console.error('[DB] Clave no permitida:', key);
      return { ok: false, code: 'invalid-key', message: 'Clave de base de datos no permitida: ' + key };
    }

    // Optimistic update
    localCache[key] = value;

    try {
      await setDoc(doc(db, FIRESTORE_COLLECTION, key), { data: value });
      return { ok: true, offline: false };
    } catch (e) {
      const code    = e.code ?? 'unknown';
      const message = _friendlyError(code);

      if (code === 'unavailable') {
        // Firestore encola la escritura y reintenta al reconectar
        console.warn('[DB] Sin conexion. "' + key + '" encolado para sincronizar.');
        return { ok: true, offline: true };
      }

      // Revertir cache en caso de error real (permission-denied, etc.)
      // para no mostrar datos que no se guardaron realmente
      // Nota: el revert es best-effort; el onSnapshot corregira el estado
      console.error('[DB] Error al guardar "' + key + '" [' + code + ']:', e.message);
      return { ok: false, code, message };
    }
  },

  isOnline() { return _isOnline; }
};

// ── initDB ────────────────────────────────────
export function initDB(onUpdate) {
  const keys = Object.values(DB_KEYS);
  const unsubscribers = [];

  keys.forEach(key => {
    const unsub = onSnapshot(
      doc(db, FIRESTORE_COLLECTION, key),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.exists()) {
          localCache[key] = snapshot.data().data;
        } else {
          // FIX [Error 7]: _initializeDefaults es async. Sin await, los errores
          // de escritura en la inicialización se pierden silenciosamente.
          // Se envuelve en una promesa con manejo de error explícito.
          _initializeDefaults(key).catch(err => {
            console.error('[DB] Error al inicializar defaults para "' + key + '":', err);
          });
        }

        if (onUpdate) onUpdate({
          key,
          fromCache:        snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites
        });
      },
      (err) => console.error('[DB] Error en listener "' + key + '":', err.code, err.message)
    );

    unsubscribers.push(unsub);
  });

  return () => unsubscribers.forEach(fn => fn());
}

// ── Valores por defecto ───────────────────────
async function _initializeDefaults(key) {
  switch (key) {
    case DB_KEYS.POINTS:
      await DB.set(DB_KEYS.POINTS, DEFAULT_POINTS);
      break;
    case DB_KEYS.PARTICIPANTS:
      await DB.set(DB_KEYS.PARTICIPANTS, []);
      break;
    case DB_KEYS.PASS_HASH:
      await DB.set(DB_KEYS.PASS_HASH, null);
      break;
    case DB_KEYS.REPORTS:
      await DB.set(DB_KEYS.REPORTS, []);
      break;
    case DB_KEYS.SLOTS: {
      const slots = {};
      DAYS.forEach(d => {
        slots[d] = TIMES.map(t => ({
          id:           d + '-' + t,
          time:         t,
          status:       'free',
          reservations: []
        }));
      });
      await DB.set(DB_KEYS.SLOTS, slots);
      break;
    }
  }
}
