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
  res.send('✅ Minimal final translation server running')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  if (text.includes('[AI] [Auto-translated')) {
    console.log('⛔ Skipping re-translation of AI-generated message')
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
      Authorization: "Basic " + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString("base64")
    }

    const actions = []

    if (isPublic === true) {
      actions.push({
        body: `[AI] [Original in ${from}]
${text}`,
        public: false
      })
      actions.push({
        body: `[AI] [Auto-translated]
${translated}`,
        public: true
      })
    } else {
      actions.push({
        body: `[AI] [Original from client in ${from}]
${text}`,
        public: false
      })
      actions.push({
        body: `[AI] [Auto-translated from client]
${translated}`,
        public: false
      })
    }

    for (const comment of actions) {
      await axios.put(
        `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
        { ticket: { comment } },
        { headers: authHeader }
      )
    }

    res.json({ translated, direction: isPublic ? 'agent_to_client' : 'client_to_agent' })
  } catch (error) {
    console.error('❌ Translation or Zendesk update error:', error?.response?.data || error.message)
    res.status(500).json({ error: 'Translation or update failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Minimal final server running on port ${PORT}`))