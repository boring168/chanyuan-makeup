const recordsGateStatus = document.querySelector("#records-gate-status");
const recordsApp = document.querySelector("#records-app");
const loadButton = document.querySelector("#load-bookings-button");
const clearButton = document.querySelector("#clear-bookings-button");
const adminStatus = document.querySelector("#admin-status");
const bookingsBody = document.querySelector("#admin-bookings-body");
const logoutButton = document.querySelector("#logout-button");

let currentRecords = [];

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createCell(content) {
  const cell = document.createElement("td");
  cell.textContent = content || "";
  return cell;
}

function renderRows(records) {
  currentRecords = records;
  bookingsBody.innerHTML = "";

  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.textContent = "暂无预约记录";
    row.appendChild(cell);
    bookingsBody.appendChild(row);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement("tr");
    row.dataset.id = record.id;
    row.appendChild(createCell(formatDateTime(record.created_at)));
    row.appendChild(createCell(record.name));
    row.appendChild(createCell(record.contact));
    row.appendChild(createCell(record.service));
    row.appendChild(createCell(record.date));
    row.appendChild(createCell(record.time_slot));
    row.appendChild(createCell(record.duration));
    row.appendChild(createCell(record.location));
    row.appendChild(createCell(record.notes));

    const actionCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "button button--danger button--sm";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => deleteRecord(record.id, row));
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

    bookingsBody.appendChild(row);
  });
}

async function ensureSession() {
  const response = await fetch("/api/admin-session", {
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.authenticated) {
    window.location.href = "./records-login";
    return false;
  }

  recordsGateStatus.textContent = "权限校验成功，正在加载预约记录。";
  recordsApp.hidden = false;
  return true;
}

async function loadRecords() {
  adminStatus.textContent = "正在加载预约记录...";
  adminStatus.dataset.state = "loading";

  try {
    const response = await fetch("/api/bookings", {
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.href = "./records-login";
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "加载失败");
    }

    renderRows(result.records || []);
    adminStatus.textContent = "预约记录已更新。";
    adminStatus.dataset.state = "success";
  } catch (error) {
    adminStatus.textContent = error.message;
    adminStatus.dataset.state = "error";
  }
}

async function logout() {
  await fetch("/api/admin-session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  window.location.href = "./records-login";
}

async function clearRecords() {
  const count = currentRecords.length;

  if (count === 0) {
    adminStatus.textContent = "当前没有可删除记录。";
    adminStatus.dataset.state = "";
    return;
  }

  const confirmed = window.confirm(
    `确认删除当前所有预约记录？\n共 ${count} 条，删除后不可恢复。`
  );
  if (!confirmed) return;

  adminStatus.textContent = "正在删除...";
  adminStatus.dataset.state = "loading";

  try {
    const response = await fetch("/api/bookings", {
      method: "DELETE",
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.href = "./records-login";
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "删除失败");
    }

    adminStatus.textContent =
      result.deletedCount === 0
        ? "当前没有可删除记录。"
        : `删除成功，已删除 ${result.deletedCount} 条记录。`;
    adminStatus.dataset.state = "success";
    await loadRecords();
  } catch (error) {
    adminStatus.textContent = `删除失败：${error.message}`;
    adminStatus.dataset.state = "error";
  }
}

async function deleteRecord(id, row) {
  const confirmed = window.confirm("删除后不可恢复，是否继续？");
  if (!confirmed) return;

  adminStatus.textContent = "正在删除...";
  adminStatus.dataset.state = "loading";

  try {
    const response = await fetch(`/api/bookings?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.href = "./records-login";
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "删除失败");
    }

    row.remove();
    currentRecords = currentRecords.filter((r) => r.id !== id);
    adminStatus.textContent = "已删除该条记录。";
    adminStatus.dataset.state = "success";

    if (currentRecords.length === 0) {
      renderRows([]);
    }
  } catch (error) {
    adminStatus.textContent = `删除失败：${error.message}`;
    adminStatus.dataset.state = "error";
  }
}

loadButton.addEventListener("click", loadRecords);
clearButton.addEventListener("click", clearRecords);
logoutButton.addEventListener("click", logout);

(async () => {
  try {
    const allowed = await ensureSession();
    if (allowed) {
      await loadRecords();
    }
  } catch (error) {
    console.error(error);
    window.location.href = "./records-login";
  }
})();
