import { Pool, type QueryResultRow } from "pg";

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

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? "5432"),
  database: process.env.POSTGRES_DB ?? "app",
  user: process.env.POSTGRES_USER ?? "app",
  password: process.env.POSTGRES_PASSWORD ?? "app",
});

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

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS templates (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS template_weights (
      id BIGSERIAL PRIMARY KEY,
      template_id BIGINT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      criterion_code TEXT NOT NULL,
      criterion_name TEXT NOT NULL,
      weight INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      UNIQUE (template_id, criterion_code)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id BIGSERIAL PRIMARY KEY,
      template_id BIGINT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
      template_title_snapshot TEXT NOT NULL,
      audio_file_name TEXT NOT NULL,
      audio_mime_type TEXT,
      audio_size_bytes BIGINT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS call_transcripts (
      id BIGSERIAL PRIMARY KEY,
      call_id BIGINT NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
      transcript_text TEXT NOT NULL,
      transcript_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS call_reviews (
      id BIGSERIAL PRIMARY KEY,
      call_id BIGINT NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
      average_score REAL NOT NULL,
      feedback_text TEXT,
      facts_json JSONB,
      scores_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan_name TEXT NOT NULL,
      status TEXT NOT NULL,
      seconds_limit INTEGER NOT NULL DEFAULT 0,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      next_billing_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  const existingUserResult = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [DEFAULT_USER_EMAIL]);
  let userId = Number(existingUserResult.rows[0]?.id);

  if (!userId) {
    const userInsert = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [DEFAULT_USER_EMAIL, DEFAULT_PASSWORD_HASH, "Константин Константинопольский", "admin", now()],
    );
    userId = Number(userInsert.rows[0].id);
  }

  const subscriptionExists = await pool.query<{ id: string }>("SELECT id FROM subscriptions WHERE user_id = $1", [userId]);
  if (subscriptionExists.rowCount === 0) {
    const createdAt = now();
    await pool.query(
      `INSERT INTO subscriptions (
        user_id, plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, "Pro", "active", 30 * 60 * 60, 0, startOfMonthISOString(), endOfMonthISOString(), monthAheadISOString(), createdAt, createdAt],
    );
  }

  const templatesCount = await pool.query<{ count: string }>("SELECT COUNT(*)::text as count FROM templates");
  if (Number(templatesCount.rows[0].count) === 0) {
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

function mapTemplateRow(
  templateRow: Omit<TemplateRecord, "weights">,
  weightRows: Array<{ criterion_code: CriterionCode; weight: number }>,
): TemplateRecord {
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
  const templateRows = await pool.query<Omit<TemplateRecord, "weights">>(
    `SELECT id::int, title, description, is_active::int, created_by_user_id::int, created_at, updated_at
     FROM templates
     ORDER BY updated_at DESC, id DESC`,
  );

  const weightRows = await pool.query<{ template_id: number; criterion_code: CriterionCode; weight: number }>(
    `SELECT template_id::int, criterion_code, weight
     FROM template_weights
     ORDER BY sort_order ASC, id ASC`,
  );

  return templateRows.rows.map((row) =>
    mapTemplateRow(
      {
        ...row,
        created_at: toIsoString((row as QueryResultRow).created_at),
        updated_at: toIsoString((row as QueryResultRow).updated_at),
      },
      weightRows.rows.filter((weightRow) => weightRow.template_id === row.id),
    ),
  );
}

export async function createTemplate(input: {
  title: string;
  description?: string;
  isActive?: boolean;
  createdByUserId: number;
  weights: TemplateWeightMap;
}): Promise<TemplateRecord> {
  const client = await pool.connect();
  try {
    const timestamp = now();
    await client.query("BEGIN");

    const inserted = await client.query<Omit<TemplateRecord, "weights">>(
      `INSERT INTO templates (title, description, is_active, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::int, title, description, is_active::int, created_by_user_id::int, created_at, updated_at`,
      [input.title.trim(), input.description?.trim() || null, input.isActive === false ? 0 : 1, input.createdByUserId, timestamp, timestamp],
    );

    const template = inserted.rows[0];

    for (const criterion of CRITERIA) {
      await client.query(
        `INSERT INTO template_weights (template_id, criterion_code, criterion_name, weight, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [template.id, criterion.code, criterion.name, input.weights[criterion.code] ?? 0, criterion.sortOrder],
      );
    }

    const weights = await client.query<{ criterion_code: CriterionCode; weight: number }>(
      `SELECT criterion_code, weight FROM template_weights WHERE template_id = $1 ORDER BY sort_order ASC`,
      [template.id],
    );

    await client.query("COMMIT");

    return mapTemplateRow(
      {
        ...template,
        created_at: toIsoString((template as QueryResultRow).created_at),
        updated_at: toIsoString((template as QueryResultRow).updated_at),
      },
      weights.rows,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDefaultUserId(): Promise<number> {
  const user = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [DEFAULT_USER_EMAIL]);
  return Number(user.rows[0].id);
}

export async function getProfile(userId: number): Promise<ProfileData> {
  const user = await pool.query<{ id: number; email: string; full_name: string; role: string; created_at: unknown }>(
    `SELECT id::int, email, full_name, role, created_at
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const subscription = await pool.query<{
    plan_name: string;
    status: string;
    seconds_limit: number;
    seconds_used: number;
    period_start: unknown;
    period_end: unknown;
    next_billing_at: unknown | null;
    created_at: unknown;
    updated_at: unknown;
  }>(
    `SELECT plan_name, status, seconds_limit, seconds_used, period_start, period_end, next_billing_at, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1`,
    [userId],
  );

  const userRow = user.rows[0];
  const subscriptionRow = subscription.rows[0];

  return {
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
    role: userRow.role,
    createdAt: toIsoString(userRow.created_at),
    subscription: subscriptionRow
      ? {
          planName: subscriptionRow.plan_name,
          status: subscriptionRow.status,
          secondsLimit: subscriptionRow.seconds_limit,
          secondsUsed: subscriptionRow.seconds_used,
          periodStart: toIsoString(subscriptionRow.period_start),
          periodEnd: toIsoString(subscriptionRow.period_end),
          nextBillingAt: subscriptionRow.next_billing_at ? toIsoString(subscriptionRow.next_billing_at) : null,
          createdAt: toIsoString(subscriptionRow.created_at),
          updatedAt: toIsoString(subscriptionRow.updated_at),
        }
      : null,
  };
}

export async function getDashboardStats(templateId?: number): Promise<DashboardStats> {
  const hasFilter = typeof templateId === "number";
  const filterClause = hasFilter ? "WHERE c.template_id = $1" : "";
  const filterParams = hasFilter ? [templateId] : [];

  const totals = await pool.query<{ total_calls: string; average_score: string; total_duration_seconds: string }>(
    `SELECT
       COUNT(c.id) as total_calls,
       ROUND(COALESCE(AVG(cr.average_score), 0)::numeric, 1) as average_score,
       COALESCE(SUM(c.duration_seconds), 0) as total_duration_seconds
     FROM calls c
     LEFT JOIN call_reviews cr ON cr.call_id = c.id
     ${filterClause}`,
    filterParams,
  );

  const activeTemplates = await pool.query<{ count: string }>(`SELECT COUNT(*) as count FROM templates WHERE is_active = 1`);

  const leaderboard = await pool.query<{ name: string; calls: string; score: string }>(
    `SELECT
       c.template_title_snapshot as name,
       COUNT(c.id) as calls,
       ROUND(COALESCE(AVG(cr.average_score), 0)::numeric, 1) as score
     FROM calls c
     LEFT JOIN call_reviews cr ON cr.call_id = c.id
     ${filterClause}
     GROUP BY c.template_title_snapshot
     ORDER BY score DESC, calls DESC, name ASC
     LIMIT 5`,
    filterParams,
  );

  return {
    totalCalls: Number(totals.rows[0].total_calls),
    averageScore: Number(totals.rows[0].average_score),
    totalDurationSeconds: Number(totals.rows[0].total_duration_seconds),
    activeTemplates: Number(activeTemplates.rows[0].count),
    leaderboard: leaderboard.rows.map((row, index) => {
      const calls = Number(row.calls);
      const score = Number(row.score);
      return {
        name: row.name,
        calls,
        score,
        trend: calls > 1 ? `+${Math.min(0.1 * calls, 0.9).toFixed(1)}` : "+0.0",
        status: index === 0 ? "Top Performer" : score >= 8 ? "Improving" : score >= 7 ? "Stable" : "Needs Coaching",
      };
    }),
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
  transcriptJson: unknown;
  averageScore: number;
  feedbackText?: string;
  factsJson?: unknown;
  scoresJson?: unknown;
}): Promise<{ callId: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const template = await client.query<{ id: number; title: string }>(`SELECT id::int, title FROM templates WHERE id = $1`, [input.templateId]);

    if (template.rowCount === 0) {
      throw new Error(`Template ${input.templateId} not found.`);
    }

    const timestamp = now();
    const callInsert = await client.query<{ id: number }>(
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
      RETURNING id::int`,
      [
        template.rows[0].id,
        template.rows[0].title,
        input.audioFileName,
        input.audioMimeType || null,
        input.audioSizeBytes ?? null,
        Math.max(0, Math.round(input.durationSeconds ?? 0)),
        input.status || "completed",
        timestamp,
        timestamp,
      ],
    );

    const callId = callInsert.rows[0].id;

    await client.query(
      `INSERT INTO call_transcripts (call_id, transcript_text, transcript_json, created_at)
       VALUES ($1, $2, $3, $4)`,
      [callId, input.transcriptText, JSON.stringify(input.transcriptJson ?? null), timestamp],
    );

    await client.query(
      `INSERT INTO call_reviews (call_id, average_score, feedback_text, facts_json, scores_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        callId,
        input.averageScore,
        input.feedbackText || null,
        JSON.stringify(input.factsJson ?? null),
        JSON.stringify(input.scoresJson ?? null),
        timestamp,
      ],
    );

    const defaultUserId = await getDefaultUserId();
    await client.query(
      `UPDATE subscriptions
       SET seconds_used = seconds_used + $1, updated_at = $2
       WHERE user_id = $3`,
      [Math.max(0, Math.round(input.durationSeconds ?? 0)), timestamp, defaultUserId],
    );

    await client.query("COMMIT");

    return { callId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
