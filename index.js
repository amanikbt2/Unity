import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for mobile clients
app.use(cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup multer for memory storage uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve web client
app.use(express.static(path.join(__dirname, 'public')));

// Translate text endpoint
app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing text or targetLang' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                text: `You are a professional real-time chat translator. Translate the following user message into the target language "${targetLang}". Return ONLY the translated text. Do not include notes, explanations, or quotes: "${text}"`
              }
            ]
          }
        ]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const translatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    res.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to translate text. Check API Key or server logs.' });
  }
});

// Translate voice endpoint (STT + Translation in single pass)
app.post('/api/translate-voice', upload.single('audio'), async (req, res) => {
  const { targetLang } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: 'Missing audio file' });
  }
  if (!targetLang) {
    return res.status(400).json({ error: 'Missing targetLang' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    const base64Audio = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/m4a'; // default m4a for expo recording

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio
                }
              },
              {
                text: `Transcribe this audio clip and translate it into the target language "${targetLang}". You MUST return only a raw JSON object in this format: { "transcription": "exact transcription in original language", "translation": "translated text" }. Do not wrap the JSON object in markdown blocks (e.g. do not use \`\`\`json).`
              }
            ]
          }
        ]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Clean potential markdown wrap just in case
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(rawText);
    res.json(result);
  } catch (error) {
    console.error('Voice translation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to process voice. Check API Key or server logs.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Amani AI server running on http://localhost:${PORT}`);
});
