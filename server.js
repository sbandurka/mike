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
  res.send('✅ Server is running and supports split comment translation')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: from,
      TargetLanguageCode: to
    })

    const response = await translateClient.send(command)
    const translated = response.TranslatedText

    // Если публичный комментарий — значит от агента, сохраняем оригинал как внутренний
    if (isPublic) {
      // 1. Сохраняем оригинал как внутренний комментарий
      await axios({
        method: 'PUT',
        url: `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64')}`
        },
        data: {
          ticket: {
            comment: {
              body: `[Original in ${from}]
${text}`,
              public: false
            }
          }
        }
      })
    }

    // 2. Отправляем перевод как публичный (если public=true) или внутренний (если false)
    const zendeskRes = await axios({
      method: 'PUT',
      url: `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64')}`
      },
      data: {
        ticket: {
          comment: {
            body: `[Auto-translated]
${translated}`,
            public: isPublic === true
          }
        }
      }
    })

    res.json({ translated, zendesk_response: zendeskRes.data })
  } catch (error) {
    console.error('❌ Translation or Zendesk update error:', error?.response?.data || error.message)
    res.status(500).json({ error: 'Translation or update failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))