import express from 'express'
import dotenv from 'dotenv'
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate'

dotenv.config()

const app = express()
app.use(express.json())

// AWS Translate клиент
const translateClient = new TranslateClient({
  region: 'ap-northeast-2', // или нужный тебе регион
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// 🔁 Тестовый маршрут перевода корейский → русский
app.get('/test-translate', async (req, res) => {
  try {
    const text = '안녕하세요! 제 주문이 어디에 있는지 알려주세요?'

    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: 'ko',
      TargetLanguageCode: 'ru'
    })

    const response = await translateClient.send(command)

    res.json({
      original: text,
      translated: response.TranslatedText
    })
  } catch (error) {
    console.error('Ошибка перевода:', error)
    res.status(500).json({ error: 'Ошибка перевода' })
  }
})

// ✅ Стандартный старт сервера
const port = process.env.PORT || 10000
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`)
})
