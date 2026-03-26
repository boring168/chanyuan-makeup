import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "data", "site-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BOOKINGS_ADMIN_KEY",
];

const optionalEnv = [
  "RESEND_API_KEY",
  "BOOKING_NOTIFY_EMAIL",
  "BOOKING_FROM_EMAIL",
];

const checks = [];
const warnings = [];
const optionalNotes = [];

function ok(message) {
  checks.push(`OK   ${message}`);
}

function warn(message) {
  warnings.push(`MISS ${message}`);
}

if (config.brand?.name === "婵媛造型") {
  ok("品牌名已是 婵媛造型");
} else {
  warn("品牌名不是 婵媛造型，请检查 data/site-config.json");
}

if (config.contact?.wechat === "StillinLoveWithYouH") {
  ok("微信号已配置为 StillinLoveWithYouH");
} else if (config.contact?.wechat) {
  ok(`微信号已配置：${config.contact.wechat}`);
} else {
  warn("微信号为空，请检查 data/site-config.json");
}

if (config.paymentQrImage) {
  const paymentPath = path.join(root, config.paymentQrImage.replace(/^\.\//, ""));
  if (fs.existsSync(paymentPath)) {
    ok(`收款码图片存在：${config.paymentQrImage}`);
  } else {
    warn(`paymentQrImage 已填写但文件不存在：${config.paymentQrImage}`);
  }
} else {
  warn("paymentQrImage 还未填写，收款码不会显示");
}

const portfolioConfigPath = path.join(root, "data", "portfolio.json");
const portfolio = JSON.parse(fs.readFileSync(portfolioConfigPath, "utf8"));

for (const item of portfolio) {
  const imagePath = path.join(root, item.image.replace(/^\.\//, ""));
  if (fs.existsSync(imagePath)) {
    ok(`作品图存在：${item.title}`);
  } else {
    warn(`作品图缺失：${item.title} -> ${item.image}`);
  }
}

for (const key of requiredEnv) {
  if (process.env[key]) {
    ok(`环境变量已提供：${key}`);
  } else {
    warn(`环境变量缺失：${key}`);
  }
}

for (const key of optionalEnv) {
  if (process.env[key]) {
    ok(`可选环境变量已提供：${key}`);
  } else {
    optionalNotes.push(`OPT  可选环境变量未提供：${key}`);
  }
}

console.log("婵媛造型上线前自检");
console.log("==================");

for (const line of checks) {
  console.log(line);
}

for (const line of warnings) {
  console.log(line);
}

for (const line of optionalNotes) {
  console.log(line);
}

if (warnings.length) {
  console.log("\n结果：还有未完成配置，暂时不能确认完整上线。");
  process.exitCode = 1;
} else {
  console.log("\n结果：基础配置已齐，可继续部署并做真实提交流程测试。");
}
