const prisma = require('../config/prisma');
const { generarReporteExcel, generarReportePdf } = require('./reportesEjecucion');

function agruparYContar(filas, mapaResumen, clave) {
  const ultimaPorEjecucionMunicipio = new Map();
  for (const f of filas) {
    ultimaPorEjecucionMunicipio.set(`${f.ejecucionId}:${f.municipioId}`, f);
  }
  for (const f of ultimaPorEjecucionMunicipio.values()) {
    const resumen = mapaResumen.get(f.ejecucionId);
    if (!resumen) continue;
    resumen[clave][f.estatus] = (resumen[clave][f.estatus] || 0) + 1;
  }
}

async function listarEjecuciones(req, res) {
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 10, 1), 50);

  const where = {};
  if (req.query.mes) where.mes = parseInt(req.query.mes, 10);
  if (req.query.anio) where.anio = parseInt(req.query.anio, 10);
  if (req.query.usuarioId) where.usuarioId = parseInt(req.query.usuarioId, 10);
  if (req.query.estatus) where.estatus = req.query.estatus;

  try {
    const [total, ejecuciones] = await Promise.all([
      prisma.ejecucion.count({ where }),
      prisma.ejecucion.findMany({
        where,
        include: { usuario: { select: { id: true, nombre: true, usuario: true } } },
        orderBy: { fechaInicio: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    const idsPagina = ejecuciones.map((e) => e.id);

    const [filasDescarga, filasEnvio] = await Promise.all([
      idsPagina.length
        ? prisma.resultadoDescarga.findMany({
            where: { ejecucionId: { in: idsPagina } },
            select: { id: true, ejecucionId: true, municipioId: true, estatus: true },
            orderBy: { id: 'asc' },
          })
        : [],
      idsPagina.length
        ? prisma.resultadoEnvio.findMany({
            where: { ejecucionId: { in: idsPagina } },
            select: { id: true, ejecucionId: true, municipioId: true, estatus: true },
            orderBy: { id: 'asc' },
          })
        : [],
    ]);

    const resumenPorEjecucion = new Map(idsPagina.map((id) => [id, { descarga: {}, envio: {} }]));
    agruparYContar(filasDescarga, resumenPorEjecucion, 'descarga');
    agruparYContar(filasEnvio, resumenPorEjecucion, 'envio');

    const resultado = ejecuciones.map((e) => {
      const resumen = resumenPorEjecucion.get(e.id) || { descarga: {}, envio: {} };
      const tieneRevisionManual = (resumen.envio.requiere_revision_manual ?? 0) > 0;
      const estadoResumen = tieneRevisionManual && e.estatus === 'completado'
        ? 'con_revision_pendiente'
        : e.estatus;

      return {
        id: e.id,
        mes: e.mes,
        anio: e.anio,
        estatus: e.estatus,
        estadoResumen,
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
        usuario: e.usuario,
        resumen,
      };
    });

    res.json({
      total,
      pagina,
      porPagina,
      totalPaginas: Math.ceil(total / porPagina),
      ejecuciones: resultado,
    });
  } catch (err) {
    console.error('Error al listar el historial de ejecuciones:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el historial de ejecuciones.' });
  }
}

function dedupeUltimoPorMunicipio(filas) {
  const porMunicipio = new Map();
  for (const f of filas) porMunicipio.set(f.municipioId, f);
  return Array.from(porMunicipio.values());
}

function contarPorEstatus(filas) {
  return filas.reduce((acc, f) => {
    acc[f.estatus] = (acc[f.estatus] || 0) + 1;
    return acc;
  }, {});
}

async function construirDetalleEjecucion(ejecucionId) {
  const ejecucion = await prisma.ejecucion.findUnique({
    where: { id: ejecucionId },
    include: {
      usuario: { select: { id: true, nombre: true, usuario: true } },
      resultadosDescarga: { include: { municipio: true }, orderBy: { id: 'asc' } },
      resultadosEnvio: { include: { municipio: true }, orderBy: { id: 'asc' } },
    },
  });

  if (!ejecucion) return null;

  const descargaPorMunicipio = new Map();
  for (const r of ejecucion.resultadosDescarga) {
    descargaPorMunicipio.set(r.municipioId, r);
  }

  const envioPorMunicipio = new Map();
  const intentosPorMunicipio = new Map();
  for (const r of ejecucion.resultadosEnvio) {
    envioPorMunicipio.set(r.municipioId, r);
    const previos = intentosPorMunicipio.get(r.municipioId) || 0;
    intentosPorMunicipio.set(r.municipioId, previos + (r.intentos || 1));
  }

  const municipiosIds = new Set([
    ...descargaPorMunicipio.keys(),
    ...envioPorMunicipio.keys(),
  ]);

  const municipios = Array.from(municipiosIds)
    .map((municipioId) => {
      const descarga = descargaPorMunicipio.get(municipioId);
      const envio = envioPorMunicipio.get(municipioId);
      const municipioInfo = descarga?.municipio || envio?.municipio;
      return {
        municipioId,
        nombre: municipioInfo?.nombre,
        codigoBcgs: municipioInfo?.codigoBcgs,
        descarga: descarga
          ? { estatus: descarga.estatus, archivo: descarga.archivo, error: descarga.error }
          : null,
        envio: envio
          ? {
              estatus: envio.estatus,
              tipoError: envio.tipoError,
              intentosRegistrados: intentosPorMunicipio.get(municipioId),
            }
          : null,
      };
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const resumen = {
    descarga: contarPorEstatus(ejecucion.resultadosDescarga),
    envio: contarPorEstatus(dedupeUltimoPorMunicipio(ejecucion.resultadosEnvio)),
  };

  return {
    id: ejecucion.id,
    mes: ejecucion.mes,
    anio: ejecucion.anio,
    estatus: ejecucion.estatus,
    fechaInicio: ejecucion.fechaInicio,
    fechaFin: ejecucion.fechaFin,
    usuario: ejecucion.usuario,
    resumen,
    municipios,
  };
}

async function obtenerDetalleEjecucion(req, res) {
  const ejecucionId = parseInt(req.params.id, 10);
  if (!ejecucionId) {
    return res.status(400).json({ error: 'Id de ejecución inválido.' });
  }

  try {
    const detalle = await construirDetalleEjecucion(ejecucionId);
    if (!detalle) {
      return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
    }
    res.json(detalle);
  } catch (err) {
    console.error('Error al obtener el detalle de la ejecución:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el detalle de la ejecución.' });
  }
}

async function exportarReporteEjecucion(req, res) {
  const ejecucionId = parseInt(req.params.id, 10);
  const formato = (req.query.formato || 'pdf').toLowerCase();

  if (!ejecucionId) {
    return res.status(400).json({ error: 'Id de ejecución inválido.' });
  }
  if (!['pdf', 'excel'].includes(formato)) {
    return res.status(400).json({ error: 'El formato debe ser "pdf" o "excel".' });
  }

  try {
    const detalle = await construirDetalleEjecucion(ejecucionId);
    if (!detalle) {
      return res.status(404).json({ error: 'No existe una ejecución con ese id.' });
    }

    const nombreBase = `reporte_ejecucion_${detalle.mes}_${detalle.anio}_${detalle.id}`;

    if (formato === 'excel') {
      const buffer = await generarReporteExcel(detalle);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreBase}.xlsx"`);
      return res.send(buffer);
    }

    const buffer = await generarReportePdf(detalle);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreBase}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error al generar el reporte de la ejecución:', err.message);
    res.status(500).json({ error: 'No se pudo generar el reporte de la ejecución.' });
  }
}

module.exports = { listarEjecuciones, obtenerDetalleEjecucion, exportarReporteEjecucion, construirDetalleEjecucion };