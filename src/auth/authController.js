const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const config = require('../config/config');
const { crearTransportador } = require('../correo/correoBot');

const RONDAS_HASH = 10;
const MINUTOS_VIGENCIA_CODIGO = 15;
const MAX_INTENTOS_CODIGO = 5;
const SEGUNDOS_ENTRE_SOLICITUDES = 60;

const MENSAJE_SOLICITUD =
  'Si los datos corresponden a una cuenta con correo registrado, te enviamos un código de verificación. Revisa tu bandeja de entrada.';
const ERROR_CODIGO = 'El código es inválido o ya expiró. Solicita uno nuevo.';

// ─── Inicio de sesión ──────────────────────────────────────────────

async function login(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Debes enviar "usuario" y "password".' });
  }

  const cuenta = await prisma.usuario.findUnique({ where: { usuario } });

  if (!cuenta) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const passwordValida = await bcrypt.compare(password, cuenta.passwordHash);

  if (!passwordValida) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = jwt.sign(
    { id: cuenta.id, usuario: cuenta.usuario, rol: cuenta.rol },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    usuario: { id: cuenta.id, nombre: cuenta.nombre, usuario: cuenta.usuario, rol: cuenta.rol },
  });
}

// ─── Recuperación de contraseña ────────────────────────────────────

function buscarCuentaPorIdentificador(identificador) {
  return prisma.usuario.findFirst({
    where: {
      OR: [{ usuario: identificador }, { correo: identificador.toLowerCase() }],
    },
  });
}

function limpiarCodigo(usuarioId) {
  return prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      codigoRecuperacionHash: null,
      codigoRecuperacionExpira: null,
      intentosRecuperacion: 0,
    },
  });
}

function construirCorreoCodigo(nombre, codigo) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px;">
      <p>Hola ${nombre},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en la plataforma de
         Automatización de Resoluciones Catastrales.</p>
      <p>Tu código de verificación es:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">${codigo}</p>
      <p>El código vence en ${MINUTOS_VIGENCIA_CODIGO} minutos.</p>
      <p>Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>
      <p style="color: #64748b; font-size: 12px;">Gerencia de Catastro — Gobernación de Antioquia</p>
    </div>
  `;
}

async function solicitarRecuperacion(req, res) {
  const identificador = req.body?.identificador?.trim();

  if (!identificador) {
    return res.status(400).json({ error: 'Debes enviar tu usuario o correo.' });
  }

  try {
    const cuenta = await buscarCuentaPorIdentificador(identificador);

    // Respuesta genérica: no revela si la cuenta existe o si tiene correo
    if (!cuenta || !cuenta.correo) {
      return res.json({ mensaje: MENSAJE_SOLICITUD });
    }

    // Evita que se pidan códigos en ráfaga
    if (cuenta.codigoRecuperacionExpira) {
      const emitidoEn = cuenta.codigoRecuperacionExpira.getTime() - MINUTOS_VIGENCIA_CODIGO * 60 * 1000;
      const segundosTranscurridos = (Date.now() - emitidoEn) / 1000;
      if (segundosTranscurridos < SEGUNDOS_ENTRE_SOLICITUDES) {
        const espera = Math.ceil(SEGUNDOS_ENTRE_SOLICITUDES - segundosTranscurridos);
        return res.status(429).json({ error: `Espera ${espera} segundos antes de pedir otro código.` });
      }
    }

    const codigo = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codigoHash = await bcrypt.hash(codigo, RONDAS_HASH);

    await prisma.usuario.update({
      where: { id: cuenta.id },
      data: {
        codigoRecuperacionHash: codigoHash,
        codigoRecuperacionExpira: new Date(Date.now() + MINUTOS_VIGENCIA_CODIGO * 60 * 1000),
        intentosRecuperacion: 0,
      },
    });

    try {
      const transportador = await crearTransportador(config);
      await transportador.sendMail({
        from: config.EMAIL_USUARIO,
        to: cuenta.correo,
        subject: 'Código para restablecer tu contraseña',
        html: construirCorreoCodigo(cuenta.nombre, codigo),
      });
    } catch (errCorreo) {
      // Si el correo no salió, se descarta el código para que pueda pedir otro de inmediato
      await limpiarCodigo(cuenta.id);
      throw errCorreo;
    }

    res.json({ mensaje: MENSAJE_SOLICITUD });
  } catch (err) {
    console.error('Error al solicitar recuperación de contraseña:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el código. Intenta de nuevo más tarde.' });
  }
}

async function restablecerPassword(req, res) {
  const identificador = req.body?.identificador?.trim();
  const codigo = String(req.body?.codigo ?? '').trim();
  const nuevaPassword = req.body?.nuevaPassword;

  if (!identificador || !codigo || !nuevaPassword) {
    return res.status(400).json({ error: 'Debes enviar identificador, código y nueva contraseña.' });
  }
  if (!/^\d{6}$/.test(codigo)) {
    return res.status(400).json({ error: 'El código debe tener 6 dígitos.' });
  }
  if (nuevaPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const cuenta = await buscarCuentaPorIdentificador(identificador);

    if (
      !cuenta ||
      !cuenta.codigoRecuperacionHash ||
      !cuenta.codigoRecuperacionExpira ||
      cuenta.codigoRecuperacionExpira < new Date()
    ) {
      return res.status(400).json({ error: ERROR_CODIGO });
    }

    const codigoValido = await bcrypt.compare(codigo, cuenta.codigoRecuperacionHash);

    if (!codigoValido) {
      const intentos = cuenta.intentosRecuperacion + 1;
      const restantes = MAX_INTENTOS_CODIGO - intentos;

      if (restantes <= 0) {
        await limpiarCodigo(cuenta.id);
        return res.status(400).json({ error: 'Superaste el número de intentos. Solicita un código nuevo.' });
      }

      await prisma.usuario.update({
        where: { id: cuenta.id },
        data: { intentosRecuperacion: intentos },
      });
      return res.status(400).json({ error: `Código incorrecto. Te quedan ${restantes} intento(s).` });
    }

    await prisma.usuario.update({
      where: { id: cuenta.id },
      data: {
        passwordHash: await bcrypt.hash(nuevaPassword, RONDAS_HASH),
        codigoRecuperacionHash: null,
        codigoRecuperacionExpira: null,
        intentosRecuperacion: 0,
      },
    });

    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('Error al restablecer contraseña:', err.message);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña.' });
  }
}

module.exports = { login, solicitarRecuperacion, restablecerPassword };