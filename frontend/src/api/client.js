const API_URL = import.meta.env.VITE_API_URL;

function obtenerToken() {
  return localStorage.getItem('token');
}

function notificarSesionExpirada() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.dispatchEvent(new Event('sesion-expirada'));
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers.Authorization = `Bearer ${obtenerToken()}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    notificarSesionExpirada();
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Tu sesión ha expirado. Inicia sesión nuevamente.');
  }

  return res;
}

async function login(usuario, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Error al iniciar sesión.');
  }

  return data;
}

export async function solicitarRecuperacion(identificador) {
  const res = await fetch(`${API_URL}/api/auth/recuperar/solicitar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo enviar el código.');
  return data;
}

export async function restablecerPassword(identificador, codigo, nuevaPassword) {
  const res = await fetch(`${API_URL}/api/auth/recuperar/restablecer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador, codigo, nuevaPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña.');
  return data;
}

async function iniciarDescarga(mes, anio) {
  const res = await apiFetch('/api/descargas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mes, anio }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'No se pudo iniciar la descarga.');
  }

  return data;
}

async function obtenerPlantillaCorreo() {
  const res = await apiFetch('/api/admin/plantilla');

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener la plantilla de correo.');
  return data;
}

async function actualizarPlantillaCorreo(asunto, cuerpo) {
  const res = await apiFetch('/api/admin/plantilla', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asunto, cuerpo }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la plantilla de correo.');
  return data;
}

async function consultarEjecucion(id) {
  const res = await apiFetch(`/api/descargas/${id}`);

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'No se pudo consultar la ejecución.');
  }

  return data;
}

async function reintentarEnvio(id, codigos) {
  const res = await apiFetch(`/api/descargas/${id}/reintentar-envio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigos }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo reintentar el envío.');
  return data;
}

async function listarMunicipiosAdmin() {
  const res = await apiFetch('/api/admin/municipios');

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener la lista de municipios.');
  return data;
}

async function actualizarCorreosMunicipio(id, correos) {
  const res = await apiFetch(`/api/admin/municipios/${id}/correos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correos }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo actualizar los correos del municipio.');
  return data;
}

async function listarHistorialEjecuciones({ mes, anio, estatus, usuarioId, pagina, porPagina } = {}) {
  const params = new URLSearchParams();
  if (mes) params.set('mes', mes);
  if (anio) params.set('anio', anio);
  if (estatus) params.set('estatus', estatus);
  if (usuarioId) params.set('usuarioId', usuarioId);
  if (pagina) params.set('pagina', pagina);
  if (porPagina) params.set('porPagina', porPagina);

  const res = await apiFetch(`/api/ejecuciones?${params.toString()}`);

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener el historial de ejecuciones.');
  return data;
}

async function obtenerDetalleHistorialEjecucion(id) {
  const res = await apiFetch(`/api/ejecuciones/${id}`);

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener el detalle de la ejecución.');
  return data;
}

async function descargarReporteEjecucion(id, formato) {
  const res = await apiFetch(`/api/ejecuciones/${id}/reporte?formato=${formato}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo descargar el reporte.');
  }

  const disposicion = res.headers.get('Content-Disposition') || '';
  const match = disposicion.match(/filename="(.+)"/);
  const nombreArchivo = match ? match[1] : `reporte.${formato === 'excel' ? 'xlsx' : 'pdf'}`;

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function listarCorreosNotificacion() {
  const res = await apiFetch('/api/admin/notificaciones');

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener la lista de correos de notificación.');
  return data;
}

async function agregarCorreoNotificacion(email) {
  const res = await apiFetch('/api/admin/notificaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo agregar el correo de notificación.');
  return data;
}

async function eliminarCorreoNotificacion(id) {
  const res = await apiFetch(`/api/admin/notificaciones/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo eliminar el correo de notificación.');
  }
}

async function listarUsuarios() {
  const res = await apiFetch('/api/admin/usuarios');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener la lista de usuarios.');
  return data;
}

async function crearUsuario(usuario) {
  const res = await apiFetch('/api/admin/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(usuario),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario.');
  return data;
}

async function actualizarUsuario(id, cambios) {
  const res = await apiFetch(`/api/admin/usuarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.');
  return data;
}

async function eliminarUsuario(id) {
  const res = await apiFetch(`/api/admin/usuarios/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo eliminar el usuario.');
  }
}

export {
  login,
  iniciarDescarga,
  consultarEjecucion,
  reintentarEnvio,
  listarMunicipiosAdmin,
  actualizarCorreosMunicipio,
  obtenerPlantillaCorreo,
  actualizarPlantillaCorreo,
  listarHistorialEjecuciones,
  obtenerDetalleHistorialEjecucion,
  descargarReporteEjecucion,
  listarCorreosNotificacion,
  agregarCorreoNotificacion,
  eliminarCorreoNotificacion,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
};