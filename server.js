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
  res.send('✅ Ultralock server running with tag-based anti-loop')
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru', ticket_id, public: isPublic } = req.body

  if (!text || !ticket_id) {
    return res.status(400).json({ error: 'Text or ticket_id missing' })
  }

  if (
    text.startsWith('[AI]') ||
    text.startsWith('[Auto-translated]') ||
    text.startsWith('[Original') ||
    text.includes('[Original in') ||
    text.includes('[Original from')
  ) {
    console.log('⛔ Skipping AI/system/quoted comment.')
    return res.status(200).json({ skipped: true })
  }

  if (from === to) {
    console.log('⛔ Skipping same-language translation (from == to)')
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

    if (text.trim() === translated.trim()) {
      console.log('⛔ Skipping redundant translation (text equals translated)')
      return res.status(200).json({ skipped: true })
    }

    const authHeader = {
      'Content-Type': 'application/json',
      Authorization: "Basic " + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString("base64")
    }

    const comments = []

    if (isPublic === true) {
      comments.push({
        comment: {
          body: `[AI] [Original in ${from}]
${text}`,
          public: false
        }
      })
      comments.push({
        comment: {
          body: `[AI] [Auto-translated]
${translated}`,
          public: true
        }
      })
    } else {
      comments.push({
        comment: {
          body: `[AI] [Original from client in ${from}]
${text}`,
          public: false
        }
      })
      comments.push({
        comment: {
          body: `[AI] [Auto-translated from client]
${translated}`,
          public: false
        }
      })
    }

    // Apply each comment and add tag after the last one
    for (let i = 0; i < comments.length; i++) {
      const update = {
        ticket: {
          ...comments[i],
          tags: i === comments.length - 1 ? ['ai_translated'] : undefined
        }
      }

      await axios.put(
        `https://${process.env.ZENDESK_DOMAIN}/api/v2/tickets/${ticket_id}.json`,
        update,
        { headers: authHeader }
      )
    }

    res.json({ translated, tag: 'ai_translated', comments: comments.length })
  } catch (error) {
    console.error('❌ Translation or Zendesk update error:', error?.response?.data || error.message)
    res.status(500).json({ error: 'Translation or update failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Ultralock server running on port ${PORT}`))