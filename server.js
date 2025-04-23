import express from 'express'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import dotenv from 'dotenv'
import axios from 'axios'

dotenv.config()
const app = express()
app.use(express.json())

const translateClient = new TranslateClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

app.get('/', (req, res) => {
  res.send('✅ Translation UI-enhanced server running')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic, origin } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  // 🔒 Против циклов
  if (text.includes('[AI] [') || text.includes('자동 번역')) {
    console.log('⛔ Skipping AI-generated or already translated comment')
    return res.status(200).json({ skipped: true })
  }

  // 🔒 Блокировать неверный перевод от клиента
  if (origin === 'client' && isPublic === true) {
    console.log('⛔ Client-origin public translation blocked')
    return res.status(200).json({ skipped: true })
  }

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: from,
      TargetLanguageCode: to
    })

    const response = await translateClient.send(command)
    const translated = response.TranslatedText

    // 🌐 Форматированное тело
    let commentBody = ''
    if (from === 'ru' && to === 'ko' && isPublic) {
      commentBody = `🇷🇺 → 🇰🇷 자동 번역

📝 원문:
${text}

🔁 번역:
${translated}`
    } else if (from === 'ko' && to === 'ru' && !isPublic) {
      commentBody = `🇰🇷 → 🇷🇺 [AI перевод]

📝 Оригинал:
${text}

🔁 Перевод:
${translated}`
    } else {
      commentBody = `[AI] [${from} → ${to}]
Оригинал:
${text}

Перевод:
${translated}`
    }

    const authHeader = {
      'Content-Type': 'application/json',
      Authorization: "Basic " + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString("base64")
    }

    await axios.put(
      `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
      {
        ticket: {
          comment: {
            body: commentBody,
            public: isPublic
          }
        }
      },
      { headers: authHeader }
    )

    res.json({ translated, direction: `${from}→${to}`, origin })
  } catch (error) {
    console.error('❌ Translation or Zendesk update error:', error?.response?.data || error.message)
    res.status(500).json({ error: 'Translation or update failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 UI-enhanced translation server running on port ${PORT}`))