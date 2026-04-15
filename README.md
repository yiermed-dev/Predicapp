# 📖 PredicApp — Gestión de Turnos de Exhibidores

PWA para coordinar turnos semanales de predicación. Funciona offline una vez instalada gracias a Firestore con persistencia en IndexedDB.

## Estructura del proyecto

```
predicapp/
├── index.html          # Entry point + todos los modales
├── app.js              # Controlador principal + event listeners
├── config.js           # Constantes globales (DAYS, TIMES, capacidad, etc.)
├── db.js               # Capa de datos — Firestore + cache local
├── auth.js             # Autenticación con hash SHA-256
├── reservations.js     # Lógica de negocio de turnos
├── reports.js          # Módulo de reportes + generación de PDF (jsPDF)
├── ui.js               # Capa de presentación (tabla desktop + cards móvil)
├── toast.js            # Notificaciones, confirm y prompt no bloqueantes
├── style.css           # Estilos globales
├── sw.js               # Service Worker (PWA offline) — cache v3.0
├── manifest.json       # Metadatos PWA
├── vercel.json         # Configuración de despliegue en Vercel
└── assets/
    └── icons/
        ├── icon-192x192.png
        └── icon-512x512.png
```

## Lógica de turnos

Cada turno admite **mínimo 2 y máximo 3 personas**. Al reservar se selecciona:
- Un **participante principal**
- Un **compañero** (obligatorio)
- Un **segundo compañero** (opcional)

Estados de un turno:

| Estado     | Personas | Color                    |
|------------|----------|--------------------------|
| `free`     | 0        | Gris                     |
| `partial`  | 1        | Amarillo                 |
| `ready`    | 2        | Verde                    |
| `complete` | 3        | Verde oscuro (bloqueado) |

Los nombres de los participantes asignados se muestran directamente en cada celda del tablero (desktop y móvil).

## Funcionalidades

### Tablero público
- Vista semanal con estado visual por turno
- Nombres de los participantes visibles en cada celda
- Botón **Reservar** en turnos con cupo disponible
- Botón **📋 Registrar / Ver reporte** en turnos con participantes asignados

### Administrador
Acceso con contraseña desde el botón 🔐 Admin del header.

- **Cancelar turno** — libera todas las reservas del turno
- **Editar turno** — elimina reservas individuales dentro de un turno
- **Gestionar participantes** — agregar y eliminar
- **Gestionar puntos** — agregar y eliminar
- **Cambiar contraseña** de administrador
- **Exportar PDF** con todos los reportes registrados

### Reportes de turno
Cada turno con participantes asignados permite registrar:

| Campo              | Tipo     | Descripción                              |
|--------------------|----------|------------------------------------------|
| Fecha              | fecha    | Fecha en que se realizó el turno         |
| Hora de inicio     | hora     | Hora real de inicio                      |
| ¿Se cumplió?       | sí/no    | Si el turno se llevó a cabo              |
| ¿Conversaciones?   | sí/no    | Si se inició alguna conversación         |
| ¿Estudio bíblico?  | sí/no    | Si se hicieron arreglos para estudio     |
| Revisitas          | número   | Cantidad de revisitas realizadas         |
| Estudios           | número   | Cantidad de estudios activos             |
| Notas              | texto    | Observaciones libres del turno           |

Los turnos con reporte registrado muestran el badge 📋 en el tablero.

### Generación de PDF
- Genera PDF en el navegador (sin backend) usando **jsPDF** cargado desde CDN de forma lazy
- Incluye: participantes, punto, fecha, hora, resultados y notas
- **Compartir** si el dispositivo soporta Web Share API (Android/iOS con HTTPS)
- **Descarga directa** como fallback
- Disponible por turno individual o como exportación de todos los reportes

## Estructura de datos en Firestore

Todos los datos viven en la colección `predicapp_data`:

| Documento         | Contenido                                                |
|-------------------|----------------------------------------------------------|
| `slots`           | `{ Lun: [{ id, time, status, reservations[] }], ... }`  |
| `participants`    | `[{ name, phone }]`                                      |
| `points`          | `["Parroquia Central", ...]`                             |
| `admin_pass_hash` | Hash SHA-256 de la contraseña                            |
| `reports`         | Array de reportes (ver estructura abajo)                 |

### Estructura de un reporte

```json
{
  "id":           "Lun-07:00-09:00-1718000000000",
  "slotId":       "Lun-07:00-09:00",
  "day":          "Lun",
  "time":         "07:00-09:00",
  "point":        "Parroquia Central",
  "participants": ["Juan García", "María López"],
  "date":         "2025-06-10",
  "startTime":    "07:15",
  "fulfilled":    true,
  "conversation": true,
  "bibleStudy":   false,
  "revisits":     2,
  "studies":      1,
  "notes":        "Buen clima, mucha afluencia de personas.",
  "createdAt":    1718000000000
}
```

## Despliegue en Vercel

El proyecto es un sitio estático, no requiere build step.

1. Importa el repositorio en [vercel.com](https://vercel.com)
2. Configura:
   - **Framework Preset:** `Other`
   - **Build Command:** *(vacío)*
   - **Output Directory:** *(vacío)*
3. Despliega — el `vercel.json` incluido configura automáticamente los headers del Service Worker y el manifest

> Tras el primer despliegue, agrega tu dominio `.vercel.app` en Firebase Console → **Authentication → Authorized domains**.

## Reglas de seguridad de Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /predicapp_data/{key} {
      allow read: if true;
      allow write: if key == 'slots'
                   || key == 'points'
                   || key == 'participants'
                   || key == 'admin_pass_hash'
                   || key == 'reports';
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> Recuerda actualizar las reglas en Firebase Console para incluir `reports`.

## Contraseña de administrador

Por defecto: **`admin`**

Cámbiala desde el panel Admin → sección "Cambiar contraseña". Las contraseñas se almacenan como hash SHA-256, nunca en texto plano.

## Desarrollo local

No requiere dependencias ni build step. Sirve los archivos desde cualquier servidor HTTP estático:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Extensión Live Server → clic derecho en index.html → "Open with Live Server"
```

> El Service Worker requiere HTTPS en producción o `localhost` en desarrollo.

## Tecnologías

- Vanilla JS con ES Modules (`type="module"`)
- Firebase Firestore (tiempo real + offline con IndexedDB)
- jsPDF 2.5.1 (generación de PDF en cliente, carga lazy desde CDN)
- Web Share API (compartir PDF en móviles)
- Web Crypto API para hashing de contraseñas
- Service Worker con estrategia Cache First (v3.0)
- PWA instalable (manifest + iconos)
- Sin frameworks · Sin dependencias npm · Sin build step
- 
