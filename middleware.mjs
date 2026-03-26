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

export const config = {
  matcher: ["/bookings", "/records-login"],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const adminKey = process.env.BOOKINGS_ADMIN_KEY;

  if (!adminKey) {
    return;
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const hasSession = cookies.bookings_admin_session === adminKey;

  if (url.pathname === "/bookings" && !hasSession) {
    return Response.redirect(new URL("/records-login", request.url));
  }

  if (url.pathname === "/records-login" && hasSession) {
    return Response.redirect(new URL("/bookings", request.url));
  }
}
