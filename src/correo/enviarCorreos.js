const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const prisma = require('../config/prisma');
const { obtenerOCrearMunicipio } = require('../utils/municipios');
const { obtenerDestinatarioMunicipio } = require('../utils/destinatarios');
const { nombreMes } = require('../utils/utils');
const { enviarNotificacionFinalizacion } = require('./notificacionFinal');
const {
  cargarJSON,
  crearTransportador,
  enviarCorreoConReintentos,
} = require('./correoBot');

function obtenerSaludo() {
  const hora = new Date().getHours();
  return hora < 12 ? 'Buenos días' : 'Buenas tardes';
}

async function obtenerPlantillaActiva() {
  const plantilla = await prisma.plantillaCorreo.findFirst({ orderBy: { id: 'asc' } });

  if (!plantilla || !plantilla.asunto || !plantilla.cuerpo) {
    throw new Error(
      'No hay una plantilla de correo configurada en la base de datos. ' +
      'Configúrala desde el Panel de Administración antes de enviar correos.'
    );
  }

  return plantilla;
}

async function procesarEnvioMunicipio({ item, mes, anio, rutaCarpetaMes, plantilla, transportador, ejecucion, avisar }) {
  const codigoLimpio = String(item.codigo).replace(/\D/g, '');

  const municipioDb = await obtenerOCrearMunicipio(prisma, codigoLimpio, item.municipio);
  const destinatario = await obtenerDestinatarioMunicipio(prisma, codigoLimpio);

  if (!destinatario || destinatario.para.length === 0) {
    const error = 'Sin destinatarios configurados para este municipio.';
    await prisma.resultadoEnvio.create({
      data: {
        ejecucionId: ejecucion.id,
        municipioId: municipioDb.id,
        estatus: 'requiere_revision_manual',
        tipoError: error,
      },
    });
    avisar({ tipo: 'envio_revision_manual', municipio: item.municipio, codigo: item.codigo, error });
    return { exito: false, error };
  }

  const rutaAdjunto = path.join(rutaCarpetaMes, item.archivo);
  const datos = {
    saludo: obtenerSaludo(),
    mes: nombreMes(mes),
    anio: String(anio),
    municipio: item.municipio,
  };

  const resultado = await enviarCorreoConReintentos(transportador, {
    destinatario,
    plantilla,
    datos,
    rutaAdjunto,
    remitenteNombre: config.EMAIL_REMITENTE_NOMBRE,
    remitenteCorreo: config.EMAIL_USUARIO,
  });

  if (resultado.exito) {
    await prisma.resultadoEnvio.create({
      data: {
        ejecucionId: ejecucion.id,
        municipioId: municipioDb.id,
        estatus: 'exitoso',
        intentos: resultado.intentos,
      },
    });
    avisar({ tipo: 'envio_ok', municipio: item.municipio, codigo: item.codigo, intentos: resultado.intentos });
    return { exito: true, intentos: resultado.intentos };
  }

  await prisma.resultadoEnvio.create({
    data: {
      ejecucionId: ejecucion.id,
      municipioId: municipioDb.id,
      estatus: 'requiere_revision_manual',
      tipoError: resultado.error,
      intentos: resultado.intentos,
    },
  });
  avisar({ tipo: 'envio_revision_manual', municipio: item.municipio, codigo: item.codigo, error: resultado.error });
  return { exito: false, error: resultado.error, intentos: resultado.intentos };
}

async function obtenerEjecucion(mes, anio, ejecucionId) {
  if (ejecucionId) {
    const ejecucion = await prisma.ejecucion.findUnique({ where: { id: ejecucionId } });
    if (!ejecucion) {
      throw new Error(`No existe la ejecución con id ${ejecucionId} en la base de datos.`);
    }
    return ejecucion;
  }

  const ejecucion = await prisma.ejecucion.findFirst({
    where: { mes, anio },
    orderBy: { id: 'desc' },
  });
  if (!ejecucion) {
    throw new Error(
      `No se encontró una ejecución registrada para ${nombreMes(mes)}/${anio} en la base de datos. ` +
      `Ejecuta primero descargarResoluciones.js.`
    );
  }
  return ejecucion;
}

async function ejecutarEnvioCorreos(mes, anio, { onProgreso, ejecucionId = null } = {}) {
  const avisar = (evento) => {
    console.log(evento);
    if (onProgreso) onProgreso(evento);
  };

  const rutaCarpetaMes = path.resolve(config.CARPETA_PRINCIPAL, `${nombreMes(mes)}_${anio}`);
  const rutaReporteDescarga = path.join(rutaCarpetaMes, '_reporte_descarga.json');

  if (!fs.existsSync(rutaReporteDescarga)) {
    throw new Error(
      `No existe el reporte de descarga para ${nombreMes(mes)}_${anio}. Ejecuta primero descargarResoluciones.js.`
    );
  }

  const reporteDescarga = cargarJSON(rutaReporteDescarga);
  const ejecucion = await obtenerEjecucion(mes, anio, ejecucionId);
  const plantilla = await obtenerPlantillaActiva();

  const transportador = crearTransportador(config);

  const reporteEnvio = { exitosos: [], requieren_revision_manual: [], omitidos: [] };

  reporteDescarga.sin_resoluciones.forEach((m) => {
    reporteEnvio.omitidos.push({ municipio: m.municipio, codigo: m.codigo, motivo: 'sin_movimientos' });
  });
  avisar({ tipo: 'omitidos_sin_movimientos', total: reporteEnvio.omitidos.length });

  const municipiosAEnviar = reporteDescarga.exitosos;
  avisar({ tipo: 'inicio_envio', total: municipiosAEnviar.length });

  for (let i = 0; i < municipiosAEnviar.length; i++) {
    const item = municipiosAEnviar[i];

    avisar({ tipo: 'enviando', indice: i + 1, total: municipiosAEnviar.length, municipio: item.municipio, codigo: item.codigo });

    const resultado = await procesarEnvioMunicipio({
      item,
      mes,
      anio,
      rutaCarpetaMes,
      plantilla,
      transportador,
      ejecucion,
      avisar,
    });

    if (resultado.exito) {
      reporteEnvio.exitosos.push({ municipio: item.municipio, codigo: item.codigo, intentos: resultado.intentos });
    } else {
      reporteEnvio.requieren_revision_manual.push({ municipio: item.municipio, codigo: item.codigo, error: resultado.error });
    }
  }

  const rutaReporteEnvio = path.join(rutaCarpetaMes, '_reporte_envio.json');
  fs.writeFileSync(rutaReporteEnvio, JSON.stringify(reporteEnvio, null, 2), 'utf-8');

    await enviarNotificacionFinalizacion(transportador, { ejecucion, reporteEnvio, config, avisar });
    
  console.log('\n==================================================');
  console.log(`ENVÍO DE CORREOS — ${nombreMes(mes)} ${anio}`);
  console.log(`Exitosos: ${reporteEnvio.exitosos.length}`);
  console.log(`Requieren revisión manual: ${reporteEnvio.requieren_revision_manual.length}`);
  console.log(`Omitidos (sin movimientos): ${reporteEnvio.omitidos.length}`);
  console.log('==================================================\n');

  avisar({
    tipo: 'finalizado',
    exitosos: reporteEnvio.exitosos.length,
    requieren_revision_manual: reporteEnvio.requieren_revision_manual.length,
    omitidos: reporteEnvio.omitidos.length,
    rutaReporteEnvio,
  });

  return reporteEnvio;
}

async function reintentarEnvioMunicipios(mes, anio, codigos, { onProgreso, ejecucionId = null } = {}) {
  const avisar = (evento) => {
    console.log(evento);
    if (onProgreso) onProgreso(evento);
  };

  if (!Array.isArray(codigos) || codigos.length === 0) {
    throw new Error('Debes indicar al menos un código de municipio para reintentar.');
  }

  const rutaCarpetaMes = path.resolve(config.CARPETA_PRINCIPAL, `${nombreMes(mes)}_${anio}`);
  const rutaReporteDescarga = path.join(rutaCarpetaMes, '_reporte_descarga.json');
  const rutaReporteEnvio = path.join(rutaCarpetaMes, '_reporte_envio.json');

  if (!fs.existsSync(rutaReporteDescarga) || !fs.existsSync(rutaReporteEnvio)) {
    throw new Error(
      `No se encontraron los reportes de ${nombreMes(mes)}_${anio}. No se puede reintentar el envío sin una ejecución previa completa.`
    );
  }

  const reporteDescarga = cargarJSON(rutaReporteDescarga);
  const reporteEnvio = cargarJSON(rutaReporteEnvio);
  const ejecucion = await obtenerEjecucion(mes, anio, ejecucionId);
  const plantilla = await obtenerPlantillaActiva();

  const transportador = crearTransportador(config);

  const codigosObjetivo = new Set(codigos.map(String));

  const municipiosAReintentar = reporteEnvio.requieren_revision_manual.filter((m) =>
    codigosObjetivo.has(String(m.codigo))
  );

  if (municipiosAReintentar.length === 0) {
    throw new Error('Ninguno de los códigos solicitados está actualmente pendiente de revisión manual.');
  }

  avisar({ tipo: 'inicio_reintento_envio', total: municipiosAReintentar.length });

  for (let i = 0; i < municipiosAReintentar.length; i++) {
    const pendiente = municipiosAReintentar[i];

    const item = reporteDescarga.exitosos.find((m) => String(m.codigo) === String(pendiente.codigo));

    if (!item) {
      avisar({
        tipo: 'envio_revision_manual',
        municipio: pendiente.municipio,
        codigo: pendiente.codigo,
        error: 'No se encontró el archivo descargado original para reintentar el envío.',
      });
      continue;
    }

    avisar({
      tipo: 'reintentando_envio',
      indice: i + 1,
      total: municipiosAReintentar.length,
      municipio: item.municipio,
      codigo: item.codigo,
    });

    const resultado = await procesarEnvioMunicipio({
      item,
      mes,
      anio,
      rutaCarpetaMes,
      plantilla,
      transportador,
      ejecucion,
      avisar,
    });

    reporteEnvio.requieren_revision_manual = reporteEnvio.requieren_revision_manual.filter(
      (m) => String(m.codigo) !== String(item.codigo)
    );

    if (resultado.exito) {
      reporteEnvio.exitosos.push({ municipio: item.municipio, codigo: item.codigo, intentos: resultado.intentos });
    } else {
      reporteEnvio.requieren_revision_manual.push({ municipio: item.municipio, codigo: item.codigo, error: resultado.error });
    }
  }

  fs.writeFileSync(rutaReporteEnvio, JSON.stringify(reporteEnvio, null, 2), 'utf-8');

  const siguenPendientes = municipiosAReintentar.filter((m) =>
    reporteEnvio.requieren_revision_manual.some((p) => String(p.codigo) === String(m.codigo))
  ).length;

  avisar({
    tipo: 'finalizado_reintento',
    total: municipiosAReintentar.length,
    exitosos: municipiosAReintentar.length - siguenPendientes,
    pendientes: siguenPendientes,
  });

  return reporteEnvio;
}

if (require.main === module) {
  const [, , mesArg, anioArg] = process.argv;
  const mes = parseInt(mesArg, 10);
  const anio = parseInt(anioArg, 10);

  if (!mes || !anio) {
    console.error('Uso: node enviarCorreos.js <mes> <año>   ej: node enviarCorreos.js 6 2026');
    process.exit(1);
  }

  ejecutarEnvioCorreos(mes, anio).catch((err) => {
    console.error('Error en el flujo de envío de correos:', err);
    process.exit(1);
  });
}

module.exports = { ejecutarEnvioCorreos, reintentarEnvioMunicipios };