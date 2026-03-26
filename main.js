const configRequest = fetch("./data/site-config.json").then((response) => response.json());
const portfolioRequest = fetch("./data/portfolio.json").then((response) => response.json());

const portfolioTemplate = document.querySelector("#portfolio-card-template");
const svcCardTemplate = document.querySelector("#svc-card-template");

const portfolioGrid = document.querySelector("#portfolio-grid");
const servicesGrid = document.querySelector("#services-grid");
const extrasList = document.querySelector("#extras-list");

const brandIntro = document.querySelector("#brand-intro");
const servicesSummary = document.querySelector("#services-summary");
const wechatValue = document.querySelector("#wechat-value");
const cityValue = document.querySelector("#city-value");
const contactNote = document.querySelector("#contact-note");

const paymentPanel = document.querySelector("#payment-panel");
const paymentImage = document.querySelector("#payment-image");
const paymentCopy = document.querySelector("#payment-copy");

const portfolioFallbackImage = "./assets/portfolio/look-01.svg";

const SVC_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' fill='%23f5ede4'/%3E%3Ccircle cx='48' cy='36' r='14' fill='%23d8bba4' opacity='0.5'/%3E%3Cellipse cx='48' cy='70' rx='21' ry='13' fill='%23d8bba4' opacity='0.38'/%3E%3C/svg%3E";

function setSafeImage(image, src, alt) {
  image.src = src;
  image.alt = alt;
  image.onerror = () => {
    image.onerror = null;
    image.src = portfolioFallbackImage;
  };
}

function renderIntro(config) {
  if (brandIntro) brandIntro.textContent = config.brand.intro;
  if (servicesSummary) servicesSummary.textContent = config.servicesSummary;
  if (wechatValue) wechatValue.textContent = config.contact.wechat;
  if (cityValue) cityValue.textContent = config.contact.city;
  if (contactNote) contactNote.textContent = config.contact.note;

  if (config.paymentQrImage && paymentPanel) {
    paymentPanel.hidden = false;
    if (paymentImage) {
      paymentImage.src = config.paymentQrImage;
      paymentImage.alt = `${config.brand.name}收款码`;
    }
    if (paymentCopy) paymentCopy.textContent = config.paymentQrCopy;
  }
}

function renderPortfolio(items) {
  if (!portfolioGrid || !portfolioTemplate) return;
  portfolioGrid.innerHTML = "";

  items.forEach((item) => {
    const card = portfolioTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    setSafeImage(image, item.image, item.title);
    card.querySelector("h3").textContent = item.title;
    card.querySelector("p").textContent = item.description;
    portfolioGrid.appendChild(card);
  });
}

function renderServices(services) {
  if (!servicesGrid || !svcCardTemplate) return;
  servicesGrid.innerHTML = "";

  services.forEach((service) => {
    const card = svcCardTemplate.content.firstElementChild.cloneNode(true);
    const imgEl = card.querySelector(".svc-card__img");
    const svcSlug = (service.tag || "").toLowerCase().replace(/[^a-z0-9]/g, "-");
    imgEl.alt = service.title;
    imgEl.src = service.image || `./assets/services/${svcSlug}.jpg`;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = SVC_PLACEHOLDER;
    };

    card.querySelector(".svc-card__tag").textContent = service.tag;
    card.querySelector(".svc-card__duration").textContent = service.duration || "";
    card.querySelector(".svc-card__title").textContent = service.title;
    card.querySelector(".svc-card__scene").textContent = service.description;

    const badgeEl = card.querySelector(".svc-card__badge");
    if (badgeEl && service.badge) {
      badgeEl.textContent = service.badge;
      badgeEl.hidden = false;
    }

    const priceEl = card.querySelector(".svc-card__price");
    const priceMatch = service.price.match(/^(\d[\d,]*)\s*(元)(.*)?$/);
    if (priceMatch) {
      priceEl.innerHTML =
        `<span class="svc-card__price-num">${priceMatch[1]}</span>` +
        `<span class="svc-card__price-unit"> ${priceMatch[2]}</span>` +
        (priceMatch[3] ? `<span class="svc-card__price-suffix">${priceMatch[3]}</span>` : "");
    } else {
      priceEl.textContent = service.price;
    }

    const link = card.querySelector("[data-service-pick]");
    link.href = `./makeup-booking?service=${encodeURIComponent(service.fullLine || service.title)}`;
    servicesGrid.appendChild(card);
  });
}

function renderExtras(items) {
  if (!extrasList) return;
  extrasList.innerHTML = "";
  items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    extrasList.appendChild(listItem);
  });
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
    qrEl.onerror = () => {
      qrEl.hidden = true;
    };
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

async function init() {
  const [config, portfolioItems] = await Promise.all([configRequest, portfolioRequest]);

  renderIntro(config);
  renderServices(config.services);
  renderExtras(config.extras || []);
  renderPortfolio(portfolioItems);

  setupWechatModal();
  document.querySelectorAll("[data-wechat-copy]").forEach((button) => {
    button.addEventListener("click", () => openWechatModal(config));
  });
}

init().catch(console.error);
