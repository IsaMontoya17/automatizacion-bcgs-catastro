const prisma = require('../config/prisma');

const TIPOS_VALIDOS = ['para', 'cc', 'cco'];
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function listarMunicipios(req, res) {
  try {
    const municipios = await prisma.municipio.findMany({
      orderBy: { nombre: 'asc' },
      include: { correos: true },
    });

    const resultado = municipios.map((m) => {
      const correos = { para: [], cc: [], cco: [] };
      for (const c of m.correos) {
        if (TIPOS_VALIDOS.includes(c.tipo)) correos[c.tipo].push(c.email);
      }
      return {
        id: m.id,
        codigoBcgs: m.codigoBcgs,
        nombre: m.nombre,
        correos,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('Error al listar municipios para administración:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la lista de municipios.' });
  }
}

async function actualizarCorreosMunicipio(req, res) {
  const municipioId = parseInt(req.params.id, 10);
  if (!municipioId) {
    return res.status(400).json({ error: 'Id de municipio inválido.' });
  }

  const { correos } = req.body || {};
  if (!correos || typeof correos !== 'object') {
    return res.status(400).json({ error: 'Debes enviar el objeto "correos" con las listas para, cc y cco.' });
  }

  const filas = [];
  for (const tipo of TIPOS_VALIDOS) {
    const lista = Array.isArray(correos[tipo]) ? correos[tipo] : [];
    for (const email of lista) {
      const limpio = String(email).trim();
      if (!REGEX_EMAIL.test(limpio)) {
        return res.status(400).json({ error: `El correo "${limpio}" (${tipo}) no tiene un formato válido.` });
      }
      filas.push({ municipioId, email: limpio, tipo });
    }
  }

  if (filas.filter((f) => f.tipo === 'para').length === 0) {
    return res.status(400).json({ error: 'Debes configurar al menos un correo destinatario (Para).' });
  }

  try {
    const municipio = await prisma.municipio.findUnique({ where: { id: municipioId } });
    if (!municipio) {
      return res.status(404).json({ error: 'No existe un municipio con ese id.' });
    }

    await prisma.$transaction([
      prisma.correoMunicipio.deleteMany({ where: { municipioId } }),
      prisma.correoMunicipio.createMany({ data: filas }),
    ]);

    const actualizado = await prisma.correoMunicipio.findMany({ where: { municipioId } });
    const correosActualizados = { para: [], cc: [], cco: [] };
    for (const c of actualizado) correosActualizados[c.tipo].push(c.email);

    res.json({ id: municipioId, nombre: municipio.nombre, correos: correosActualizados });
  } catch (err) {
    console.error('Error al actualizar correos del municipio:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar los correos del municipio.' });
  }
}

module.exports = { listarMunicipios, actualizarCorreosMunicipio };