import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy init Gemini AI client
let aiClient = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGroqKey: Boolean(process.env.GROQ_API_KEY)
  });
});

// AI Generation endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, systemPrompt, provider, model, apiKey } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const sysInstruction = systemPrompt || 'Anda adalah asisten pembuatan administrasi guru Kurikulum Merdeka Indonesia yang profesional, ramah, dan solutif.';

    // 1. If provider is Groq (or if Groq API key is provided)
    const groqKey = apiKey || process.env.GROQ_API_KEY;
    if (provider === 'groq' && groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sysInstruction },
              { role: 'user', content: prompt }
            ],
            temperature: 0.6
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return res.json({ content, provider: 'groq' });
          }
        } else {
          const errText = await groqRes.text();
          console.warn('Groq API error response:', errText);
        }
      } catch (err) {
        console.warn('Groq fetch failed:', err);
      }
    }

    // 2. Try Gemini API (either if explicitly selected or as fallback)
    try {
      const ai = getAI();
      if (ai) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: sysInstruction,
          }
        });
        const text = response.text;
        if (text) {
          return res.json({ content: text, provider: 'gemini' });
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed:', err);
    }

    // If no external AI call succeeded, return null content so client fallback can run
    return res.json({ content: null, message: 'AI fallback triggered' });
  } catch (error) {
    console.error('API generate error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Serve static assets from project root
app.use(express.static(__dirname));

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
