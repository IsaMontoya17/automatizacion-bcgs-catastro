# Automatización BCGS — Gerencia de Catastro

Aplicación web que automatiza la descarga mensual de resoluciones catastrales desde la plataforma **BCGS** y su envío masivo por correo electrónico a los **113 municipios de Antioquia**, con monitoreo en tiempo real, trazabilidad e historial de ejecuciones.

> Proyecto desarrollado como Trabajo de Grado / práctica profesional en la Gerencia de Catastro del Departamento Administrativo de Planeación — Gobernación de Antioquia.

---

## Tabla de contenido

- [Contexto](#contexto)
- [Características](#características)
- [Tecnologías](#tecnologías)
- [Arquitectura y estructura del proyecto](#arquitectura-y-estructura-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Ejecución](#ejecución)
- [Uso](#uso)
- [Alcance y limitaciones](#alcance-y-limitaciones)
- [Autora](#autora)

---

## Contexto

Cada mes, la Gerencia de Catastro debe entregar a cada municipio las resoluciones catastrales que le corresponden, en cumplimiento del artículo 10 de la Resolución 746 de 2024 del IGAC. Este proceso se hacía de forma manual: descargar 113 archivos desde BCGS, organizarlos y enviar un correo a cada municipio.

Esta aplicación reemplaza ese flujo manual por un proceso automático, auditable y operable por personal sin conocimientos técnicos.

## Características

- **Acceso restringido**: inicio de sesión con usuario y contraseña, roles y expiración automática de sesión.
- **Descarga automática desde BCGS**: autenticación, navegación y recorrido de los 113 municipios para el mes y año seleccionados.
- **Organización de archivos** por mes y año.
- **Envío masivo de correos** con la resolución adjunta, plantilla configurable (asunto y mensaje con mes, año y municipio como valores dinámicos) y destinatarios Para/CC/CCO por municipio.
- **Reintentos automáticos** (hasta 3 por municipio); si persiste el fallo, se marca como *Requiere revisión manual* sin detener el proceso.
- **Monitoreo en tiempo real** del avance (municipio actual, procesados, éxitos y fallos) mediante WebSockets.
- **Historial y reportes**: consulta de ejecuciones anteriores y exportación del reporte final en PDF o Excel.
- **Panel de administración**: gestión de contactos municipales, plantilla de correo, correos de notificación de finalización y cuentas de usuario.
- **Trazabilidad completa** de cada ejecución (usuario, fecha, hora y resultados).

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| Backend | Node.js, Express, Prisma ORM, MySQL |
| Frontend | React, Vite, Ant Design, Tailwind CSS |
| Automatización | Puppeteer |
| Tiempo real | Socket.io |
| Correo | Nodemailer |
| Autenticación | JWT, bcrypt |
| Reportes | ExcelJS, PDFKit |

## Arquitectura y estructura del proyecto

El código está organizado de forma modular por dominio (automatización BCGS, correo, autenticación, etc.) para facilitar su mantenimiento.

```text
.
├── frontend/               # Aplicación React (Vite)
│   ├── src/
│   └── .env.example        # Plantilla de variables del frontend
├── prisma/                 # Esquema de base de datos, migraciones y seed
├── src/
│   ├── auth/               # Autenticación y control de acceso por rol
│   ├── automatizacion-bcgs/# Descarga con Puppeteer, historial y municipios
│   ├── correo/             # Envío de correos y plantillas
│   ├── usuarios/           # Administración de usuarios
│   ├── config/             # Configuración y cliente de Prisma
│   ├── scripts/            # Scripts de utilidad
│   └── utils/
├── server.js               # Punto de entrada del servidor
├── .env.example            # Plantilla de variables del backend
└── package.json
```

> Los archivos descargados y los reportes generados (`envio_correos_mensuales/`) no se versionan.

## Requisitos previos

- [Node.js](https://nodejs.org/) (versión LTS recomendada)
- [MySQL](https://www.mysql.com/) en ejecución. El usuario de MySQL debe usar el plugin de autenticación `caching_sha2_password` o `mysql_native_password`; `sha256_password` no es compatible con Prisma.
- Credenciales institucionales de acceso a BCGS
- Una cuenta de correo con envío SMTP habilitado (ver [Configuración](#configuración))

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/IsaMontoya17/automatizacion-bcgs-catastro.git
cd automatizacion-bcgs-catastro

# 2. Instalar dependencias del backend
npm install

# 3. Instalar dependencias del frontend
cd frontend
npm install
cd ..
```

## Configuración

El proyecto necesita **dos archivos `.env`**: uno para el backend (en la raíz) y otro para el frontend (dentro de `frontend/`). Ambos vienen como plantilla con el sufijo `.example`, y **antes de correr el programa hay que quitarle el `.example` al nombre** para que el sistema los reconozca.

> Esta configuración la realiza una sola vez la persona que instala el sistema. Los usuarios finales no interactúan con estos archivos.

### 1. Variables del backend (`.env` en la raíz)

1. Renombra el archivo `.env.example` a `.env` (quítale el `.example`). También puedes copiarlo:

   ```bash
   cp .env.example .env
   ```

2. Abre el `.env` y completa los valores. Las variables principales son:

   | Variable | Descripción |
   | --- | --- |
   | `DATABASE_URL` | Cadena de conexión a MySQL. **Cambia el usuario y la clave por los de tu propio MySQL** |
   | `JWT_SECRET` | Cadena larga y aleatoria, propia de cada instalación (ver abajo) |
   | `EMAIL_SERVICIO` | Proveedor de correo para Nodemailer (por defecto `gmail`) |
   | `EMAIL_USUARIO` | Cuenta remitente |
   | `EMAIL_CLAVE` | Contraseña o clave de aplicación del remitente |

   Consulta `.env.example` para ver la lista completa (credenciales de BCGS, duración de la sesión, etc.).

3. **Cambia el usuario y la clave en `DATABASE_URL`** por los de tu MySQL. El formato es:

   ```dotenv
   DATABASE_URL="mysql://TU_USUARIO:TU_CLAVE@localhost:3306/catastro_resoluciones"
   ```

   Por ejemplo, si tu usuario es `root` y tu clave es `1234`, quedaría `mysql://root:1234@localhost:3306/catastro_resoluciones`. El valor de la plantilla (`usuario:clave`) es solo un ejemplo y no funcionará tal cual.

4. Genera tu propio `JWT_SECRET` con este comando y pega el resultado como valor:

   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### 2. Variables del frontend (`frontend/.env`)

1. Dentro de la carpeta `frontend/`, renombra `.env.example` a `.env` (quítale el `.example`):

   ```bash
   cd frontend
   cp .env.example .env
   cd ..
   ```

2. El archivo contiene la dirección del backend:

   ```dotenv
   VITE_API_URL=http://localhost:3000
   ```

   Si el backend corre en otro puerto o servidor, ajusta este valor. Sin este archivo, el frontend no sabe a dónde enviar las peticiones y el inicio de sesión falla.

### 3. Base de datos

1. Crea la base de datos vacía en MySQL, con el mismo nombre que pusiste en `DATABASE_URL`:

   ```sql
   CREATE DATABASE catastro_resoluciones;
   ```

2. Aplica las migraciones:

   ```bash
   npx prisma migrate deploy
   ```

3. Carga los datos iniciales (usuario administrador, los 113 municipios con su código BCGS y la plantilla de correo por defecto):

   ```bash
   npx prisma db seed
   ```

> **Nota sobre el correo:** las cuentas personales de Gmail solo sirven para pruebas puntuales. Para el envío real a los 113 municipios se requiere una cuenta institucional con SMTP/Microsoft Graph habilitado.

> **Nota sobre dependencias:** Prisma está fijado en la versión `5.22.0` y Puppeteer no debe actualizarse sin probar antes el flujo de BCGS, ya que es sensible a la versión. Por la misma razón, no se recomienda ejecutar `npm audit fix --force`.

## Ejecución

```bash
# Backend (en la raíz del proyecto)
npm start

# Frontend (en otra terminal)
cd frontend
npm run dev
```

El frontend queda disponible en `http://localhost:5173` y el backend en `http://localhost:3000`. Si cambias algún archivo `.env`, reinicia el proceso correspondiente: ni el backend ni Vite recargan las variables en caliente.

Revisa la sección `scripts` de `package.json` para ver los comandos disponibles.

## Uso

1. Inicia sesión con una cuenta autorizada.
2. En el **Panel de Ejecución**, selecciona el mes y el año y presiona **Ejecutar**.
3. Sigue el avance municipio por municipio en el **Panel de Monitoreo**.
4. Al finalizar, consulta o exporta el reporte (PDF/Excel) desde el **Historial**.
5. Desde **Administración** puedes gestionar contactos de municipios, la plantilla de correo, los correos de notificación y los usuarios.

No se puede iniciar una nueva ejecución mientras otra esté en progreso.

## Alcance y limitaciones

- Uso interno e institucional; el despliegue en internet público está fuera de alcance.
- Diseñada para pantallas de computador (sin soporte para móvil o tablet).
- No incluye migración de datos históricos.

## Autora

**Isabela Montoya Alarcón**
Estudiante de Ingeniería Informática — Politécnico Colombiano Jaime Isaza Cadavid
GitHub: [@IsaMontoya17](https://github.com/IsaMontoya17)
