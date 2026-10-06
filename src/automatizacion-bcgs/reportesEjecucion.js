const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ETIQUETAS_DESCARGA = { exitoso: 'Descargado', sin_resoluciones: 'Sin movimiento', fallido: 'Fallido' };
const ETIQUETAS_ENVIO = { exitoso: 'Enviado', fallido: 'Fallido', omitido: 'Omitido', requiere_revision_manual: 'Revisión manual' };

function formatoFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleString('es-CO') : '—';
}

async function generarReporteExcel(detalle) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Gerencia de Catastro - Gobernación de Antioquia';
  libro.created = new Date();

  const hojaResumen = libro.addWorksheet('Resumen');
  hojaResumen.columns = [
    { header: 'Campo', key: 'campo', width: 30 },
    { header: 'Valor', key: 'valor', width: 40 },
  ];
  hojaResumen.getRow(1).font = { bold: true };
  hojaResumen.addRows([
    { campo: 'Periodo', valor: `${MESES[detalle.mes - 1]} ${detalle.anio}` },
    { campo: 'Usuario que ejecutó', valor: detalle.usuario?.nombre || detalle.usuario?.usuario || '—' },
    { campo: 'Fecha de inicio', valor: formatoFecha(detalle.fechaInicio) },
    { campo: 'Fecha de fin', valor: formatoFecha(detalle.fechaFin) },
    { campo: 'Estatus', valor: detalle.estatus },
    { campo: '', valor: '' },
    { campo: 'Descargas exitosas', valor: detalle.resumen.descarga.exitoso ?? 0 },
    { campo: 'Municipios sin movimiento', valor: detalle.resumen.descarga.sin_resoluciones ?? 0 },
    { campo: 'Descargas fallidas', valor: detalle.resumen.descarga.fallido ?? 0 },
    { campo: '', valor: '' },
    { campo: 'Correos enviados', valor: detalle.resumen.envio.exitoso ?? 0 },
    { campo: 'Correos omitidos', valor: detalle.resumen.envio.omitido ?? 0 },
    { campo: 'Requieren revisión manual', valor: detalle.resumen.envio.requiere_revision_manual ?? 0 },
    { campo: 'Envíos fallidos', valor: detalle.resumen.envio.fallido ?? 0 },
  ]);

  const hojaMunicipios = libro.addWorksheet('Municipios');
  hojaMunicipios.columns = [
    { header: 'Municipio', key: 'nombre', width: 30 },
    { header: 'Código BCGS', key: 'codigoBcgs', width: 14 },
    { header: 'Estado descarga', key: 'estadoDescarga', width: 18 },
    { header: 'Archivo', key: 'archivo', width: 30 },
    { header: 'Error descarga', key: 'errorDescarga', width: 30 },
    { header: 'Estado envío', key: 'estadoEnvio', width: 18 },
    { header: 'Intentos', key: 'intentos', width: 10 },
    { header: 'Error envío', key: 'errorEnvio', width: 30 },
  ];
  hojaMunicipios.getRow(1).font = { bold: true };

  detalle.municipios.forEach((m) => {
    hojaMunicipios.addRow({
      nombre: m.nombre,
      codigoBcgs: m.codigoBcgs,
      estadoDescarga: m.descarga ? (ETIQUETAS_DESCARGA[m.descarga.estatus] || m.descarga.estatus) : '—',
      archivo: m.descarga?.archivo || '',
      errorDescarga: m.descarga?.error || '',
      estadoEnvio: m.envio ? (ETIQUETAS_ENVIO[m.envio.estatus] || m.envio.estatus) : '—',
      intentos: m.envio?.intentosRegistrados ?? '',
      errorEnvio: m.envio?.tipoError || '',
    });
  });

  return libro.xlsx.writeBuffer();
}

function generarReportePdf(detalle) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Reporte de ejecución - Distribución de resoluciones catastrales', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Periodo: ${MESES[detalle.mes - 1]} ${detalle.anio}`);
    doc.text(`Usuario: ${detalle.usuario?.nombre || detalle.usuario?.usuario || '—'}`);
    doc.text(`Fecha de inicio: ${formatoFecha(detalle.fechaInicio)}`);
    doc.text(`Fecha de fin: ${formatoFecha(detalle.fechaFin)}`);
    doc.text(`Estatus: ${detalle.estatus}`);
    doc.moveDown();

    doc.fontSize(13).text('Resumen', { underline: true });
    doc.fontSize(10);
    doc.text(`Descargas exitosas: ${detalle.resumen.descarga.exitoso ?? 0}`);
    doc.text(`Sin movimiento: ${detalle.resumen.descarga.sin_resoluciones ?? 0}`);
    doc.text(`Descargas fallidas: ${detalle.resumen.descarga.fallido ?? 0}`);
    doc.text(`Correos enviados: ${detalle.resumen.envio.exitoso ?? 0}`);
    doc.text(`Requieren revisión manual: ${detalle.resumen.envio.requiere_revision_manual ?? 0}`);
    doc.text(`Envíos fallidos: ${detalle.resumen.envio.fallido ?? 0}`);
    doc.moveDown();

    doc.fontSize(13).text('Detalle por municipio', { underline: true });
    doc.moveDown(0.5);

    const columnas = [
      { titulo: 'Municipio', ancho: 140 },
      { titulo: 'Descarga', ancho: 90 },
      { titulo: 'Envío', ancho: 90 },
      { titulo: 'Intentos', ancho: 50 },
      { titulo: 'Observación', ancho: 145 },
    ];

    function dibujarEncabezadoTabla() {
      let x = doc.page.margins.left;
      const y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold');
      columnas.forEach((col) => {
        doc.text(col.titulo, x, y, { width: col.ancho });
        x += col.ancho;
      });
      doc.font('Helvetica');
      doc.y = y + 14;
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.y += 4;
    }

    dibujarEncabezadoTabla();

    const ALTO_MINIMO_FILA = 12; 
    const ESPACIO_ENTRE_FILAS = 4;

    detalle.municipios.forEach((m) => {
      const estadoDescarga = m.descarga ? (ETIQUETAS_DESCARGA[m.descarga.estatus] || m.descarga.estatus) : '—';
      const estadoEnvio = m.envio ? (ETIQUETAS_ENVIO[m.envio.estatus] || m.envio.estatus) : '—';
      const observacion = m.envio?.tipoError || m.descarga?.error || '';

      const valores = [
        m.nombre || '',
        estadoDescarga,
        estadoEnvio,
        String(m.envio?.intentosRegistrados ?? ''),
        observacion,
      ];

      doc.fontSize(8);

      const alturaFila = Math.max(
        ALTO_MINIMO_FILA,
        ...valores.map((valor, i) => doc.heightOfString(valor, { width: columnas[i].ancho }))
      );

      if (doc.y + alturaFila > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        dibujarEncabezadoTabla();
      }

      const y = doc.y;
      let x = doc.page.margins.left;
      valores.forEach((valor, i) => {
        doc.text(valor, x, y, { width: columnas[i].ancho });
        x += columnas[i].ancho;
      });

      doc.y = y + alturaFila + ESPACIO_ENTRE_FILAS;
    });

    doc.end();
  });
}

module.exports = { generarReporteExcel, generarReportePdf };