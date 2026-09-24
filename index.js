require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Bot: TelegramBot } = require('node-telegram-bot-api');

const scraper = require('./scraper');
const telegram = require('./telegram');


const BOT_TOKEN      = process.env.BOT_TOKEN;
const CHAT_ID        = process.env.CHAT_ID;
const CODICE_FISCALE = process.env.CODICE_FISCALE;
const NRE            = process.env.NRE;
const ENV            = process.env.ENV || 'production';
const STATE_FILE     = path.join(__dirname, '.last-result.sha256');

(async () => {
  const [puppeteerModule, cheerioModule] = await Promise.all([
    import('puppeteer'),
    import('cheerio'),
  ]);
  const puppeteer = puppeteerModule.default || puppeteerModule;
  const cheerio = cheerioModule.default || cheerioModule;

  const missing = ['BOT_TOKEN', 'CHAT_ID', 'CODICE_FISCALE', 'NRE'].filter(
    (key) => !process.env[key]
  );
  if (missing.length) {
    console.error(`[index] Variabili d'ambiente mancanti: ${missing.join(', ')}`);
    process.exit(1);
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: false });

  try {
    console.log('[index] Avvio scraping CUP Marche...');

    const result = await scraper.scrapeData(
      { puppeteer, cheerio },
      { codiceFiscale: CODICE_FISCALE, nre: NRE }
    );

    console.log('[index] Risultato:', result);

    const previousFingerprint = readFingerprint();
    const resultChanged = result.fingerprint !== previousFingerprint;

    if (result.available && resultChanged) {
      await telegram.sendNotification({ bot }, { chatId: CHAT_ID, message: result.message });
    } else if (result.available) {
      console.log('[index] Risultato invariato, notifica Telegram non inviata.');
    } else {
      (ENV === 'local' && resultChanged) && (await telegram.sendNotification({ bot }, { chatId: CHAT_ID, message: '⚠️ Nessun posto disponibile' }));
      console.log('[index] Nessun posto disponibile, notifica Telegram non inviata.');
    }

    if (resultChanged) {
      fs.writeFileSync(STATE_FILE, `${result.fingerprint}\n`);
      console.log('[index] Fingerprint del risultato aggiornato.');
    }
  } catch (error) {
    console.error('[index] Errore durante lo scraping:', error.message);

    process.exit(1);
  }
})();

const readFingerprint = () => {
  try {
    return fs.readFileSync(STATE_FILE, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
