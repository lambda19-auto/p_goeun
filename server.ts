import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = 3000;

const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini lazily to ensure environment variables are loaded
let genAIInstance: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please add it to Secrets.");
    }
    genAIInstance = new GoogleGenAI({ apiKey });
  }
  return genAIInstance;
}

// Helper to safely parse LLM JSON responses
function safeParseJSON(content: string | null | undefined): any {
  if (!content) return {};
  const str = String(content);
  try {
    // Remove potential markdown code blocks
    const cleaned = str.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse LLM response as JSON:", str);
    // Try to find anything that looks like a JSON object or array in the string
    const match = str.match(/[\{\[][\s\S]*[\}\]]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return {};
      }
    }
    return {};
  }
}

async function startServer() {
  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for Transcription
  app.post("/api/transcribe", upload.single("file"), async (req, res) => {
    let inputPath = "";
    let outputPath = "";
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const originalMimetype = req.file.mimetype;
      const originalExt = originalMimetype.split("/")[1];
      
      const tempId = uuidv4();
      inputPath = path.join(os.tmpdir(), `${tempId}_input`);
      outputPath = path.join(os.tmpdir(), `${tempId}_output.mp3`);

      fs.writeFileSync(inputPath, req.file.buffer);

      // Convert to mp3 using ffmpeg to ensure compatibility and reduce size
      console.log(`Converting ${originalMimetype} to mp3...`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .toFormat("mp3")
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .save(outputPath);
      });

      const audioBase64 = fs.readFileSync(outputPath, { encoding: "base64" });

      // Transcription using Gemini 1.5 Flash
      console.log(`Transcribing using gemini-1.5-flash (Russian)...`);
      const result = await getGenAI().models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/mp3",
                  data: audioBase64,
                },
              },
              {
                text: `Транскрибируй этот аудиофайл на русском языке. 
          Используй диаризацию (разделение по спикерам). 
          Верни результат СТРОГО в формате JSON как массив объектов.
          Каждый объект должен иметь поля:
          - speaker: имя спикера (например, "Спикер 1", "Спикер 2")
          - text: текст фразы
          - timestamp: временная метка в формате [MM:SS-MM:SS]
          
          Пример: [{"speaker": "Спикер 1", "text": "Привет", "timestamp": "[00:00-00:02]"}]`,
              },
            ],
          },
        ],
      });

      const transcriptionData = safeParseJSON(result.text);
      res.json(Array.isArray(transcriptionData) ? transcriptionData : []);
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message });
    } finally {
      // Cleanup temp files
      if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  });

  // API Route for Fact Extraction & Scoring
  app.post("/api/analyze", async (req, res) => {
    try {
      const { transcriptionText, weights, factsOnly } = req.body;

      if (factsOnly) {
        // Extract facts using Gemini 1.5 Pro
        const result = await getGenAI().models.generateContent({
          model: "gemini-1.5-pro",
          contents: [
            {
              parts: [
                {
                  text: `На основе следующей транскрипции звонка выдели ключевые факты по блокам и составь общую сводку. Верни результат СТРОГО в формате JSON со следующими ключами. 
            ВАЖНО: Значения всех ключей должны быть строками (string).
            
            Ключи:
            - introduction
            - needDiscovery
            - presentation
            - objectionHandling
            - stopWords
            - closing
            - summary
 
            Транскрипция:
            ${transcriptionText}`,
                },
              ],
            },
          ],
        });
        return res.json(safeParseJSON(result.text));
      }

      // Scoring using Gemini 1.5 Pro
      const result = await getGenAI().models.generateContent({
        model: "gemini-1.5-pro",
        contents: [
          {
            parts: [
              {
                text: `Оцени качество звонка на основе выделенных фактов и верни результат СТРОГО в формате JSON. Поставь оценку от 1 до 10 для каждого блока. 
      
        ВАЖНО: При расчете среднего балла используй следующие веса (в процентах):
        - Вступление: ${weights.introduction}%
        - Потребности: ${weights.needDiscovery}%
        - Презентация: ${weights.presentation}%
        - Возражения: ${weights.objectionHandling}%
        - Стоп-слова: ${weights.stopWords}%
        - Завершение: ${weights.closing}%
        
        Итоговый средний балл должен быть взвешенным на основе этих процентов. Также добавь краткий фидбек.
 
        Верни JSON со следующими ключами:
        - introduction (number)
        - needDiscovery (number)
        - presentation (number)
        - objectionHandling (number)
        - stopWords (number)
        - closing (number)
        - average (number)
        - feedback (string)

        Факты:
        ${transcriptionText}`,
              },
            ],
          },
        ],
      });

      res.json(safeParseJSON(result.text));
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
