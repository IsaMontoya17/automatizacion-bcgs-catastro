const { clicRobusto, ingresarTextoAngular, hacerHoverElemento } = require('./browser');
const { normalizarTexto } = require('../utils/utils');

async function intentarLogin(page, url, usuario, password, municipio) {
  await page.goto(url, { waitUntil: 'networkidle2' });

  const campoUser = await page.waitForSelector('#usuario', { visible: true, timeout: 15000 });
  await campoUser.click();
  await page.evaluate((el) => { el.value = ''; }, campoUser);
  await campoUser.type(usuario);

  const campoPass = await page.waitForSelector('#contrasena', { timeout: 15000 });
  await page.evaluate((el) => { el.value = ''; }, campoPass);
  await campoPass.type(password);

  await page.waitForFunction(() => {
    const sel = document.querySelector('#dependencia');
    return sel && sel.options.length > 1;
  }, { timeout: 15000 });

  const valorOption = await page.evaluate((municipioBuscado) => {
    function normalizar(texto) {
      return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
    }
    const sel = document.querySelector('#dependencia');
    for (const option of sel.options) {
      const texto = normalizar(option.label || option.text || '');
      if (texto.includes(municipioBuscado)) {
        return option.value;
      }
    }
    return null;
  }, normalizarTexto(municipio));

  if (!valorOption) {
    throw new Error(`No se encontró el municipio '${municipio}' en el desplegable del BCGS.`);
  }

  await page.select('#dependencia', valorOption);

  await new Promise((r) => setTimeout(r, 1000));

  let ingresoExitoso = false;
  for (let intento = 0; intento < 3 && !ingresoExitoso; intento++) {
    const botonPresente = await page.$('#ingresar').catch(() => null);
    if (botonPresente) {
      await clicRobusto(page, '#ingresar');
    }
    try {
      await page.waitForSelector('#mGeografico', { visible: true, timeout: 20000 });
      ingresoExitoso = true;
    } catch (err) {
      
    }
  }

  if (!ingresoExitoso) {
    throw new Error('El clic en "Ingresar" no llevó al menú principal después de varios intentos.');
  }
}

async function loginBcgs(page, url, usuario, password, municipio, { intentos = 3 } = {}) {
  let ultimoError;

  for (let i = 1; i <= intentos; i++) {
    try {
      await intentarLogin(page, url, usuario, password, municipio);
      return;
    } catch (err) {
      ultimoError = err;
      console.warn(`Login BCGS falló (intento ${i}/${intentos}): ${err.message}`);
      if (i < intentos) await new Promise((r) => setTimeout(r, 5000));
    }
  }

  throw ultimoError;
}

async function cambiarMunicipioSesion(page, nuevoMunicipio) {
  await clicRobusto(
    page,
    "//a[contains(@class, 'dropdown-toggle') and .//i[contains(@class, 'fa-user-alt')]]",
    { porXpath: true }
  );

  await page.waitForSelector('#dependenciaMenu', { timeout: 15000 });

  const valorOption = await page.evaluate((municipioBuscado) => {
    function normalizar(texto) {
      return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
    }
    const sel = document.querySelector('#dependenciaMenu');
    for (const option of sel.options) {
      const texto = normalizar(option.label || option.text || '');
      if (texto.includes(municipioBuscado)) {
        return option.value;
      }
    }
    return null;
  }, normalizarTexto(nuevoMunicipio));

  if (!valorOption) {
    throw new Error(`No se encontró el municipio '${nuevoMunicipio}' en el desplegable superior.`);
  }

  await page.select('#dependenciaMenu', valorOption);
}

module.exports = { loginBcgs, cambiarMunicipioSesion };