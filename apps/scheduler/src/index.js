import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";

const SCHEDULE_QUEUE_NAME = "scanai-scheduled-scans";
const EMAIL_QUEUE_NAME = "scanai-email-dispatch";
const SCAN_DISPATCH_QUEUE_NAME = "scanai-scan-dispatch";
const SCHEDULER_PREFIX = "scheduled-scan:";
const EMAIL_PREFIX = "scan-completion-email-";
const SCAN_DISPATCH_PREFIX = "scan-dispatch-";

const API_BASE_URL = process.env.SCHEDULER_API_URL || "http://api:8000";
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379/0";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || "scanai-scheduler-dev";
const SYNC_INTERVAL_MS = Number(process.env.SCHEDULER_SYNC_INTERVAL_MS || 15000);
const EMAIL_SYNC_INTERVAL_MS = Number(process.env.EMAIL_SYNC_INTERVAL_MS || 10000);
const SCAN_DISPATCH_SYNC_INTERVAL_MS = Number(process.env.SCAN_DISPATCH_SYNC_INTERVAL_MS || 3000);
const API_STARTUP_TIMEOUT_MS = Number(process.env.SCHEDULER_API_STARTUP_TIMEOUT_MS || 120000);
const API_RETRY_DELAY_MS = Number(process.env.SCHEDULER_API_RETRY_DELAY_MS || 3000);
const SCAN_DISPATCH_CONCURRENCY = Number(process.env.SCAN_DISPATCH_CONCURRENCY || 2);
const SCAN_DISPATCH_RATE_LIMIT_MAX = Number(process.env.SCAN_DISPATCH_RATE_LIMIT_MAX || 4);
const SCAN_DISPATCH_RATE_LIMIT_DURATION_MS = Number(process.env.SCAN_DISPATCH_RATE_LIMIT_DURATION_MS || 60000);
const EMAIL_RATE_LIMIT_MAX = Number(process.env.EMAIL_RATE_LIMIT_MAX || 10);
const EMAIL_RATE_LIMIT_DURATION_MS = Number(process.env.EMAIL_RATE_LIMIT_DURATION_MS || 60000);
const EMAIL_CONCURRENCY = Number(process.env.EMAIL_CONCURRENCY || 1);

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "ScanAI <reports@scanai.local>";
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || SMTP_PORT === 465;

const connection = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
};

const scheduleQueue = new Queue(SCHEDULE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

const scanDispatchQueue = new Queue(SCAN_DISPATCH_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
});

const smtpTransport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER || SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  pool: true,
  maxConnections: Math.max(1, EMAIL_CONCURRENCY),
  maxMessages: Math.max(1, EMAIL_RATE_LIMIT_MAX),
});

function schedulerId(scheduleId) {
  return `${SCHEDULER_PREFIX}${scheduleId}`;
}

function emailJobId(notificationId) {
  return `${EMAIL_PREFIX}${notificationId}`;
}

function scanDispatchJobId(scanId) {
  return `${SCAN_DISPATCH_PREFIX}${scanId}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-scanai-scheduler-token": SCHEDULER_TOKEN,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status} ${path}: ${body}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function apiFetchRaw(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "x-scanai-scheduler-token": SCHEDULER_TOKEN,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status} ${path}: ${body}`);
  }

  return response;
}

async function fetchSchedules() {
  return apiFetch("/api/internal/schedules");
}

async function waitForApi() {
  const deadline = Date.now() + API_STARTUP_TIMEOUT_MS;
  let attempt = 0;
  let lastError = null;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      await apiFetch("/health");
      console.log(`[jobs] API ready at ${API_BASE_URL}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[jobs] waiting for API at ${API_BASE_URL} (attempt ${attempt}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(API_RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `API did not become ready within ${API_STARTUP_TIMEOUT_MS}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function syncSchedules() {
  const schedules = await fetchSchedules();
  const activeIds = new Set(schedules.map((schedule) => schedulerId(schedule.id)));

  const existingSchedulers = await scheduleQueue.getJobSchedulers(0, -1, true);
  await Promise.all(
    existingSchedulers
      .filter((item) => item.key?.startsWith(SCHEDULER_PREFIX) && !activeIds.has(item.key))
      .map((item) => scheduleQueue.removeJobScheduler(item.key))
  );

  await Promise.all(
    schedules.map((schedule) =>
      scheduleQueue.upsertJobScheduler(
        schedulerId(schedule.id),
        {
          pattern: schedule.cron,
          tz: schedule.timezone,
        },
        {
          name: "trigger-scheduled-scan",
          data: {
            scheduleId: schedule.id,
            url: schedule.url,
          },
        }
      )
    )
  );

  console.log(`[scheduler] synced ${schedules.length} active schedule(s)`);
}

async function syncPendingEmails() {
  const notifications = await apiFetch("/api/internal/email-notifications/pending?limit=50");

  await Promise.all(
    notifications.map(async (notification) => {
      await emailQueue.add(
        "send-scan-report-email",
        {
          notificationId: notification.id,
          scanId: notification.scan_id,
          url: notification.url,
          to: notification.recipient_email,
          subject: notification.subject,
        },
        { jobId: emailJobId(notification.id) }
      );
      await apiFetch(`/api/internal/email-notifications/${notification.id}/queued`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    })
  );

  if (notifications.length > 0) {
    console.log(`[email] queued ${notifications.length} pending notification(s)`);
  }
}

async function syncPendingScans() {
  const scans = await apiFetch("/api/internal/scans/pending?limit=100");

  await Promise.all(
    scans.map((scan) =>
      scanDispatchQueue.add(
        "dispatch-scan",
        {
          scanId: scan.id,
          url: scan.url,
        },
        { jobId: scanDispatchJobId(scan.id) }
      )
    )
  );

  if (scans.length > 0) {
    console.log(`[scan-dispatch] queued ${scans.length} pending scan(s)`);
  }
}

const scheduleWorker = new Worker(
  SCHEDULE_QUEUE_NAME,
  async (job) => {
    if (job.name !== "trigger-scheduled-scan") {
      throw new Error(`Unknown job name: ${job.name}`);
    }

    const scheduleId = job.data?.scheduleId;
    if (!scheduleId) {
      throw new Error("Scheduled scan job missing scheduleId");
    }

    const result = await apiFetch(`/api/internal/schedules/${scheduleId}/trigger`, {
      method: "POST",
      body: JSON.stringify({ source: "bullmq" }),
    });
    console.log(`[scheduler] ${scheduleId} ${result.status}: ${result.message}`);
    return result;
  },
  { connection, concurrency: 2 }
);

const scanDispatchWorker = new Worker(
  SCAN_DISPATCH_QUEUE_NAME,
  async (job) => {
    if (job.name !== "dispatch-scan") {
      throw new Error(`Unknown scan dispatch job name: ${job.name}`);
    }

    const scanId = job.data?.scanId;
    if (!scanId) {
      throw new Error("Scan dispatch job missing scanId");
    }

    const result = await apiFetch(`/api/internal/scans/${scanId}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ source: "bullmq" }),
    });
    console.log(`[scan-dispatch] ${scanId} ${result.status}: ${result.message}`);
    return result;
  },
  {
    connection,
    concurrency: SCAN_DISPATCH_CONCURRENCY,
    limiter: {
      max: SCAN_DISPATCH_RATE_LIMIT_MAX,
      duration: SCAN_DISPATCH_RATE_LIMIT_DURATION_MS,
    },
  }
);

function attachmentFilename(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function emailText(notification) {
  return [
    "Your ScanAI security scan has completed.",
    "",
    `Target: ${notification.url}`,
    "",
    "The generated PDF report is attached to this email.",
    "",
    "ScanAI",
  ].join("\n");
}

function emailHtml(notification) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#141413;line-height:1.6">
      <h2 style="margin:0 0 12px">Your ScanAI report is ready</h2>
      <p>The security scan for <strong>${escapeHtml(notification.url)}</strong> has completed.</p>
      <p>The generated PDF report is attached to this email.</p>
      <p style="color:#696969;font-size:13px">ScanAI</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchPdfAttachment(notification) {
  const response = await apiFetchRaw(`/api/internal/email-notifications/${notification.notificationId}/pdf`);
  const content = Buffer.from(await response.arrayBuffer());
  return {
    filename: attachmentFilename(response, `scanai-security-report-${notification.scanId}.pdf`),
    content,
    contentType: "application/pdf",
  };
}

const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job) => {
    if (job.name !== "send-scan-report-email") {
      throw new Error(`Unknown email job name: ${job.name}`);
    }

    const notification = job.data;
    try {
      const sending = await apiFetch(`/api/internal/email-notifications/${notification.notificationId}/sending`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (sending.status === "sent") {
        return sending;
      }
      if (!SMTP_HOST) {
        throw new Error("SMTP_HOST is not configured.");
      }

      const attachment = await fetchPdfAttachment(notification);
      await smtpTransport.sendMail({
        from: SMTP_FROM,
        to: notification.to,
        subject: notification.subject,
        text: emailText(notification),
        html: emailHtml(notification),
        attachments: [attachment],
      });

      const sent = await apiFetch(`/api/internal/email-notifications/${notification.notificationId}/sent`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      console.log(`[email] sent report ${notification.scanId} to ${notification.to}`);
      return sent;
    } catch (error) {
      await apiFetch(`/api/internal/email-notifications/${notification.notificationId}/failed`, {
        method: "POST",
        body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }).catch((markError) => console.error("[email] failed to mark notification failed", markError));
      throw error;
    }
  },
  {
    connection,
    concurrency: EMAIL_CONCURRENCY,
    limiter: {
      max: EMAIL_RATE_LIMIT_MAX,
      duration: EMAIL_RATE_LIMIT_DURATION_MS,
    },
  }
);

scheduleWorker.on("failed", (job, error) => {
  console.error(`[scheduler] job ${job?.id || "unknown"} failed`, error);
});

scanDispatchWorker.on("failed", (job, error) => {
  console.error(`[scan-dispatch] job ${job?.id || "unknown"} failed`, error);
});

emailWorker.on("failed", (job, error) => {
  console.error(`[email] job ${job?.id || "unknown"} failed`, error);
});

async function start() {
  await scheduleQueue.waitUntilReady();
  await emailQueue.waitUntilReady();
  await scanDispatchQueue.waitUntilReady();
  await scheduleWorker.waitUntilReady();
  await scanDispatchWorker.waitUntilReady();
  await emailWorker.waitUntilReady();

  await waitForApi();

  await syncPendingScans().catch((error) => console.error("[scan-dispatch] initial sync failed", error));
  await syncSchedules().catch((error) => console.error("[scheduler] initial sync failed", error));
  await syncPendingEmails().catch((error) => console.error("[email] initial sync failed", error));

  const scanDispatchTimer = setInterval(() => {
    syncPendingScans().catch((error) => console.error("[scan-dispatch] sync failed", error));
  }, SCAN_DISPATCH_SYNC_INTERVAL_MS);

  const scheduleTimer = setInterval(() => {
    syncSchedules().catch((error) => console.error("[scheduler] sync failed", error));
  }, SYNC_INTERVAL_MS);

  const emailTimer = setInterval(() => {
    syncPendingEmails().catch((error) => console.error("[email] sync failed", error));
  }, EMAIL_SYNC_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(scanDispatchTimer);
    clearInterval(scheduleTimer);
    clearInterval(emailTimer);
    await scheduleWorker.close();
    await scanDispatchWorker.close();
    await emailWorker.close();
    await scheduleQueue.close();
    await scanDispatchQueue.close();
    await emailQueue.close();
    smtpTransport.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[jobs] fatal startup failure", error);
  process.exit(1);
});
