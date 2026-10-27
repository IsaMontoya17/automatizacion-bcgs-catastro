const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function iniciarNavegador({ headless = false } = {}) {
  const browser = await puppeteer.launch({
    headless,
    args: ['--start-maximized'],
    defaultViewport: null,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  return { browser, page };
}

async function configurarCarpetaDescargas(page, rutaDestino) {
  fs.mkdirSync(rutaDestino, { recursive: true });
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: rutaDestino,
  });
}

function crearCarpetaMes(carpetaPrincipal, nombreMesTexto, anio) {
  const rutaCarpeta = path.join(carpetaPrincipal, `${nombreMesTexto}_${anio}`);
  fs.mkdirSync(rutaCarpeta, { recursive: true });
  return rutaCarpeta;
}

async function clicRobusto(page, selector, { intentos = 3, porXpath = false } = {}) {
  for (let i = 0; i < intentos; i++) {
    try {
      const elemento = porXpath
        ? await page.waitForSelector(`xpath/${selector}`, { visible: true, timeout: 10000 })
        : await page.waitForSelector(selector, { visible: true, timeout: 10000 });
      await elemento.click();
      return;
    } catch (err) {
      if (i === intentos - 1) {
        
        const elemento = porXpath
          ? await page.waitForSelector(`xpath/${selector}`, { timeout: 10000 })
          : await page.waitForSelector(selector, { timeout: 10000 });
        await page.evaluate((el) => el.click(), elemento);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}


async function ingresarTextoAngular(page, selector, valor, { porXpath = false } = {}) {
  const elemento = porXpath
    ? await page.waitForSelector(`xpath/${selector}`, { timeout: 10000 })
    : await page.waitForSelector(selector, { timeout: 10000 });

  await page.evaluate((el) => { el.value = ''; }, elemento);
  await elemento.type(String(valor).trim());
  await page.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, elemento);
}

async function hacerHoverElemento(page, selector, { porXpath = false } = {}) {
  try {
    const elemento = porXpath
      ? await page.waitForSelector(`xpath/${selector}`, { timeout: 5000 })
      : await page.waitForSelector(selector, { timeout: 5000 });
    await elemento.hover();
  } catch (err) {
    
  }
}

module.exports = {
  iniciarNavegador,
  configurarCarpetaDescargas,
  crearCarpetaMes,
  clicRobusto,
  ingresarTextoAngular,
  hacerHoverElemento,
};
