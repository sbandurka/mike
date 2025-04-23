import express from 'express'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import dotenv from 'dotenv'
import axios from 'axios'
import franc from 'franc'

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
  res.send('✅ Translation server with language detection running')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic, origin } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  if (text.includes('[AI] [') || text.includes('자동 번역')) {
    console.log('⛔ Skipping AI-generated or already translated comment')
    return res.status(200).json({ skipped: true })
  }

  if (origin === 'client' && isPublic === true) {
    console.log('⛔ Client-origin public translation blocked')
    return res.status(200).json({ skipped: true })
  }

  const detectedLang = franc(text, { minLength: 3 })
  console.log(`🌐 Detected language: ${detectedLang} for origin: ${origin}`)

  if (origin === 'agent' && detectedLang !== 'rus') {
    return res.status(200).json({ skipped: true, reason: 'Agent text not in Russian' })
  }

  if (origin === 'client' && detectedLang !== 'kor') {
    return res.status(200).json({ skipped: true, reason: 'Client text not in Korean' })
  }

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: from,
      TargetLanguageCode: to
    })

    const response = await translateClient.send(command)
    const translated = response.TranslatedText

    let commentBody = ''
    if (from === 'ru' && to === 'ko' && isPublic) {
      commentBody = `🇷🇺 → 🇰🇷 자동 번역\n\n📝 원문:\n${text}\n\n🔁 번역:\n${translated}`
    } else if (from === 'ko' && to === 'ru' && !isPublic) {
      commentBody = `🇰🇷 → 🇷🇺 [AI перевод]\n\n📝 Оригинал:\n${text}\n\n🔁 Перевод:\n${translated}`
    } else {
      commentBody = `[AI] [${from} → ${to}]\nОригинал:\n${text}\n\nПеревод:\n${translated}`
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
app.listen(PORT, () => console.log(`🚀 Language-detection translation server running on port ${PORT}`))