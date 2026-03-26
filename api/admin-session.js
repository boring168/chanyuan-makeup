function getAdminKey() {
  return process.env.BOOKINGS_ADMIN_KEY;
}

// ── 登录暴力破解防护 ─────────────────────────────────────────────────────
const loginRateLimit = new Map();
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 分钟内最多 10 次尝试

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  for (const [key, val] of loginRateLimit) {
    if (now > val.resetAt) loginRateLimit.delete(key);
  }
  const entry = loginRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    loginRateLimit.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
    return true;
  }
  if (entry.count >= LOGIN_LIMIT) return false;
  entry.count++;
  return true;
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

function buildCookie(value, maxAge) {
  const parts = [
    `bookings_admin_session=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    "Secure",
  ];

  return parts.join("; ");
}

module.exports = async function handler(req, res) {
  const adminKey = getAdminKey();

  if (!adminKey) {
    return res.status(500).json({ error: "后台访问密钥尚未配置。" });
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const isAuthenticated = cookies.bookings_admin_session === adminKey;

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, authenticated: isAuthenticated });
  }

  if (req.method === "POST") {
    const clientIp = getClientIp(req);
    if (!checkLoginRateLimit(clientIp)) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(429).json({ error: "尝试次数过多，请稍后再试。" });
    }

    const payload =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const submittedKey = String(payload.key || "").trim();

    if (!submittedKey || submittedKey !== adminKey) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ error: "管理密钥不正确。" });
    }

    res.setHeader("Set-Cookie", buildCookie(adminKey, 60 * 60 * 24 * 7));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", buildCookie("", 0));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
};
