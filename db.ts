import fs from "fs";
import path from "path";
import { Pool, type QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || "callscore",
  host: process.env.POSTGRES_HOST || "localhost",
  database: process.env.POSTGRES_DB || "callscore",
  password: process.env.POSTGRES_PASSWORD || "callscore_password",
  port: Number(process.env.POSTGRES_PORT) || 5432,
});

export type CriterionCode =
  | "introduction"
  | "needDiscovery"
  | "presentation"
  | "objectionHandling"
  | "stopWords"
  | "closing";

export type TemplateWeightMap = Record<CriterionCode, number>;

export type TemplateRecord = {
  id: number;
  title: string;
  description: string | null;
  is_active: number;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  weights: TemplateWeightMap;
};

export type DashboardStats = {
  totalCalls: number;
  averageScore: number;
  totalDurationSeconds: number;
  activeTemplates: number;
  leaderboard: Array<{
    name: string;
    calls: number;
    score: number;
    trend: string;
    status: string;
  }>;
};

export type ProfileData = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
  subscription: {
    planName: string;
    status: string;
    secondsLimit: number;
    secondsUsed: number;
    periodStart: string;
    periodEnd: string;
    nextBillingAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

const DEFAULT_USER_EMAIL = "demo@callscore.ai";
const DEFAULT_PASSWORD_HASH = "demo-password-hash";
const DEFAULT_TEMPLATE_DEFINITIONS: Array<{
  title: string;
  description: string;
  weights: TemplateWeightMap;
  isActive?: boolean;
}> = [
  {
    title: "Александр Петров",
    description: "Шаблон аудита для холодных продаж и первого контакта.",
    weights: { introduction: 20, needDiscovery: 20, presentation: 20, objectionHandling: 20, stopWords: 10, closing: 10 },
    isActive: true,
  },
  {
    title: "Мария Сидорова",
    description: "Шаблон оценки клиентского сопровождения и эмпатии.",
    weights: { introduction: 10, needDiscovery: 30, presentation: 10, objectionHandling: 10, stopWords: 10, closing: 30 },
    isActive: true,
  },
  {
    title: "Иван Иванов",
    description: "Шаблон удержания клиентов и работы с возражениями.",
    weights: { introduction: 15, needDiscovery: 15, presentation: 20, objectionHandling: 20, stopWords: 10, closing: 20 },
    isActive: false,
  },
];

const CRITERIA: Array<{ code: CriterionCode; name: string; sortOrder: number }> = [
  { code: "introduction", name: "Вступление", sortOrder: 1 },
  { code: "needDiscovery", name: "Выявление потребностей", sortOrder: 2 },
  { code: "presentation", name: "Презентация", sortOrder: 3 },
  { code: "objectionHandling", name: "Работа с возражениями", sortOrder: 4 },
  { code: "stopWords", name: "Стоп-слова", sortOrder: 5 },
  { code: "closing", name: "Завершение", sortOrder: 6 },
];

function now(): string {
  return new Date().toISOString();
}

function monthAheadISOString(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function startOfMonthISOString(): string {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function endOfMonthISOString(): string {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString();
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_weights (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL,
      criterion_code TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      weight INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      UNIQUE (template_id, criterion_code)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL,
      template_title_snapshot TEXT NOT NULL,
      audio_file_name TEXT NOT NULL,
      audio_mime_type TEXT,
      audio_size_bytes INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS call_reviews (
      id SERIAL PRIMARY KEY,
      call_id INTEGER NOT NULL UNIQUE,
      transcript_text TEXT NOT NULL,
      average_score REAL NOT NULL,
      summary TEXT,
      feedback_text TEXT,
      facts_json TEXT,
      scores_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      status TEXT NOT NULL,
      seconds_limit INTEGER NOT NULL DEFAULT 0,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      next_billing_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_templates_created_by_user_id ON templates (created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_template_weights_template_id ON template_weights (template_id);
    CREATE INDEX IF NOT EXISTS idx_calls_template_id ON calls (template_id);
    CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls (created_at);
    CREATE INDEX IF NOT EXISTS idx_call_reviews_call_id ON call_reviews (call_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
  `);

  await seedDatabase();
}

async function seedDatabase() {
  const existingUserResult = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [DEFAULT_USER_EMAIL]
  );
  let userId = existingUserResult.rows[0]?.id;

  if (!userId) {
    const userInsertResult = await pool.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, full_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [DEFAULT_USER_EMAIL, DEFAULT_PASSWORD_HASH, "Константин Константинопольский", "admin", now()]
    );
    userId = userInsertResult.rows[0]?.id;
  }

  const subscriptionExistsResult = await pool.query<{ id: number }>(
    "SELECT id FROM subscriptions WHERE user_id = $1",
    [userId]
  );
  if (!subscriptionExistsResult.rows[0]) {
    const createdAt = now();
    await pool.query(
      `INSERT INTO subscriptions (
        user_id, plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, "Pro", "active", 30 * 60 * 60, 0, startOfMonthISOString(), endOfMonthISOString(), monthAheadISOString(), createdAt, createdAt]
    );
  }

  const templatesCountResult = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM templates");
  if (Number(templatesCountResult.rows[0]?.count) === 0) {
    for (const definition of DEFAULT_TEMPLATE_DEFINITIONS) {
      await createTemplate({
        title: definition.title,
        description: definition.description,
        isActive: definition.isActive ?? true,
        createdByUserId: userId,
        weights: definition.weights,
      });
    }
  }
}

function mapTemplateRow(templateRow: Omit<TemplateRecord, "weights">, weightRows: Array<{ criterion_code: CriterionCode; weight: number }>): TemplateRecord {
  const weights = CRITERIA.reduce((acc, criterion) => {
    const found = weightRows.find((row) => row.criterion_code === criterion.code);
    acc[criterion.code] = found?.weight ?? 0;
    return acc;
  }, {} as TemplateWeightMap);

  return {
    ...templateRow,
    weights,
  };
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const templateRowsResult = await pool.query<{
    id: number;
    title: string;
    description: string | null;
    is_active: boolean;
    created_by_user_id: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, title, description, is_active, created_by_user_id, created_at, updated_at
     FROM templates
     ORDER BY updated_at DESC, id DESC`
  );

  const weightRowsResult = await pool.query<{ template_id: number; criterion_code: CriterionCode; weight: number }>(
    `SELECT template_id, criterion_code, weight
     FROM template_weights
     ORDER BY sort_order ASC, id ASC`
  );

  return templateRowsResult.rows.map((row) =>
    mapTemplateRow(
      { ...row, is_active: row.is_active ? 1 : 0 },
      weightRowsResult.rows.filter((weightRow) => weightRow.template_id === row.id)
    )
  );
}

export async function createTemplate(input: {
  title: string;
  description?: string;
  isActive?: boolean;
  createdByUserId: number;
  weights: TemplateWeightMap;
}): Promise<TemplateRecord> {
  const timestamp = now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO templates (title, description, is_active, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.title.trim(), input.description?.trim() || null, input.isActive !== false, input.createdByUserId, timestamp, timestamp]
    );

    const templateId = insertResult.rows[0]?.id;
    if (!templateId) {
      throw new Error("Failed to create template");
    }

    for (const criterion of CRITERIA) {
      await client.query(
        `INSERT INTO template_weights (template_id, criterion_code, criterion_name, weight, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [templateId, criterion.code, criterion.name, input.weights[criterion.code] ?? 0, criterion.sortOrder]
      );
    }

    const rowResult = await client.query<{
      id: number;
      title: string;
      description: string | null;
      is_active: boolean;
      created_by_user_id: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, title, description, is_active, created_by_user_id, created_at, updated_at
       FROM templates
       WHERE id = $1`,
      [templateId]
    );

    const weightRowsResult = await client.query<{ criterion_code: CriterionCode; weight: number }>(
      `SELECT criterion_code, weight FROM template_weights WHERE template_id = $1 ORDER BY sort_order ASC`,
      [templateId]
    );

    await client.query('COMMIT');

    return mapTemplateRow(
      { ...rowResult.rows[0]!, is_active: rowResult.rows[0]!.is_active ? 1 : 0 },
      weightRowsResult.rows
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getDefaultUserId(): Promise<number> {
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [DEFAULT_USER_EMAIL]
  );
  if (!result.rows[0]) {
    throw new Error("Default user not found");
  }
  return result.rows[0].id;
}

export async function getProfile(userId: number): Promise<ProfileData> {
  const userResult = await pool.query<{
    id: number;
    email: string;
    full_name: string;
    role: string;
    created_at: string;
  }>(
    `SELECT id, email, full_name, role, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const subscriptionResult = await pool.query<{
    plan_name: string;
    status: string;
    seconds_limit: number;
    seconds_used: number;
    period_start: string;
    period_end: string;
    next_billing_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1`,
    [userId]
  );

  const subscription = subscriptionResult.rows[0];

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    createdAt: user.created_at,
    subscription: subscription
      ? {
          planName: subscription.plan_name,
          status: subscription.status,
          secondsLimit: subscription.seconds_limit,
          secondsUsed: subscription.seconds_used,
          periodStart: subscription.period_start,
          periodEnd: subscription.period_end,
          nextBillingAt: subscription.next_billing_at,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
        }
      : null,
  };
}

export async function getDashboardStats(templateId?: number): Promise<DashboardStats> {
  const filterClause = templateId ? "WHERE c.template_id = $1" : "";
  const params = templateId ? [templateId] : [];

  const totalsResult = await pool.query<{ total_calls: string; average_score: number; total_duration_seconds: number }>(
    `SELECT
       COUNT(c.id) as total_calls,
       ROUND(COALESCE(AVG(cr.average_score)::numeric, 0), 1) as average_score,
       COALESCE(SUM(c.duration_seconds), 0) as total_duration_seconds
     FROM calls c
     LEFT JOIN call_reviews cr ON cr.call_id = c.id
     ${filterClause}`,
    params
  );

  const totals = {
    total_calls: Number(totalsResult.rows[0]?.total_calls) || 0,
    average_score: totalsResult.rows[0]?.average_score || 0,
    total_duration_seconds: totalsResult.rows[0]?.total_duration_seconds || 0,
  };

  const activeTemplatesResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM templates WHERE is_active = true`
  );
  const activeTemplates = Number(activeTemplatesResult.rows[0]?.count) || 0;

  const leaderboardResult = await pool.query<{ name: string; calls: string; score: number }>(
    `SELECT
       c.template_title_snapshot as name,
       COUNT(c.id) as calls,
       ROUND(COALESCE(AVG(cr.average_score)::numeric, 0), 1) as score
     FROM calls c
     LEFT JOIN call_reviews cr ON cr.call_id = c.id
     ${filterClause}
     GROUP BY c.template_title_snapshot
     ORDER BY score DESC, calls DESC, name ASC
     LIMIT 5`,
    params
  );

  const leaderboard = leaderboardResult.rows.map((row) => ({
    name: row.name,
    calls: Number(row.calls) || 0,
    score: row.score || 0,
  }));

  return {
    totalCalls: totals.total_calls,
    averageScore: totals.average_score,
    totalDurationSeconds: totals.total_duration_seconds,
    activeTemplates,
    leaderboard: leaderboard.map((row, index) => ({
      ...row,
      trend: row.calls > 1 ? `+${Math.min(0.1 * row.calls, 0.9).toFixed(1)}` : "+0.0",
      status: index === 0 ? "Top Performer" : row.score >= 8 ? "Improving" : row.score >= 7 ? "Stable" : "Needs Coaching",
    })),
  };
}

export async function saveCallAnalysis(input: {
  templateId: number;
  audioFileName: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  durationSeconds?: number;
  status?: string;
  transcriptText: string;
  averageScore: number;
  summary?: string;
  feedbackText?: string;
  factsJson?: unknown;
  scoresJson?: unknown;
}): Promise<{ callId: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const templateResult = await client.query<{ id: number; title: string }>(
      `SELECT id, title FROM templates WHERE id = $1`,
      [input.templateId]
    );
    const template = templateResult.rows[0];

    if (!template) {
      throw new Error(`Template ${input.templateId} not found.`);
    }

    const timestamp = now();
    const callInsertResult = await client.query<{ id: number }>(
      `INSERT INTO calls (
        template_id,
        template_title_snapshot,
        audio_file_name,
        audio_mime_type,
        audio_size_bytes,
        duration_seconds,
        status,
        created_at,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        template.id,
        template.title,
        input.audioFileName,
        input.audioMimeType || null,
        input.audioSizeBytes ?? null,
        Math.max(0, Math.round(input.durationSeconds ?? 0)),
        input.status || "completed",
        timestamp,
        timestamp,
      ]
    );

    const callId = callInsertResult.rows[0]?.id;
    if (!callId) {
      throw new Error("Failed to create call record");
    }

    await client.query(
      `INSERT INTO call_reviews (call_id, transcript_text, average_score, summary, feedback_text, facts_json, scores_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        callId,
        input.transcriptText,
        input.averageScore,
        input.summary || null,
        input.feedbackText || null,
        JSON.stringify(input.factsJson ?? null),
        JSON.stringify(input.scoresJson ?? null),
        timestamp,
      ]
    );

    const defaultUserId = await getDefaultUserId();
    await client.query(
      `UPDATE subscriptions
       SET seconds_used = seconds_used + $1, updated_at = $2
       WHERE user_id = $3`,
      [Math.max(0, Math.round(input.durationSeconds ?? 0)), timestamp, defaultUserId]
    );

    await client.query('COMMIT');

    return { callId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
