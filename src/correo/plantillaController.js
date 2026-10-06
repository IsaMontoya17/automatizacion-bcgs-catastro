const prisma = require('../config/prisma');

async function obtenerPlantilla(req, res) {
  try {
    const plantilla = await prisma.plantillaCorreo.findFirst({ orderBy: { id: 'asc' } });

    if (!plantilla) {
      return res.status(404).json({ error: 'No hay una plantilla de correo configurada todavía.' });
    }

    res.json({ asunto: plantilla.asunto, cuerpo: plantilla.cuerpo, actualizadoEn: plantilla.actualizadoEn });
  } catch (err) {
    console.error('Error al obtener la plantilla de correo:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la plantilla de correo.' });
  }
}

async function actualizarPlantilla(req, res) {
  const { asunto, cuerpo } = req.body || {};

  if (!asunto || typeof asunto !== 'string' || !asunto.trim()) {
    return res.status(400).json({ error: 'El asunto no puede estar vacío.' });
  }
  if (!cuerpo || typeof cuerpo !== 'string' || !cuerpo.trim()) {
    return res.status(400).json({ error: 'El cuerpo del mensaje no puede estar vacío.' });
  }

  try {
    const existente = await prisma.plantillaCorreo.findFirst({ orderBy: { id: 'asc' } });

    const plantilla = existente
      ? await prisma.plantillaCorreo.update({
          where: { id: existente.id },
          data: { asunto: asunto.trim(), cuerpo: cuerpo.trim() },
        })
      : await prisma.plantillaCorreo.create({
          data: { asunto: asunto.trim(), cuerpo: cuerpo.trim() },
        });

    res.json({ asunto: plantilla.asunto, cuerpo: plantilla.cuerpo, actualizadoEn: plantilla.actualizadoEn });
  } catch (err) {
    console.error('Error al actualizar la plantilla de correo:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la plantilla de correo.' });
  }
}

module.exports = { obtenerPlantilla, actualizarPlantilla };