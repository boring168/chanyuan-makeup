const REQUIRED_FIELDS = [
  "name",
  "contact",
  "service",
  "date",
  "timeSlot",
  "duration",
  "location",
];

// ── 基础限流（内存级，适合单实例轻量防护）────────────────────────────────
const postRateLimit = new Map();
const POST_LIMIT = 5;          // 每 IP 最多 5 次
const POST_WINDOW = 10 * 60 * 1000; // 10 分钟窗口

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function checkPostRateLimit(ip) {
  const now = Date.now();
  // 顺手清理过期条目，防止 Map 无限增长
  for (const [key, val] of postRateLimit) {
    if (now > val.resetAt) postRateLimit.delete(key);
  }
  const entry = postRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    postRateLimit.set(ip, { count: 1, resetAt: now + POST_WINDOW });
    return true;
  }
  if (entry.count >= POST_LIMIT) return false;
  entry.count++;
  return true;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getEnv() {
  return {
    supabaseUrl: String(process.env.SUPABASE_URL || "").trim(),
    supabaseKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
    notifyEmail: String(process.env.BOOKING_NOTIFY_EMAIL || "").trim(),
    fromEmail: String(process.env.BOOKING_FROM_EMAIL || "").trim(),
    adminKey: String(process.env.BOOKINGS_ADMIN_KEY || "").trim(),
  };
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token).split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function resolveSupabaseKeyMode(key) {
  if (!key) {
    return { type: "missing", elevated: false };
  }

  if (key.startsWith("sb_secret_")) {
    return { type: "secret", elevated: true };
  }

  if (key.startsWith("sb_publishable_")) {
    return { type: "publishable", elevated: false };
  }

  const parts = key.split(".");
  if (parts.length === 3) {
    const payload = decodeJwtPayload(key);
    const role = payload?.role;

    if (role === "service_role") {
      return { type: "service_role_jwt", elevated: true };
    }

    if (role === "anon") {
      return { type: "anon_jwt", elevated: false };
    }

    return { type: "jwt", elevated: false, role };
  }

  return { type: "unknown", elevated: false };
}

function createSupabaseHeaders(key, extraHeaders = {}) {
  const keyMode = resolveSupabaseKeyMode(key);

  if (keyMode.type === "publishable" || keyMode.type === "anon_jwt") {
    throw new Error(
      "当前 SUPABASE_SERVICE_ROLE_KEY 配置成了公开 key，请在 Vercel 改成 service_role 或 secret key。"
    );
  }

  if (keyMode.type === "missing") {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY。");
  }

  const headers = {
    apikey: key,
    ...extraHeaders,
  };

  // Legacy service_role JWT 需要继续作为 Bearer 发送；新版 secret key 只走 apikey 即可。
  if (keyMode.type === "service_role_jwt" || keyMode.type === "jwt") {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        const key = part.slice(0, index);
        const value = decodeURIComponent(part.slice(index + 1));
        return [key, value];
      })
  );
}

async function parseBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body || {};
}

function validateBooking(payload) {
  for (const field of REQUIRED_FIELDS) {
    if (!payload[field] || !String(payload[field]).trim()) {
      throw new Error(`缺少必要字段：${field}`);
    }
  }
}

async function insertBooking(env, booking) {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/bookings`, {
    method: "POST",
    headers: createSupabaseHeaders(env.supabaseKey, {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify([booking]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`预约记录写入失败：${text}`);
  }

  const data = await response.json();
  return data[0];
}

async function fetchBookings(env) {
  const response = await fetch(
    `${env.supabaseUrl}/rest/v1/bookings?select=id,name,contact,service,date,time_slot,duration,location,notes,created_at&order=created_at.desc`,
    {
      headers: createSupabaseHeaders(env.supabaseKey),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`预约记录读取失败：${text}`);
  }

  return response.json();
}

async function notifyByEmail(env, booking, recordId) {
  if (!env.resendApiKey || !env.notifyEmail || !env.fromEmail) {
    return { sent: false };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #2e2525;">
      <h2>新的预约需求</h2>
      <p><strong>记录 ID：</strong>${escapeHtml(recordId)}</p>
      <p><strong>称呼：</strong>${escapeHtml(booking.name)}</p>
      <p><strong>联系方式：</strong>${escapeHtml(booking.contact)}</p>
      <p><strong>服务类型：</strong>${escapeHtml(booking.service)}</p>
      <p><strong>预约日期：</strong>${escapeHtml(booking.date)}</p>
      <p><strong>时间段：</strong>${escapeHtml(booking.time_slot)}</p>
      <p><strong>预计服务时长：</strong>${escapeHtml(booking.duration)}</p>
      <p><strong>区域 / 地址：</strong>${escapeHtml(booking.location)}</p>
      <p><strong>备注需求：</strong>${escapeHtml(booking.notes || "无")}</p>
      <p><strong>提交时间：</strong>${escapeHtml(booking.created_at)}</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.fromEmail,
      to: [env.notifyEmail],
      subject: `新预约需求 | ${booking.service} | ${booking.date}`,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`邮件通知发送失败：${text}`);
  }

  return { sent: true };
}

module.exports = async function handler(req, res) {
  const env = getEnv();

  try {
    if (req.method === "POST") {
      if (!env.supabaseUrl || !env.supabaseKey) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({
          error: "预约服务尚未完成配置，请先设置 Supabase 环境变量。",
        });
      }

      const clientIp = getClientIp(req);
      if (!checkPostRateLimit(clientIp)) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(429).json({ error: "提交过于频繁，请稍后再试。" });
      }

      const payload = await parseBody(req);
      validateBooking(payload);

      const booking = {
        name: String(payload.name).trim(),
        contact: String(payload.contact).trim(),
        service: String(payload.service).trim(),
        date: String(payload.date).trim(),
        time_slot: String(payload.timeSlot).trim(),
        duration: String(payload.duration).trim(),
        location: String(payload.location).trim(),
        notes: String(payload.notes || "").trim(),
        created_at: new Date().toISOString(),
      };

      const record = await insertBooking(env, booking);

      let emailSent = false;

      try {
        const emailResult = await notifyByEmail(env, booking, record.id || "");
        emailSent = emailResult.sent;
      } catch (emailError) {
        console.error(emailError);
      }

      return res.status(200).json({
        ok: true,
        bookingId: record.id,
        emailSent,
      });
    }

    if (req.method === "GET") {
      if (!env.supabaseUrl || !env.supabaseKey || !env.adminKey) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({
          error: "查看预约记录尚未完成配置，请先设置环境变量。",
        });
      }

      const cookies = parseCookies(req.headers.cookie || "");
      const headerKey = req.headers["x-admin-key"];
      const sessionKey = cookies.bookings_admin_session;

      if (headerKey !== env.adminKey && sessionKey !== env.adminKey) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(401).json({ error: "未授权访问预约记录。" });
      }

      const records = await fetchBookings(env);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, records });
    }

    if (req.method === "DELETE") {
      if (!env.supabaseUrl || !env.supabaseKey || !env.adminKey) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({ error: "服务器环境变量缺失。" });
      }

      const cookies = parseCookies(req.headers.cookie || "");
      const headerKey = req.headers["x-admin-key"];
      const sessionKey = cookies.bookings_admin_session;

      if (headerKey !== env.adminKey && sessionKey !== env.adminKey) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(401).json({ error: "未授权访问。" });
      }

      const targetId = req.query?.id || "";

      const deleteUrl = targetId
        ? `${env.supabaseUrl}/rest/v1/bookings?id=eq.${encodeURIComponent(targetId)}`
        : `${env.supabaseUrl}/rest/v1/bookings?id=not.is.null`;

      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: createSupabaseHeaders(env.supabaseKey, {
          Prefer: "return=representation",
        }),
      });

      if (!deleteResponse.ok) {
        const text = await deleteResponse.text();
        throw new Error(`删除失败：${text}`);
      }

      const deleted = await deleteResponse.json();
      if (targetId) {
        console.log(`[admin] 删除单条预约记录 id=${targetId}`);
      } else {
        console.log(`[admin] 清空预约记录，共删除 ${deleted.length} 条`);
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, deletedCount: deleted.length });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "服务器异常" });
  }
};
