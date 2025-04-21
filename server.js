import express from 'express'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

const translateClient = new TranslateClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

app.post('/translate', async (req, res) => {
  const { text, from = 'auto', to = 'ru' } = req.body

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: from,
      TargetLanguageCode: to,
    })

    const response = await translateClient.send(command)
    res.json({ translated: response.TranslatedText })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Translation failed' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
