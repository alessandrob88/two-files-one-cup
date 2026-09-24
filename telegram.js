/**
 * Invia una notifica Telegram al chatId configurato.
 *
 * @param {Object} opts
 * @param {import('node-telegram-bot-api')} opts.bot - Istanza del bot Telegram.
 * @param {Object} params
 * @param {string} params.chatId - ID della chat a cui inviare il messaggio.
 * @param {string} params.message - Testo del messaggio.
 *
 * @returns {Promise<void>}
 */
const sendNotification = async ({ bot }, { chatId, message }) => {
  try {
    for (const chunk of splitMessage(message)) {
      await bot.api.sendMessage({ chat_id: chatId, text: chunk, parse_mode: 'HTML' });
    }
    console.log('[telegram] Messaggio inviato con successo!');
  } catch (error) {
    console.error('[telegram] Errore durante l\'invio del messaggio:', error);
  }
};

const splitMessage = (message, maxLength = 4096) => {
  const sections = message.split('\n\n');
  const chunks = [];
  let current = '';

  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = section;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

module.exports = { sendNotification };
