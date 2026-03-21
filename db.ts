import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      criterion_code TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      weight INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      UNIQUE (template_id, criterion_code)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      template_title_snapshot TEXT NOT NULL,
      audio_file_name TEXT NOT NULL,
      audio_mime_type TEXT,
      audio_size_bytes INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS call_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL UNIQUE,
      transcript_text TEXT NOT NULL,
      transcript_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL UNIQUE,
      average_score REAL NOT NULL,
      summary TEXT,
      feedback_text TEXT,
      facts_json TEXT,
      scores_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      status TEXT NOT NULL,
      seconds_limit INTEGER NOT NULL DEFAULT 0,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      next_billing_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_templates_created_by_user_id ON templates (created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_template_weights_template_id ON template_weights (template_id);
    CREATE INDEX IF NOT EXISTS idx_calls_template_id ON calls (template_id);
    CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls (created_at);
    CREATE INDEX IF NOT EXISTS idx_call_reviews_call_id ON call_reviews (call_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
  `);

  seedDatabase();
}

function seedDatabase() {
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(DEFAULT_USER_EMAIL) as { id: number } | undefined;
  let userId = existingUser?.id;

  if (!userId) {
    const userInsert = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(DEFAULT_USER_EMAIL, DEFAULT_PASSWORD_HASH, "Константин Константинопольский", "admin", now());
    userId = Number(userInsert.lastInsertRowid);
  }

  const subscriptionExists = db.prepare("SELECT id FROM subscriptions WHERE user_id = ?").get(userId) as { id: number } | undefined;
  if (!subscriptionExists) {
    const createdAt = now();
    db.prepare(
      `INSERT INTO subscriptions (
        user_id, plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, "Pro", "active", 30 * 60 * 60, 0, startOfMonthISOString(), endOfMonthISOString(), monthAheadISOString(), createdAt, createdAt);
  }

  const templatesCount = db.prepare("SELECT COUNT(*) as count FROM templates").get() as { count: number };
  if (templatesCount.count === 0) {
    for (const definition of DEFAULT_TEMPLATE_DEFINITIONS) {
      createTemplate({
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

export function listTemplates(): TemplateRecord[] {
  const templateRows = db
    .prepare(
      `SELECT id, title, description, is_active, created_by_user_id, created_at, updated_at
       FROM templates
       ORDER BY updated_at DESC, id DESC`,
    )
    .all() as Array<Omit<TemplateRecord, "weights">>;

  const weightsStatement = db.prepare(
    `SELECT template_id, criterion_code, weight
     FROM template_weights
     ORDER BY sort_order ASC, id ASC`,
  );
  const weightRows = weightsStatement.all() as Array<{ template_id: number; criterion_code: CriterionCode; weight: number }>;

  return templateRows.map((row) => mapTemplateRow(row, weightRows.filter((weightRow) => weightRow.template_id === row.id)));
}

export function createTemplate(input: {
  title: string;
  description?: string;
  isActive?: boolean;
  createdByUserId: number;
  weights: TemplateWeightMap;
}): TemplateRecord {
  const timestamp = now();
  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO templates (title, description, is_active, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.title.trim(), input.description?.trim() || null, input.isActive === false ? 0 : 1, input.createdByUserId, timestamp, timestamp);

    const templateId = Number(result.lastInsertRowid);
    const insertWeight = db.prepare(
      `INSERT INTO template_weights (template_id, criterion_code, criterion_name, weight, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const criterion of CRITERIA) {
      insertWeight.run(templateId, criterion.code, criterion.name, input.weights[criterion.code] ?? 0, criterion.sortOrder);
    }

    const row = db.prepare(
      `SELECT id, title, description, is_active, created_by_user_id, created_at, updated_at
       FROM templates
       WHERE id = ?`,
    ).get(templateId) as Omit<TemplateRecord, "weights">;

    return mapTemplateRow(
      row,
      db.prepare(`SELECT criterion_code, weight FROM template_weights WHERE template_id = ? ORDER BY sort_order ASC`).all(templateId) as Array<{
        criterion_code: CriterionCode;
        weight: number;
      }>,
    );
  });

  return transaction();
}

export function getDefaultUserId(): number {
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(DEFAULT_USER_EMAIL) as { id: number };
  return user.id;
}

export function getProfile(userId: number): ProfileData {
  const user = db
    .prepare(
      `SELECT id, email, full_name, role, created_at
       FROM users
       WHERE id = ?`,
    )
    .get(userId) as { id: number; email: string; full_name: string; role: string; created_at: string };

  const subscription = db
    .prepare(
      `SELECT plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
       FROM subscriptions
       WHERE user_id = ?`,
    )
    .get(userId) as
    | {
        plan_name: string;
        status: string;
        seconds_limit: number;
        seconds_used: number;
        period_start: string;
        period_end: string;
        next_billing_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

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

export function getDashboardStats(templateId?: number): DashboardStats {
  const filterClause = templateId ? "WHERE c.template_id = @templateId" : "";
  const params = templateId ? { templateId } : {};

  const totals = db
    .prepare(
      `SELECT
         COUNT(c.id) as total_calls,
         ROUND(COALESCE(AVG(cr.average_score), 0), 1) as average_score,
         COALESCE(SUM(c.duration_seconds), 0) as total_duration_seconds
       FROM calls c
       LEFT JOIN call_reviews cr ON cr.call_id = c.id
       ${filterClause}`,
    )
    .get(params) as { total_calls: number; average_score: number; total_duration_seconds: number };

  const activeTemplates = db
    .prepare(`SELECT COUNT(*) as count FROM templates WHERE is_active = 1`)
    .get() as { count: number };

  const leaderboard = db
    .prepare(
      `SELECT
         c.template_title_snapshot as name,
         COUNT(c.id) as calls,
         ROUND(COALESCE(AVG(cr.average_score), 0), 1) as score
       FROM calls c
       LEFT JOIN call_reviews cr ON cr.call_id = c.id
       ${filterClause}
       GROUP BY c.template_title_snapshot
       ORDER BY score DESC, calls DESC, name ASC
       LIMIT 5`,
    )
    .all(params) as Array<{ name: string; calls: number; score: number }>;

  return {
    totalCalls: totals.total_calls,
    averageScore: totals.average_score,
    totalDurationSeconds: totals.total_duration_seconds,
    activeTemplates: activeTemplates.count,
    leaderboard: leaderboard.map((row, index) => ({
      ...row,
      trend: row.calls > 1 ? `+${Math.min(0.1 * row.calls, 0.9).toFixed(1)}` : "+0.0",
      status: index === 0 ? "Top Performer" : row.score >= 8 ? "Improving" : row.score >= 7 ? "Stable" : "Needs Coaching",
    })),
  };
}

export function saveCallAnalysis(input: {
  templateId: number;
  audioFileName: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  durationSeconds?: number;
  status?: string;
  transcriptText: string;
  transcriptJson: unknown;
  averageScore: number;
  summary?: string;
  feedbackText?: string;
  factsJson?: unknown;
  scoresJson?: unknown;
}): { callId: number } {
  const transaction = db.transaction(() => {
    const template = db
      .prepare(`SELECT id, title FROM templates WHERE id = ?`)
      .get(input.templateId) as { id: number; title: string } | undefined;

    if (!template) {
      throw new Error(`Template ${input.templateId} not found.`);
    }

    const timestamp = now();
    const callInsert = db
      .prepare(
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        template.id,
        template.title,
        input.audioFileName,
        input.audioMimeType || null,
        input.audioSizeBytes ?? null,
        Math.max(0, Math.round(input.durationSeconds ?? 0)),
        input.status || "completed",
        timestamp,
        timestamp,
      );

    const callId = Number(callInsert.lastInsertRowid);

    db.prepare(
      `INSERT INTO call_transcripts (call_id, transcript_text, transcript_json, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(callId, input.transcriptText, JSON.stringify(input.transcriptJson ?? null), timestamp);

    db.prepare(
      `INSERT INTO call_reviews (call_id, average_score, summary, feedback_text, facts_json, scores_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      callId,
      input.averageScore,
      input.summary || null,
      input.feedbackText || null,
      JSON.stringify(input.factsJson ?? null),
      JSON.stringify(input.scoresJson ?? null),
      timestamp,
    );

    db.prepare(
      `UPDATE subscriptions
       SET seconds_used = seconds_used + ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(Math.max(0, Math.round(input.durationSeconds ?? 0)), timestamp, getDefaultUserId());

    return { callId };
  });

  return transaction();
}
