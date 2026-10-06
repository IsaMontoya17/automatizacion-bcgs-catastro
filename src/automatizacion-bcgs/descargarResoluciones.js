const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const prisma = require('../config/prisma');
const { obtenerOCrearMunicipio, obtenerUsuarioAdmin } = require('../utils/municipios');
const { nombreMes } = require('../utils/utils');
const {
  iniciarNavegador,
  configurarCarpetaDescargas,
  crearCarpetaMes,
} = require('./browser');
const { loginBcgs } = require('./bcgsBot');
const {
  irAModuloDescargaResoluciones,
  seleccionarRadioRangoFechas,
  establecerRangoFechasMes,
  obtenerListaMunicipios,
  descargarResolucionMunicipio,
  finalizarDescarga,
} = require('./resolucionesBot');

const REGEX_PREFIJO_CODIGO = /^\(\d+\)\s*/;

function limpiarNombreMunicipio(nombre) {
  return nombre.replace(REGEX_PREFIJO_CODIGO, '').trim();
}

async function ejecutarDescargaResoluciones(mes, anio, { onProgreso, headless = false, ejecucionId = null } = {}) {
  const avisar = (evento) => {
    console.log(evento);
    if (onProgreso) onProgreso(evento);
  };

  let ejecucion;
  if (ejecucionId) {
    ejecucion = await prisma.ejecucion.findUnique({ where: { id: ejecucionId } });
    if (!ejecucion) {
      throw new Error(`No existe la ejecución con id ${ejecucionId} en la base de datos.`);
    }
  } else {
    const admin = await obtenerUsuarioAdmin(prisma);
    ejecucion = await prisma.ejecucion.create({
      data: { mes, anio, usuarioId: admin.id, estatus: 'en_progreso' },
    });
  }

  avisar({ tipo: 'ejecucion_registrada', ejecucionId: ejecucion.id });

  const rutaCarpetaMes = path.resolve(crearCarpetaMes(config.CARPETA_PRINCIPAL, nombreMes(mes), anio));
  avisar({ tipo: 'carpeta_lista', ruta: rutaCarpetaMes });

  const { browser, page } = await iniciarNavegador({ headless });
  await configurarCarpetaDescargas(page, rutaCarpetaMes);

  const reporte = { exitosos: [], sin_resoluciones: [], fallidos: [] };

  try {
    await loginBcgs(page, config.URL_BCGS, config.USUARIO_SISTEMA, config.CLAVE_SISTEMA, 'ABEJORRAL', {
      carpetaDebug: rutaCarpetaMes,
    });
    avisar({ tipo: 'sesion_iniciada' });

    await irAModuloDescargaResoluciones(page);
    await seleccionarRadioRangoFechas(page);

    const { fechaInicial, fechaFinal } = await establecerRangoFechasMes(page, mes, anio);
    console.log(`\nRango de fechas confirmado: ${fechaInicial} → ${fechaFinal}\n`);
    avisar({ tipo: 'fechas_establecidas', fechaInicial, fechaFinal });

    const municipiosBrutos = await obtenerListaMunicipios(page, { carpetaDebug: rutaCarpetaMes });
    const municipios = municipiosBrutos.filter((m) => !m.value.includes('999'));

    avisar({ tipo: 'municipios_encontrados', total: municipios.length });

    for (let i = 0; i < municipios.length; i++) {
      const municipio = municipios[i];
      const codigoLimpio = String(municipio.value).replace(/\D/g, '');
      const nombreLimpio = limpiarNombreMunicipio(municipio.nombre);

      avisar({ tipo: 'descargando', indice: i + 1, total: municipios.length, municipio: nombreLimpio });

      const municipioDb = await obtenerOCrearMunicipio(prisma, codigoLimpio, nombreLimpio);

      try {
        const resultado = await descargarResolucionMunicipio(page, municipio, rutaCarpetaMes);

        if (resultado === 'SIN_RESOLUCIONES') {
          reporte.sin_resoluciones.push({ municipio: nombreLimpio, codigo: municipio.value });
          await prisma.resultadoDescarga.create({
            data: {
              ejecucionId: ejecucion.id,
              municipioId: municipioDb.id,
              estatus: 'sin_resoluciones',
            },
          });
          avisar({ tipo: 'descarga_sin_datos', municipio: nombreLimpio });
        } else {
          reporte.exitosos.push({ municipio: nombreLimpio, codigo: municipio.value, archivo: resultado });
          await prisma.resultadoDescarga.create({
            data: {
              ejecucionId: ejecucion.id,
              municipioId: municipioDb.id,
              estatus: 'exitoso',
              archivo: resultado,
            },
          });
          avisar({ tipo: 'descarga_ok', municipio: nombreLimpio, archivo: resultado });
        }
      } catch (err) {
        reporte.fallidos.push({ municipio: nombreLimpio, codigo: municipio.value, error: err.message });
        await prisma.resultadoDescarga.create({
          data: {
            ejecucionId: ejecucion.id,
            municipioId: municipioDb.id,
            estatus: 'fallido',
            error: err.message,
          },
        });
        avisar({ tipo: 'descarga_error', municipio: nombreLimpio, error: err.message });
      }
    }

    await finalizarDescarga(page);

    await prisma.ejecucion.update({
      where: { id: ejecucion.id },
      data: { estatus: 'completado', fechaFin: new Date() },
    });
  } catch (err) {
    await prisma.ejecucion.update({
      where: { id: ejecucion.id },
      data: { estatus: 'error', fechaFin: new Date() },
    });
    throw err;
  } finally {
    await browser.close();
  }

  console.log('\n==================================================');
  console.log(`MUNICIPIOS SIN MOVIMIENTO/RESOLUCIONES (${reporte.sin_resoluciones.length}):`);
  if (reporte.sin_resoluciones.length > 0) {
    reporte.sin_resoluciones.forEach((m) => console.log(` - ${m.municipio}`));
  } else {
    console.log(' Todos los municipios registraron movimientos.');
  }
  console.log('==================================================\n');

  const rutaReporte = path.join(rutaCarpetaMes, '_reporte_descarga.json');
  fs.writeFileSync(rutaReporte, JSON.stringify(reporte, null, 2), 'utf-8');

  avisar({
    tipo: 'finalizado',
    ejecucionId: ejecucion.id,
    exitosos: reporte.exitosos.length,
    sin_resoluciones: reporte.sin_resoluciones.length,
    fallidos: reporte.fallidos.length,
    rutaReporte,
  });

  return { ...reporte, ejecucionId: ejecucion.id };
}

if (require.main === module) {
  const [, , mesArg, anioArg] = process.argv;
  const mes = parseInt(mesArg, 10);
  const anio = parseInt(anioArg, 10);

  if (!mes || !anio) {
    console.error('Uso: node descargarResoluciones.js <mes> <año>   ej: node descargarResoluciones.js 6 2026');
    process.exit(1);
  }

  ejecutarDescargaResoluciones(mes, anio).catch((err) => {
    console.error('Error en el flujo principal:', err);
    process.exit(1);
  });
}

module.exports = { ejecutarDescargaResoluciones };