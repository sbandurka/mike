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
  res.send('✅ Directional translation server running')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic, origin } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  // 🔒 Полная защита от AI-циклов
  if (text.includes('[AI] [')) {
    console.log('⛔ Skipping AI-generated comment')
    return res.status(200).json({ skipped: true })
  }

  // 🔒 Предотвратить повторный public-перевод на клиентском вызове
  if (origin === 'client' && isPublic === true) {
    console.log('⛔ Blocked client-originated public comment')
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

    const combinedBody = `[AI] [${from} → ${to}]
Оригинал:
${text}

Перевод:
${translated}`

    const authHeader = {
      'Content-Type': 'application/json',
      Authorization: "Basic " + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString("base64")
    }

    await axios.put(
      `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
      {
        ticket: {
          comment: {
            body: combinedBody,
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
// 🔍 Временный тест перевода с корейского на русский
app.get('/test-ko-ru', async (req, res) => {
  try {
    const testText = '안녕하세요! 제 주문이 어디에 있는지 알려주세요?'

    const command = new TranslateTextCommand({
      Text: testText,
      SourceLanguageCode: 'ko',
      TargetLanguageCode: 'ru'
    })

    const response = await translateClient.send(command)

    res.json({
      original: testText,
      translated: response.TranslatedText
    })
  } catch (error) {
    console.error('❌ Ошибка тестового перевода:', error?.message)
    res.status(500).json({ error: 'Ошибка при тестовом переводе' })
  }
})

app.listen(PORT, () => console.log(`🚀 Directional-safe server running on port ${PORT}`))
