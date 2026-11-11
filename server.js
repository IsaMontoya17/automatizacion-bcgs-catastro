const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const prisma = require('./src/config/prisma');
const { ejecutarDescargaResoluciones } = require('./src/automatizacion-bcgs/descargarResoluciones');
const { ejecutarEnvioCorreos, reintentarEnvioMunicipios } = require('./src/correo/enviarCorreos');
const { verificarToken, requiereRol } = require('./src/auth/authMiddleware');
const { listarMunicipios, actualizarCorreosMunicipio } = require('./src/automatizacion-bcgs/municipiosController');
const { obtenerPlantilla, actualizarPlantilla } = require('./src/correo/plantillaController');
const { listarCorreosNotificacion, agregarCorreoNotificacion, eliminarCorreoNotificacion } = require('./src/correo/notificacionController');
const { listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario } = require('./src/usuarios/usuariosController');
const { login, solicitarRecuperacion, restablecerPassword } = require('./src/auth/authController');

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  socket.on('unirse_ejecucion', (id) => {
    socket.join(String(id));
  });
});

// Buffer en memoria de eventos en vivo para Socket.io. No es la fuente de
// verdad: si el servidor se reinicia, el estado se reconstruye desde MySQL
// (ver construirEstadoDesdeBD más abajo).
const ejecuciones = new Map();
let hayEjecucionEnProgreso = false;

app.post('/api/auth/login', login);

app.post('/api/auth/recuperar/solicitar', solicitarRecuperacion);
app.post('/api/auth/recuperar/restablecer', restablecerPassword);

app.post('/api/descargas', verificarToken, async (req, res) => {
  const { mes, anio } = req.body;

  if (!mes || !anio || mes < 1 || mes > 12) {
    return res.status(400).json({ error: 'Debes enviar "mes" (1-12) y "anio" válidos.' });
  }

  if (hayEjecucionEnProgreso) {
    return res.status(409).json({ error: 'Ya existe una ejecución en progreso. Espera a que finalice.' });
  }

  hayEjecucionEnProgreso = true;

  let ejecucion;
  try {
    ejecucion = await prisma.ejecucion.create({
      data: { mes, anio, usuarioId: req.usuario.id, estatus: 'en_progreso' },
    });
  } catch (err) {
    hayEjecucionEnProgreso = false;
    console.error('Error al registrar la ejecución:', err.message);
    return res.status(500).json({ error: 'No se pudo registrar la ejecución en la base de datos.' });
  }

  const id = String(ejecucion.id);
  const estado = {
    id,
    mes,
    anio,
    estatus: 'en_progreso',
    eventos: [],
    reporte: null,
    error: null,
  };
  ejecuciones.set(id, estado);

  const emitirYGuardar = (evento) => {
    const eventoConFecha = { ...evento, fecha: new Date().toISOString() };
    estado.eventos.push(eventoConFecha);
    io.to(id).emit('progreso', eventoConFecha);
  };

  ejecutarDescargaResoluciones(mes, anio, {
    ejecucionId: ejecucion.id,
    headless: true,
    onProgreso: emitirYGuardar,
  })
    .then((reporteDescarga) => {
      emitirYGuardar({ tipo: 'iniciando_envio_correos' });
      return ejecutarEnvioCorreos(mes, anio, {
        ejecucionId: ejecucion.id,
        onProgreso: emitirYGuardar,
      }).then((reporteEnvio) => {
        estado.estatus = 'completado';
        estado.reporte = { descarga: reporteDescarga, envio: reporteEnvio };
        io.to(id).emit('estado_final', { estatus: 'completado', reporte: estado.reporte });
      });
    })
    .catch((err) => {
      console.error('Error en la ejecución:', err.message);
      estado.estatus = 'error';
      estado.error = err.message;
      io.to(id).emit('estado_final', { estatus: 'error', error: err.message });
    })
    .finally(() => {
      hayEjecucionEnProgreso = false;
    });

  res.status(202).json({ id, estatus: estado.estatus });
});

/**
 * Reconstruye el estado de una ejecución consultando MySQL, para el caso en
 * que el servidor se haya reiniciado y el Map() en memoria ya no la tenga.
 * Si la ejecución quedó marcada "en_progreso" pero no hay proceso corriendo
 * (justamente porque el servidor se reinició), no hay forma de retomar la
 * sesión de Puppeteer/Nodemailer: se marca como error para no dejarla
 * atascada indefinidamente.
 */
async function construirEstadoDesdeBD(idNumerico) {
  const ejecucion = await prisma.ejecucion.findUnique({
    where: { id: idNumerico },
    include: {
      resultadosDescarga: { include: { municipio: true } },
      resultadosEnvio: { include: { municipio: true } },
    },
  });

  if (!ejecucion) return null;

  const reporteDescarga = { exitosos: [], sin_resoluciones: [], fallidos: [] };
  for (const r of ejecucion.resultadosDescarga) {
    const item = { municipio: r.municipio.nombre, codigo: r.municipio.codigoBcgs };
    if (r.estatus === 'exitoso') reporteDescarga.exitosos.push({ ...item, archivo: r.archivo });
    else if (r.estatus === 'sin_resoluciones') reporteDescarga.sin_resoluciones.push(item);
    else reporteDescarga.fallidos.push({ ...item, error: r.error });
  }

  const reporteEnvio = { exitosos: [], requieren_revision_manual: [], omitidos: [] };
  for (const r of ejecucion.resultadosEnvio) {
    const item = { municipio: r.municipio.nombre, codigo: r.municipio.codigoBcgs };
    if (r.estatus === 'exitoso') reporteEnvio.exitosos.push({ ...item, intentos: r.intentos });
    else reporteEnvio.requieren_revision_manual.push({ ...item, error: r.tipoError });
  }

  let estatus = ejecucion.estatus;
  let error = null;

  if (estatus === 'en_progreso') {
    // El servidor se reinició mientras esta ejecución seguía corriendo:
    // no hay forma de retomarla, así que se marca como interrumpida.
    error = 'La ejecución quedó interrumpida (el servidor se reinició mientras corría) y no pudo completarse.';
    await prisma.ejecucion.update({
      where: { id: idNumerico },
      data: { estatus: 'error', fechaFin: new Date() },
    });
    estatus = 'error';
  }

  // "parcial" indica que los conteos de abajo pueden no representar el total
  // real de municipios (113): solo reflejan lo que alcanzó a procesarse antes
  // de la interrupción. Distinto de un "error" real durante una ejecución que
  // sí llegó a completar todas sus fases.
  const parcial = estatus === 'error';
  const hayResultados = ejecucion.resultadosDescarga.length > 0 || ejecucion.resultadosEnvio.length > 0;

  return {
    id: String(ejecucion.id),
    mes: ejecucion.mes,
    anio: ejecucion.anio,
    estatus,
    eventos: [],
    reporte: hayResultados
      ? {
          descarga: reporteDescarga,
          envio: reporteEnvio,
          envioIniciado: ejecucion.resultadosEnvio.length > 0,
          parcial,
        }
      : null,
    error,
  };
}

app.get('/api/descargas/:id', verificarToken, async (req, res) => {
  const estadoEnMemoria = ejecuciones.get(req.params.id);
  if (estadoEnMemoria) {
    return res.json(estadoEnMemoria);
  }

  const idNumerico = parseInt(req.params.id, 10);
  if (!idNumerico) {
    return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
  }

  try {
    const estadoDesdeBD = await construirEstadoDesdeBD(idNumerico);
    if (!estadoDesdeBD) {
      return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
    }
    res.json(estadoDesdeBD);
  } catch (err) {
    console.error('Error al reconstruir la ejecución desde la base de datos:', err.message);
    res.status(500).json({ error: 'No se pudo consultar la ejecución.' });
  }
});

/**
 * POST /api/descargas/:id/reintentar-envio
 * body: { "codigos": ["895", "002"] }  — opcional; si se omite o viene vacío,
 * reintenta TODOS los municipios que actualmente estén en "requieren_revision_manual".
 */
app.post('/api/descargas/:id/reintentar-envio', verificarToken, async (req, res) => {
  let estado = ejecuciones.get(req.params.id);

  const idNumerico = parseInt(req.params.id, 10);
  if (!idNumerico) {
    return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
  }

  if (!estado) {
    try {
      estado = await construirEstadoDesdeBD(idNumerico);
    } catch (err) {
      return res.status(500).json({ error: 'No se pudo consultar la ejecución.' });
    }
  }

  if (!estado) {
    return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
  }

  if (estado.estatus !== 'completado') {
    return res.status(409).json({ error: 'Solo se puede reintentar el envío de una ejecución ya completada.' });
  }

  if (hayEjecucionEnProgreso) {
    return res.status(409).json({ error: 'Hay una ejecución o reintento en progreso. Espera a que finalice.' });
  }

  const pendientes = estado.reporte?.envio?.requieren_revision_manual ?? [];
  if (pendientes.length === 0) {
    return res.status(400).json({ error: 'No hay municipios pendientes de revisión manual en esta ejecución.' });
  }

  const { codigos } = req.body || {};
  const codigosObjetivo = Array.isArray(codigos) && codigos.length > 0
    ? codigos
    : pendientes.map((m) => m.codigo);

  const invalidos = codigosObjetivo.filter(
    (c) => !pendientes.some((m) => String(m.codigo) === String(c))
  );
  if (invalidos.length > 0) {
    return res.status(400).json({
      error: `Los siguientes códigos no están pendientes de revisión manual: ${invalidos.join(', ')}`,
    });
  }

  hayEjecucionEnProgreso = true;
  ejecuciones.set(req.params.id, estado); // por si venía reconstruido de la BD, ahora queda en memoria

  const emitirYGuardar = (evento) => {
    const eventoConFecha = { ...evento, fecha: new Date().toISOString() };
    estado.eventos.push(eventoConFecha);
    io.to(req.params.id).emit('progreso', eventoConFecha);
  };

  reintentarEnvioMunicipios(estado.mes, estado.anio, codigosObjetivo, {
    ejecucionId: idNumerico,
    onProgreso: emitirYGuardar,
  })
    .then((reporteEnvioActualizado) => {
      estado.reporte = { ...estado.reporte, envio: reporteEnvioActualizado };
      io.to(req.params.id).emit('estado_final', { estatus: 'completado', reporte: estado.reporte });
    })
    .catch((err) => {
      console.error('Error al reintentar el envío:', err.message);
      io.to(req.params.id).emit('estado_final', {
        estatus: 'completado',
        reporte: estado.reporte,
        errorReintento: err.message,
      });
    })
    .finally(() => {
      hayEjecucionEnProgreso = false;
    });

  res.status(202).json({ mensaje: 'Reintento de envío iniciado.', codigos: codigosObjetivo });
});

/**
 * GET /api/admin/municipios
 * PUT /api/admin/municipios/:id/correos
 * Panel de Administración (RF-24): gestión de correos de contacto por
 * municipio. Restringido al rol "administrador".
 */
app.get('/api/admin/municipios', verificarToken, requiereRol('administrador'), listarMunicipios);
app.put('/api/admin/municipios/:id/correos', verificarToken, requiereRol('administrador'), actualizarCorreosMunicipio);
app.get('/api/admin/plantilla', verificarToken, requiereRol('administrador'), obtenerPlantilla);
app.put('/api/admin/plantilla', verificarToken, requiereRol('administrador'), actualizarPlantilla);

/**
 * GET /api/admin/notificaciones
 * POST /api/admin/notificaciones
 * DELETE /api/admin/notificaciones/:id
 * RF-19: correos que reciben la notificación de "proceso finalizado
 * correctamente" al terminar la distribución mensual. Restringido al rol
 * "administrador", igual que el resto del Panel de Administración.
 */
app.get('/api/admin/notificaciones', verificarToken, requiereRol('administrador'), listarCorreosNotificacion);
app.post('/api/admin/notificaciones', verificarToken, requiereRol('administrador'), agregarCorreoNotificacion);
app.delete('/api/admin/notificaciones/:id', verificarToken, requiereRol('administrador'), eliminarCorreoNotificacion);

app.use('/api/ejecuciones', require('./src/automatizacion-bcgs/historialRoutes'));

app.get('/api/admin/usuarios', verificarToken, requiereRol('administrador'), listarUsuarios);
app.post('/api/admin/usuarios', verificarToken, requiereRol('administrador'), crearUsuario);
app.put('/api/admin/usuarios/:id', verificarToken, requiereRol('administrador'), actualizarUsuario);
app.delete('/api/admin/usuarios/:id', verificarToken, requiereRol('administrador'), eliminarUsuario);

const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
  console.log(`Servidor escuchando en http://localhost:${PUERTO}`);
});

module.exports = app;