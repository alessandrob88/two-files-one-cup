const crypto = require('node:crypto');

/**
 * Scraper for CUP Marche - prenotazione con codice fiscale e ricetta elettronica.
 *
 * @param {Object} opts - Dependencies.
 * @param {Object} opts.puppeteer - Puppeteer instance.
 * @param {Object} opts.cheerio  - Cheerio instance.
 * @param {Object} params - Runtime parameters.
 * @param {string} params.codiceFiscale - Codice fiscale del paziente.
 * @param {string} params.nre - Numero della ricetta elettronica (campo "matrice2").
 *
 * @returns {Promise<{ available: boolean, message: string }>}
 */
const scrapeData = async ({ puppeteer, cheerio }, { codiceFiscale, nre }) => {
  const BASE_URL = 'https://mycupmarche.it/prenotazionecittadino/web/guest';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Silenzia gli errori di console del browser (font, analytics, ecc.)
  page.on('console', () => {});
  page.on('pageerror', () => {});

  try {
    // ── 1. Pagina iniziale ────────────────────────────────────────────────────
    console.log('[scraper] Carico la home guest...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30_000 });

    // ── 2. Click su "Prenota con Codice Fiscale" nel nav ─────────────────────
    console.log('[scraper] Clicco "Prenota con Codice Fiscale"...');
    await page.evaluate(() => {
      // Cerca il link per testo dentro #navigation
      const links = document.querySelectorAll('#navigation a');
      for (const link of links) {
        if (link.textContent.trim().includes('Prenota con Codice Fiscale')) {
          link.click();
          return;
        }
      }
      throw new Error('Link "Prenota con Codice Fiscale" non trovato nel nav');
    });

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 });
    console.log('[scraper] Pagina raggiunta:', page.url());

    // ── 3. Compila il form di ricerca ─────────────────────────────────────────
    console.log('[scraper] Compilo NRE e codice fiscale...');
    await page.waitForSelector('#matrice2', { timeout: 10_000 });
    await page.type('#matrice2', nre, { delay: 50 });

    await page.waitForSelector('#cf', { timeout: 10_000 });
    await page.type('#cf', codiceFiscale, { delay: 50 });

    // ── 4. Submit della searchForm (bottone con value "Ricerca") ──────────────
    console.log('[scraper] Clicco "Ricerca"...');
    await page.evaluate(() => {
      const form = document.querySelector('#searchForm');
      if (!form) throw new Error('#searchForm non trovata');

      const btn = [...form.querySelectorAll('input[type="button"]')].find(
        (el) => el.value.trim() === 'Ricerca'
      );
      if (!btn) throw new Error('Bottone "Ricerca" non trovato');
      btn.click();
    });

    // Aspettiamo che compaia il select area vasta (caricato dinamicamente)
    console.log('[scraper] Aspetto il select #selectAreaVastaId...');
    await page.waitForSelector('#selectAreaVastaId', {
      visible: true,
      timeout: 20_000,
    });

    // ── 5. Seleziona "MARCHE" nel select area vasta ───────────────────────────
    console.log('[scraper] Seleziono MARCHE...');
    await page.select('#selectAreaVastaId', 'MARCHE');

    // ── 6. Submit prenForm ("PRENOTA LE PRESTAZIONI") ────────────────────────
    console.log('[scraper] Clicco "PRENOTA LE PRESTAZIONI"...');
    await page.evaluate(() => {
      const form = document.querySelector('#prenForm');
      if (!form) throw new Error('#prenForm non trovata');

      const btn = [...form.querySelectorAll('input[type="submit"], input[type="button"], button')].find(
        (el) => (el.value || el.textContent).trim().includes('PRENOTA LE PRESTAZIONI')
      );
      if (!btn) throw new Error('Bottone "PRENOTA LE PRESTAZIONI" non trovato');
      btn.click();
    });

    // ── 7. Attende la pagina dei risultati ────────────────────────────────────
    console.log('[scraper] Aspetto la pagina delle prestazioni...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 });

    const finalUrl = page.url();
    console.log('[scraper] URL finale:', finalUrl);

    // Verifica che l'URL sia quello atteso (contiene /prestazione/ seguito da numeri)
    if (!/\/prestazione\/\d+/.test(finalUrl)) {
      throw new Error(`URL inatteso dopo la prenotazione: ${finalUrl}`);
    }

    // ── 8. Analizza il DOM con cheerio ────────────────────────────────────────
    const html = await page.content();
    const $ = cheerio.load(html);

    return parseResult($);
  } finally {
    await browser.close();
  }
};

/**
 * Legge il DOM della pagina risultati e decide se ci sono posti disponibili.
 *
 * Il messaggio "Nessun risultato trovato..." è presente nel DOM,
 * ma ci interessa solo se è VISIBILE (non hidden / display:none).
 */
const parseResult = ($) => {
  // Cerca tutti gli h3 dentro #content (o nel body se non c'è #content)
  const container = $('#content').length ? $('#content') : $('body');

  const noResultVisible = container.find('h3').toArray().some((el) => {
    const text = $(el).text().trim();
    if (!text.includes('Nessun risultato trovato')) return false;

    // Controlla visibilità: style attribute
    const style = $(el).attr('style') || '';
    if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
      return false;
    }

    // Controlla visibilità: classi comuni che nascondono elementi
    const classes = ($(el).attr('class') || '').split(/\s+/);
    const hiddenClasses = ['hidden', 'd-none', 'hide', 'invisible', 'ng-hide'];
    if (classes.some((c) => hiddenClasses.includes(c))) {
      return false;
    }

    return true; // è visibile
  });

  if (noResultVisible) {
    return {
      available: false,
      fingerprint: fingerprint('no-results'),
      message: 'Nessun posto disponibile nell\'area MARCHE.',
    };
  }

  const results = container.find('table#row tbody tr').toArray().map((row) => {
    const cells = $(row).find('td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
    const link = $(row).find('a[href]').first().attr('href');

    return {
      structure: cells[0] || 'Struttura non disponibile',
      unit: cells[1] || 'Unita non disponibile',
      municipality: cells[2] || 'Comune non disponibile',
      wait: cells[3] || cells[4] || 'n/d',
      url: link ? new URL(link, 'https://mycupmarche.it').href : null,
    };
  });

  if (!results.length) {
    return {
      available: true,
      fingerprint: fingerprint('available-without-details'),
      message: '🟢 Ci sono nuovi posti disponibili!',
    };
  }

  const message = [
    `<b>🟢 Posti disponibili: ${results.length}</b>`,
    ...results.map((result, index) => [
      `<b>${index + 1}. ${escapeHtml(result.structure)}</b>`,
      `Unita: ${escapeHtml(result.unit)}`,
      `Comune: ${escapeHtml(result.municipality)}`,
      `Attesa stimata: ${escapeHtml(result.wait)} giorni`,
      result.url ? `<a href="${escapeHtml(result.url)}">Apri disponibilita</a>` : null,
    ].filter(Boolean).join('\n')),
  ].join('\n\n');

  return { available: true, fingerprint: fingerprint(results), message };
};

const fingerprint = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

module.exports = { scrapeData };
