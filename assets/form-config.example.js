/*!
 * 线索投递配置（示例）
 * 复制为 assets/form-config.js 后生效；form-config.js 已在 .gitignore 中，不入库。
 * 浏览器端配置不要放任何密钥，密钥放在 webhook 对应的后端。
 */
window.DSG_FORM_CONFIG = {
  // local-queue | webhook | email | wechat-work
  channel: "local-queue",
  // 仅当 channel=webhook 时生效
  webhookUrl: "",
  webhookHeaders: {},
  // 与 privacy.html 中声明的版本保持一致
  policyVersion: "2026-09-01"
};
