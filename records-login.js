const form = document.querySelector("#records-login-form");
const statusText = document.querySelector("#login-status");

async function checkExistingSession() {
  const response = await fetch("/api/admin-session", {
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));

  if (response.ok && result.authenticated) {
    window.location.href = "./bookings";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const key = String(formData.get("key") || "").trim();

  if (!key) {
    statusText.textContent = "请先输入管理密钥。";
    statusText.dataset.state = "error";
    return;
  }

  statusText.textContent = "正在验证...";
  statusText.dataset.state = "loading";

  try {
    const response = await fetch("/api/admin-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ key }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "验证失败");
    }

    window.location.href = "./bookings";
  } catch (error) {
    statusText.textContent = error.message;
    statusText.dataset.state = "error";
  }
});

checkExistingSession().catch((error) => {
  console.error(error);
});
