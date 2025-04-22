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
  res.send('✅ Unified server running with anti-loop protection')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  // 🔁 Защита от зацикливания — игнорируем, если это уже автоперевод
  if (text.startsWith('[Auto-translated]') || text.startsWith('[Original')) {
    console.log('⛔ Skipping already translated or original comment.')
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

    const authHeader = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(\`\${process.env.ZENDESK_EMAIL}/token:\${process.env.ZENDESK_API_TOKEN}\`).toString('base64')}`
    }

    // 🔄 Если public = true → агент пишет → отправляем оригинал как private, перевод как public
    if (isPublic === true) {
      // 1. Сохраняем оригинал как внутренний
      await axios.put(
        \`https://\${process.env.ZENDESK_DOMAIN}/api/v2/tickets/\${ticket_id}.json\`,
        {
          ticket: {
            comment: {
              body: `[Original in ${from}]\n${text}`,
              public: false
            }
          }
        },
        { headers: authHeader }
      )

      // 2. Отправляем перевод как публичный
      const zendeskRes = await axios.put(
        \`https://\${process.env.ZENDESK_DOMAIN}/api/v2/tickets/\${ticket_id}.json\`,
        {
          ticket: {
            comment: {
              body: `[Auto-translated]\n${translated}`,
              public: true
            }
          }
        },
        { headers: authHeader }
      )

      return res.json({ translated, direction: 'agent_to_client', zendesk_response: zendeskRes.data })
    }

    // 🔄 Если public = false → клиент пишет → всё отправляется как внутреннее
    else {
      // 1. Оригинал
      await axios.put(
        \`https://\${process.env.ZENDESK_DOMAIN}/api/v2/tickets/\${ticket_id}.json\`,
        {
          ticket: {
            comment: {
              body: `[Original from client in ${from}]\n${text}`,
              public: false
            }
          }
        },
        { headers: authHeader }
      )

      // 2. Перевод
      const zendeskRes = await axios.put(
        \`https://\${process.env.ZENDESK_DOMAIN}/api/v2/tickets/\${ticket_id}.json\`,
        {
          ticket: {
            comment: {
              body: `[Auto-translated from client]\n${translated}`,
              public: false
            }
          }
        },
        { headers: authHeader }
      )

      return res.json({ translated, direction: 'client_to_agent', zendesk_response: zendeskRes.data })
    }
  } catch (error) {
    console.error('❌ Translation or Zendesk update error:', error?.response?.data || error.message)
    res.status(500).json({ error: 'Translation or update failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Unified server running on port ${PORT}`))