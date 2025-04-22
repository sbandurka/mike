import express from 'express'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

// 🔁 Простой маршрут для проверки из браузера
app.get('/', (req, res) => {
  res.send('✅ Привет из Render — сервер работает!')
})

// 🔁 Основной маршрут перевода
app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru' } = req.body

  if (!text) {
    return res.status(400).json({ error: 'No text provided' })
  }

  try {
    const client = new TranslateClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    })

    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: from,
      TargetLanguageCode: to
    })

    const response = await client.send(command)

    res.json({ translated: response.TranslatedText })
  } catch (error) {
    console.error('❌ Translation error:', error)
    res.status(500).json({ error: 'Translation failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
