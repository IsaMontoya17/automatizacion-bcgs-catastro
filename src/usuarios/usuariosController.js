const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const ROLES_VALIDOS = ['administrador', 'usuario'];
const RONDAS_HASH = 10;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAMPOS_PUBLICOS = { id: true, nombre: true, usuario: true, correo: true, rol: true };

// Devuelve el correo normalizado, null si viene vacío, o undefined si no se envió
function normalizarCorreo(correo) {
  if (correo === undefined) return undefined;
  if (correo === null || !String(correo).trim()) return null;
  return String(correo).trim().toLowerCase();
}

async function listarUsuarios(req, res) {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: CAMPOS_PUBLICOS,
      orderBy: { nombre: 'asc' },
    });
    res.json(usuarios);
  } catch (err) {
    console.error('Error al listar usuarios:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la lista de usuarios.' });
  }
}

async function crearUsuario(req, res) {
  const { nombre, usuario, password, rol } = req.body || {};
  const correo = normalizarCorreo(req.body?.correo);

  if (!nombre?.trim() || !usuario?.trim() || !correo || !password || !rol) {
    return res.status(400).json({ error: 'Debes enviar nombre, usuario, correo, password y rol.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `El rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (!REGEX_CORREO.test(correo)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  try {
    const existente = await prisma.usuario.findUnique({ where: { usuario: usuario.trim() } });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
    }

    const correoEnUso = await prisma.usuario.findUnique({ where: { correo } });
    if (correoEnUso) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    }

    const passwordHash = await bcrypt.hash(password, RONDAS_HASH);
    const creado = await prisma.usuario.create({
      data: { nombre: nombre.trim(), usuario: usuario.trim(), correo, passwordHash, rol },
      select: CAMPOS_PUBLICOS,
    });

    res.status(201).json(creado);
  } catch (err) {
    console.error('Error al crear usuario:', err.message);
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
}

async function actualizarUsuario(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Id de usuario inválido.' });

  const { nombre, usuario, rol, password } = req.body || {};
  const correo = normalizarCorreo(req.body?.correo);

  if (rol && !ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `El rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (correo === null) {
    return res.status(400).json({ error: 'El correo no puede quedar vacío.' });
  }
  if (correo && !REGEX_CORREO.test(correo)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  try {
    const data = {};
    if (nombre?.trim()) data.nombre = nombre.trim();
    if (rol) data.rol = rol;

    if (usuario?.trim()) {
      const existente = await prisma.usuario.findUnique({ where: { usuario: usuario.trim() } });
      if (existente && existente.id !== id) {
        return res.status(409).json({ error: 'Ya existe otro usuario con ese nombre de usuario.' });
      }
      data.usuario = usuario.trim();
    }

    if (correo) {
      const correoEnUso = await prisma.usuario.findUnique({ where: { correo } });
      if (correoEnUso && correoEnUso.id !== id) {
        return res.status(409).json({ error: 'Ya existe otro usuario con ese correo.' });
      }
      data.correo = correo;
    }

    if (password) data.passwordHash = await bcrypt.hash(password, RONDAS_HASH);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No enviaste ningún campo para actualizar.' });
    }

    const actualizado = await prisma.usuario.update({
      where: { id },
      data,
      select: CAMPOS_PUBLICOS,
    });

    res.json(actualizado);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'No existe un usuario con ese id.' });
    }
    console.error('Error al actualizar usuario:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
}

async function eliminarUsuario(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Id de usuario inválido.' });

  if (id === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  }

  try {
    const totalEjecuciones = await prisma.ejecucion.count({ where: { usuarioId: id } });
    if (totalEjecuciones > 0) {
      return res.status(409).json({
        error: `Este usuario tiene ${totalEjecuciones} ejecución(es) registradas y no puede eliminarse, ` +
               `para preservar la trazabilidad del historial (RNF-08).`,
      });
    }

    await prisma.usuario.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'No existe un usuario con ese id.' });
    }
    console.error('Error al eliminar usuario:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
  }
}

module.exports = { listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario };