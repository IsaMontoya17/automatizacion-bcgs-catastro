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

- **Acceso restringido**: inicio de sesión con usuario y contraseña, roles y expiración automática de sesión por inactividad.
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
│   └── src/
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
├── .env.example            # Plantilla de variables de entorno
└── package.json
```

> Los archivos descargados y los reportes generados (`envio_correos_mensuales/`) no se versionan.

## Requisitos previos

- [Node.js](https://nodejs.org/) (versión LTS recomendada)
- [MySQL](https://www.mysql.com/) en ejecución
- Credenciales institucionales de acceso a BCGS
- Una cuenta de correo con envío SMTP habilitado (ver [Configuración](#configuración))

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/IsaMontoya17/<nombre-del-repo>.git
cd <nombre-del-repo>

# 2. Instalar dependencias del backend
npm install

# 3. Instalar dependencias del frontend
cd frontend
npm install
cd ..
```

## Configuración

1. Copia la plantilla de variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Completa los valores en `.env`. Las variables principales son:

   | Variable | Descripción |
   | --- | --- |
   | `DATABASE_URL` | Cadena de conexión a MySQL |
   | `EMAIL_SERVICIO` | Proveedor de correo para Nodemailer (por defecto `gmail`) |
   | `EMAIL_USUARIO` | Cuenta remitente |
   | `EMAIL_CLAVE` | Contraseña o clave de aplicación del remitente |

   Consulta `.env.example` para ver la lista completa (credenciales de BCGS, secreto JWT, etc.).

3. Crea la base de datos y aplica las migraciones:

   ```bash
   npx prisma migrate deploy
   ```

4. Carga los datos iniciales (usuario administrador, los 113 municipios con su código BCGS y la plantilla de correo por defecto):

   ```bash
   npx prisma db seed
   ```

> **Nota sobre el correo:** las cuentas personales de Gmail solo sirven para pruebas puntuales. Para el envío real a los 113 municipios se requiere una cuenta institucional con SMTP/Microsoft Graph habilitado.

> **Nota sobre dependencias:** Prisma está fijado en la versión `5.22.0` y Puppeteer no debe actualizarse sin probar antes el flujo de BCGS, ya que es sensible a la versión.

## Ejecución

```bash
# Backend
npm start

# Frontend (en otra terminal)
cd frontend
npm run dev
```

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
