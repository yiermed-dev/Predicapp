// ─────────────────────────────────────────────
//  auth.js  —  Autenticación de administrador
//
//  Estrategia:
//    - Sin backend ni Firebase Auth
//    - La contraseña se guarda como hash SHA-256 en Firestore
//    - La verificación ocurre 100% en el cliente
//    - Compatible con funcionamiento offline
// ─────────────────────────────────────────────

import { DB }               from './db.js';
import { DEFAULT_PASS_HASH } from './config.js';

/**
 * Genera el hash SHA-256 de un texto.
 * Usa la Web Crypto API nativa del navegador (sin dependencias).
 *
 * @param {string} text
 * @returns {Promise<string>} Hash en hexadecimal
 */
export async function hashPassword(text) {
  const encoder    = new TextEncoder();
  const data       = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica si la contraseña ingresada coincide con la almacenada.
 * Usa el hash de Firestore si existe; si no, usa el hash por defecto.
 *
 * @param {string} inputPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(inputPassword) {
  const inputHash  = await hashPassword(inputPassword);
  const storedHash = DB.get('admin_pass_hash', null) || DEFAULT_PASS_HASH;
  return inputHash === storedHash;
}

/**
 * Cambia la contraseña del administrador.
 * Verifica la contraseña actual antes de guardar la nueva.
 *
 * @param {string} oldPassword  - Contraseña actual
 * @param {string} newPassword  - Nueva contraseña (mínimo 6 caracteres)
 * @returns {Promise<{ok:boolean, error?:string, warning?:string}>}
 */
export async function changePassword(oldPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  }

  if (newPassword === oldPassword) {
    return { ok: false, error: 'La nueva contraseña debe ser diferente a la actual.' };
  }

  const verified = await verifyPassword(oldPassword);
  if (!verified) {
    return { ok: false, error: 'La contraseña actual es incorrecta.' };
  }

  const newHash        = await hashPassword(newPassword);
  const { ok, offline } = await DB.set('admin_pass_hash', newHash);

  if (!ok)     return { ok: false, error: 'Error al guardar. Intenta de nuevo.' };
  if (offline) return { ok: true,  warning: 'Sin conexión — el cambio se aplicará al reconectar.' };
  return { ok: true };
}
