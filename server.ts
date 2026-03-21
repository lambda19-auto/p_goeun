import express from "express";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import OpenAI from "openai";
import type { TranscriptionDiarized } from "openai/resources/audio/transcriptions";
import dotenv from "dotenv";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { createTemplate, getDashboardStats, getDefaultUserId, getProfile, initializeDatabase, listTemplates, saveCallAnalysis, type TemplateWeightMap } from "./db";

dotenv.config();

const ffmpegBinaryPath = ffmpegStatic || "ffmpeg";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = 3000;

const upload = multer({ storage: multer.memoryStorage() });

const ANALYSIS_MODEL = "gpt-5.1-2025-11-13";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-transcribe-diarize";
const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;

// Initialize OpenAI lazily to ensure environment variables are loaded
let openAIInstance: OpenAI | null = null;

function getOpenAI() {
  if (!openAIInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is missing. Please add it to Secrets.");
    }
    openAIInstance = new OpenAI({ apiKey });
  }
  return openAIInstance;
}

async function generateJsonResponse(input: string) {
  const response = await getOpenAI().responses.create({
    model: ANALYSIS_MODEL,
    input,
    text: {
      format: { type: "json_object" },
      verbosity: "medium",
    },
  });

  return safeParseJSON(response.output_text);
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function runFfmpeg(command: ffmpeg.FfmpegCommand, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    command
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

function getAudioDurationInSeconds(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = spawn(ffmpegBinaryPath, ["-hide_banner", "-i", filePath]);
    let stderr = "";
    let settled = false;

    probe.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    probe.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    probe.on("close", () => {
      if (settled) {
        return;
      }

      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        settled = true;
        reject(new Error("Unable to determine audio duration for transcription chunking."));
        return;
      }

      const [, hours, minutes, seconds] = match;
      const duration = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
      if (!Number.isFinite(duration) || duration <= 0) {
        settled = true;
        reject(new Error("Unable to determine audio duration for transcription chunking."));
        return;
      }

      settled = true;
      resolve(duration);
    });
  });
}

type TranscriptionSegment = {
  speaker: string;
  text: string;
  timestamp: string;
  speakerReliable: boolean;
};

async function transcribeDiarizedFile(
  filePath: string,
  options: { offsetSeconds?: number; chunkIndex?: number; speakerReliable?: boolean } = {},
): Promise<TranscriptionSegment[]> {
  const { offsetSeconds = 0, chunkIndex = 0, speakerReliable = true } = options;
  const result = (await getOpenAI().audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: OPENAI_TRANSCRIPTION_MODEL,
    language: "ru",
    response_format: "diarized_json",
    chunking_strategy: "auto",
  })) as TranscriptionDiarized;

  return Array.isArray(result.segments)
    ? result.segments
        .map((segment) => ({
          speaker: speakerReliable
            ? segment.speaker
            : `Chunk ${chunkIndex + 1} · ${segment.speaker || "Speaker"}`,
          text: segment.text.trim(),
          timestamp: `[${formatTimestamp(segment.start + offsetSeconds)}-${formatTimestamp(segment.end + offsetSeconds)}]`,
          speakerReliable,
        }))
        .filter((segment) => segment.text.length > 0)
    : [];
}

type TranscriptionFile = {
  path: string;
  offsetSeconds: number;
};

type SplitAudioResult = {
  files: TranscriptionFile[];
  cleanupDirs: string[];
};

async function splitAudioForTranscription(filePath: string, tempId: string): Promise<SplitAudioResult> {
  const createChunks = async (
    sourcePath: string,
    sourceOffsetSeconds: number,
    depth: number,
  ): Promise<SplitAudioResult> => {
    const fileSize = fs.statSync(sourcePath).size;
    if (fileSize <= MAX_TRANSCRIPTION_FILE_BYTES) {
      return { files: [{ path: sourcePath, offsetSeconds: sourceOffsetSeconds }], cleanupDirs: [] };
    }

    const durationSeconds = await getAudioDurationInSeconds(sourcePath);
    if (durationSeconds <= 1 || depth >= 32) {
      throw new Error(
        `Audio chunk is ${Math.ceil(fileSize / (1024 * 1024))} MB and could not be reduced below the ${Math.ceil(MAX_TRANSCRIPTION_FILE_BYTES / (1024 * 1024))} MB transcription limit.`,
      );
    }

    const chunkCount = Math.max(2, Math.ceil(fileSize / MAX_TRANSCRIPTION_FILE_BYTES));
    const chunkDurationSeconds = Math.max(1, Math.ceil(durationSeconds / chunkCount));
    const chunkDir = fs.mkdtempSync(path.join(os.tmpdir(), `${tempId}_chunks_`));
    const files: TranscriptionFile[] = [];
    const cleanupDirs = [chunkDir];

    for (let index = 0; index < chunkCount; index += 1) {
      const offsetSeconds = index * chunkDurationSeconds;
      const remainingSeconds = durationSeconds - offsetSeconds;
      if (remainingSeconds <= 0) {
        break;
      }

      const chunkPath = path.join(chunkDir, `chunk_${depth}_${index}.mp3`);
      await runFfmpeg(
        ffmpeg(sourcePath)
          .setStartTime(offsetSeconds)
          .duration(Math.min(chunkDurationSeconds, remainingSeconds))
          .outputOptions("-c copy"),
        chunkPath,
      );

      const nestedResult = await createChunks(chunkPath, sourceOffsetSeconds + offsetSeconds, depth + 1);
      files.push(...nestedResult.files);
      cleanupDirs.push(...nestedResult.cleanupDirs);
    }

    return { files, cleanupDirs };
  };

  return createChunks(filePath, 0, 0);
}

// Helper to safely parse LLM JSON responses
function normalizeTemplateWeights(input: Partial<Record<keyof TemplateWeightMap, unknown>>): TemplateWeightMap {
  const normalized = {
    introduction: Number(input.introduction ?? 0),
    needDiscovery: Number(input.needDiscovery ?? 0),
    presentation: Number(input.presentation ?? 0),
    objectionHandling: Number(input.objectionHandling ?? 0),
    stopWords: Number(input.stopWords ?? 0),
    closing: Number(input.closing ?? 0),
  } satisfies TemplateWeightMap;

  const values = Object.values(normalized);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Template weights must be non-negative numbers.");
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.round(total) !== 100) {
    throw new Error("Template weights must sum to 100.");
  }

  return normalized;
}

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
  initializeDatabase();

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/bootstrap", (req, res) => {
    try {
      const userId = getDefaultUserId();
      const templateId = typeof req.query.templateId === "string" ? Number(req.query.templateId) : undefined;
      res.json({
        templates: listTemplates(),
        profile: getProfile(userId),
        dashboard: getDashboardStats(Number.isFinite(templateId) ? templateId : undefined),
      });
    } catch (error: any) {
      console.error("Bootstrap error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/templates", (req, res) => {
    try {
      res.json(listTemplates());
    } catch (error: any) {
      console.error("Templates list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/templates", (req, res) => {
    try {
      const { title, description, isActive, weights } = req.body ?? {};
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Template title is required." });
      }

      const template = createTemplate({
        title,
        description: typeof description === "string" ? description : undefined,
        isActive: typeof isActive === "boolean" ? isActive : true,
        createdByUserId: getDefaultUserId(),
        weights: normalizeTemplateWeights(weights ?? {}),
      });

      res.status(201).json(template);
    } catch (error: any) {
      console.error("Template create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/calls", (req, res) => {
    try {
      const {
        templateId,
        audioFileName,
        audioMimeType,
        audioSizeBytes,
        durationSeconds,
        transcriptText,
        transcriptJson,
        averageScore,
        summary,
        feedbackText,
        factsJson,
        scoresJson,
      } = req.body ?? {};

      if (!templateId || !audioFileName || !transcriptText || typeof averageScore !== "number") {
        return res.status(400).json({ error: "Missing required call analysis fields." });
      }

      const result = saveCallAnalysis({
        templateId: Number(templateId),
        audioFileName,
        audioMimeType,
        audioSizeBytes: typeof audioSizeBytes === "number" ? audioSizeBytes : undefined,
        durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
        transcriptText,
        transcriptJson,
        averageScore,
        summary,
        feedbackText,
        factsJson,
        scoresJson,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Call save error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for Transcription
  app.post("/api/transcribe", upload.single("file"), async (req, res) => {
    let inputPath = "";
    let outputPath = "";
    const cleanupDirs: string[] = [];
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
      await runFfmpeg(ffmpeg(inputPath).toFormat("mp3"), outputPath);

      const { files: transcriptionFiles, cleanupDirs: chunkCleanupDirs } = await splitAudioForTranscription(outputPath, tempId);
      cleanupDirs.push(...chunkCleanupDirs);

      // Transcription using OpenAI diarized transcription
      console.log(`Transcribing using ${OPENAI_TRANSCRIPTION_MODEL} (Russian)...`);
      const transcriptionData: TranscriptionSegment[] = [];
      const speakerReliable = transcriptionFiles.length === 1;
      for (const [chunkIndex, transcriptionFile] of transcriptionFiles.entries()) {
        const chunkSegments = await transcribeDiarizedFile(transcriptionFile.path, {
          offsetSeconds: transcriptionFile.offsetSeconds,
          chunkIndex,
          speakerReliable,
        });
        transcriptionData.push(...chunkSegments);
      }

      res.json(transcriptionData);
    } catch (error: any) {
      console.error("Transcription error:", error);
      const statusCode =
        typeof error?.message === "string" && error.message.includes("transcription limit")
          ? 413
          : 500;
      res.status(statusCode).json({ error: error.message });
    } finally {
      // Cleanup temp files
      for (const cleanupDir of new Set(cleanupDirs)) {
        if (fs.existsSync(cleanupDir)) fs.rmSync(cleanupDir, { recursive: true, force: true });
      }
      if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  });

  // API Route for Fact Extraction & Scoring
  app.post("/api/analyze", async (req, res) => {
    try {
      const { transcriptionText, facts, weights, factsOnly } = req.body;

      if (factsOnly) {
        const facts = await generateJsonResponse(`На основе следующей транскрипции звонка выдели ключевые факты по блокам и составь общую сводку. Верни результат СТРОГО в формате JSON со следующими ключами.
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
${transcriptionText}`);
        return res.json(facts);
      }

      const scoring = await generateJsonResponse(`Оцени качество звонка на основе полной транскрипции и выделенных фактов, затем верни результат СТРОГО в формате JSON. Поставь оценку от 1 до 10 для каждого блока.

ВАЖНО:
- Используй полную транскрипцию как основной источник контекста, включая префиксы speaker: и предупреждение о chunk-local метках спикеров, если они присутствуют.
- Используй блок "Выделенные факты" как вспомогательную сводку, но не теряй speaker attribution, если в фактах оно сокращено.
- При расчете среднего балла используй следующие веса (в процентах):
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

Полная транскрипция:
${transcriptionText}

Выделенные факты:
${JSON.stringify(facts ?? {})}`);

      res.json(scoring);
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
