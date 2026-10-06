const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');

const ROLES_VALIDOS = ['administrador', 'usuario'];
const RONDAS_HASH = 10;

async function listarUsuarios(req, res) {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, nombre: true, usuario: true, rol: true },
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

  if (!nombre?.trim() || !usuario?.trim() || !password || !rol) {
    return res.status(400).json({ error: 'Debes enviar nombre, usuario, password y rol.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `El rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const existente = await prisma.usuario.findUnique({ where: { usuario: usuario.trim() } });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
    }

    const passwordHash = await bcrypt.hash(password, RONDAS_HASH);
    const creado = await prisma.usuario.create({
      data: { nombre: nombre.trim(), usuario: usuario.trim(), passwordHash, rol },
      select: { id: true, nombre: true, usuario: true, rol: true },
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

  if (rol && !ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: `El rol debe ser uno de: ${ROLES_VALIDOS.join(', ')}.` });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
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

    if (password) data.passwordHash = await bcrypt.hash(password, RONDAS_HASH);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No enviaste ningún campo para actualizar.' });
    }

    const actualizado = await prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nombre: true, usuario: true, rol: true },
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