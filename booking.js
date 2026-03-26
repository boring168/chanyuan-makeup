const configRequest = fetch("./data/site-config.json").then((response) => response.json());

const bookingForm = document.querySelector("#booking-form");
const serviceSelect = document.querySelector("#service-select");
const servicePicks = document.querySelector("#service-picks");
const dateInput = document.querySelector("#date-input");
const bookingHint = document.querySelector("#booking-hint");
const bookingStatus = document.querySelector("#booking-status");
const wechatValue = document.querySelector("#wechat-value");
const contactNote = document.querySelector("#contact-note");
const paymentPanel = document.querySelector("#payment-panel");
const paymentImage = document.querySelector("#payment-image");
const paymentCopy = document.querySelector("#payment-copy");
const scrollToFormButton = document.querySelector("#scroll-to-form-button");

const bookingDraftStorageKey = "chanyuan-booking-draft-v3";

let _wechatValue = "";

function setMinBookingDate() {
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 90); // 最多提前 90 天预约

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  dateInput.min = formatDate(today);
  dateInput.max = formatDate(maxDate);
}

function setSelectedPick(value) {
  servicePicks.querySelectorAll("button").forEach((button) => {
    button.dataset.selected = button.dataset.value === value ? "true" : "false";
  });
}

function renderServices(services) {
  serviceSelect.innerHTML = '<option value="">请选择服务类型</option>';
  servicePicks.innerHTML = "";

  services.forEach((service) => {
    const serviceValue = service.fullLine || service.title;
    const option = document.createElement("option");
    option.value = serviceValue;
    option.textContent = serviceValue;
    serviceSelect.appendChild(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-pick";
    button.dataset.value = serviceValue;
    button.innerHTML = `
      <span class="service-pick__tag">${service.tag}</span>
      <strong>${service.title}</strong>
      <span>${service.fullLine || service.description}</span>
    `;
    button.addEventListener("click", () => {
      serviceSelect.value = serviceValue;
      setSelectedPick(serviceValue);
      updateServiceBanner(serviceValue);
      persistDraft();
      bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    servicePicks.appendChild(button);
  });
}

function hydrateDraft() {
  const saved = localStorage.getItem(bookingDraftStorageKey);
  if (!saved) {
    return;
  }

  const values = JSON.parse(saved);
  Object.entries(values).forEach(([key, value]) => {
    const field = bookingForm.elements.namedItem(key);
    if (field && typeof value === "string") {
      field.value = value;
    }
  });
}

function applyServiceFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const service = params.get("service");
  const hasMatchingOption = Array.from(serviceSelect.options).some((option) => option.value === service);
  if (service && hasMatchingOption) {
    serviceSelect.value = service;
  }
}

function persistDraft() {
  const values = Object.fromEntries(new FormData(bookingForm).entries());
  localStorage.setItem(bookingDraftStorageKey, JSON.stringify(values));
}

function clearDraft() {
  localStorage.removeItem(bookingDraftStorageKey);
}

function openWechatModal(config) {
  const modal = document.querySelector("#wechat-modal");
  if (!modal) return;

  const idEl = document.querySelector("#wechat-modal-id");
  const qrEl = document.querySelector("#wechat-modal-qr");
  const copyBtn = document.querySelector("#wechat-modal-copy");
  const statusEl = document.querySelector("#wechat-modal-copy-status");

  if (idEl) idEl.textContent = config.contact.wechat;
  if (qrEl && config.wechatQrImage) {
    qrEl.hidden = false;
    qrEl.src = config.wechatQrImage;
    qrEl.onerror = () => { qrEl.hidden = true; };
  }
  if (statusEl) statusEl.textContent = "";
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(config.contact.wechat);
        if (statusEl) statusEl.textContent = "已复制微信号 ✓";
      } catch {
        if (statusEl) statusEl.textContent = `微信号：${config.contact.wechat}`;
      }
    };
  }
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function setupWechatModal() {
  const modal = document.querySelector("#wechat-modal");
  if (!modal) return;
  const overlay = modal.querySelector(".wechat-modal__overlay");
  const closeBtn = modal.querySelector(".wechat-modal__close");
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };
  overlay?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

function openSuccessModal(bookingId) {
  const modal = document.querySelector("#success-modal");
  if (!modal) return;
  const idEl = document.querySelector("#success-modal-id");
  if (idEl) {
    idEl.textContent = bookingId ? `记录编号：${bookingId}` : "";
  }
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function setupSuccessModal(config) {
  const modal = document.querySelector("#success-modal");
  if (!modal) return;

  const overlay = modal.querySelector(".success-modal__overlay");
  const closeBtn = modal.querySelector(".success-modal__close");
  const wechatBtn = document.querySelector("#success-modal-wechat");
  const copyBtn = document.querySelector("#success-modal-copy-wechat");
  const copyStatus = document.querySelector("#success-modal-copy-status");

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };

  overlay?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });

  wechatBtn?.addEventListener("click", () => {
    close();
    openWechatModal(config);
  });

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(_wechatValue);
      if (copyStatus) copyStatus.textContent = "微信号已复制 ✓";
    } catch {
      if (copyStatus) copyStatus.textContent = `微信号：${_wechatValue}`;
    }
  });
}

function updateServiceBanner(value) {
  const banner = document.querySelector("#booking-service-banner");
  const nameEl = document.querySelector("#booking-service-name");
  if (!banner || !nameEl) return;
  if (value) {
    nameEl.textContent = value;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

async function submitBooking(formData) {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(formData.entries())),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "预约提交失败，请稍后再试。");
  }

  return result;
}

function validateBookingForm(formData) {
  const data = Object.fromEntries(formData.entries());
  
  // 验证必填字段
  if (!data.name || !data.name.trim()) {
    throw new Error("请输入你的称呼");
  }
  if (data.name.trim().length > 50) {
    throw new Error("称呼长度不能超过 50 字");
  }

  if (!data.contact || !data.contact.trim()) {
    throw new Error("请输入联系方式（微信或电话）");
  }
  // 基本验证：至少包含数字或中文
  const contactRegex = /^[\d\w\u4e00-\u9fff\-()（）\s]+$/u;
  if (!contactRegex.test(data.contact.trim())) {
    throw new Error("联系方式格式不正确");
  }
  if (data.contact.trim().length > 50) {
    throw new Error("联系方式长度不能超过 50 字");
  }

  if (!data.service || !data.service.trim()) {
    throw new Error("请选择服务类型");
  }

  if (!data.date || !data.date.trim()) {
    throw new Error("请选择预约日期");
  }
  // 再次验证日期范围
  const selectedDate = new Date(data.date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 90);
  
  if (selectedDate < today) {
    throw new Error("预约日期不能早于今天");
  }
  if (selectedDate > maxDate) {
    throw new Error("最多只能提前 90 天预约");
  }

  if (!data.timeSlot || !data.timeSlot.trim()) {
    throw new Error("请选择时间段");
  }

  if (!data.duration || !data.duration.trim()) {
    throw new Error("请选择预计服务时长");
  }

  if (!data.location || !data.location.trim()) {
    throw new Error("请输入区域 / 地址");
  }
  if (data.location.trim().length > 100) {
    throw new Error("地址长度不能超过 100 字");
  }

  if (data.notes && data.notes.trim().length > 300) {
    throw new Error("备注长度不能超过 300 字");
  }

  return true;
}

function getBookingSummary(formData) {
  const data = Object.fromEntries(formData.entries());
  return `
亲爱的 ${data.name}，

请确认你的预约信息：

服务类型：${data.service}
预约日期：${data.date}
时间段：${data.timeSlot}
预计时长：${data.duration}
预约区域：${data.location}
${data.notes ? `特殊需求：${data.notes}` : ""}

联系方式：${data.contact}

确认无误后，我们将尽快与你联系沟通最终细节。`;
}

async function init() {
  const config = await configRequest;

  renderServices(config.services);
  setMinBookingDate();
  hydrateDraft();
  applyServiceFromQuery();
  setSelectedPick(serviceSelect.value);
  updateServiceBanner(serviceSelect.value);

  _wechatValue = config.contact.wechat;
  wechatValue.textContent = config.contact.wechat;
  contactNote.textContent = config.contact.note;

  if (config.paymentQrImage) {
    paymentPanel.hidden = false;
    paymentImage.src = config.paymentQrImage;
    paymentImage.alt = `${config.brand.name}收款码`;
    paymentCopy.textContent = config.paymentQrCopy;
  }

  bookingForm.addEventListener("input", () => {
    persistDraft();
    setSelectedPick(serviceSelect.value);
  });

  serviceSelect.addEventListener("change", () => {
    setSelectedPick(serviceSelect.value);
    updateServiceBanner(serviceSelect.value);
    persistDraft();
  });

  setupWechatModal();
  setupSuccessModal(config);
  document.querySelectorAll("[data-wechat-copy]").forEach((button) => {
    button.addEventListener("click", () => openWechatModal(config));
  });

  scrollToFormButton?.addEventListener("click", () => {
    bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = bookingForm.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    bookingStatus.textContent = "正在验证表单...";
    bookingStatus.dataset.state = "loading";

    try {
      const formData = new FormData(bookingForm);
      
      // 前端表单验证
      validateBookingForm(formData);

      // 显示确认对话框
      const summary = getBookingSummary(formData);
      const confirmed = window.confirm(summary + "\n\n是否确认提交预约？");
      if (!confirmed) {
        bookingStatus.textContent = "已取消预约提交";
        bookingStatus.dataset.state = "";
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      bookingStatus.textContent = "正在提交预约...";
      const result = await submitBooking(formData);
      clearDraft();
      bookingForm.reset();
      setMinBookingDate();
      setSelectedPick("");
      bookingStatus.dataset.state = "";
      bookingStatus.textContent = "";
      if (submitBtn) submitBtn.disabled = false;
      openSuccessModal(result.bookingId || "");
    } catch (error) {
      bookingStatus.dataset.state = "error";
      bookingStatus.textContent = error.message;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

init().catch((error) => {
  console.error(error);
  bookingStatus.dataset.state = "error";
  bookingStatus.textContent = "预约页加载失败，请稍后刷新重试。";
});
