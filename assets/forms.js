/*!
 * DSG 表单（线索 Lead）处理层
 * ---------------------------------------------------------------
 * 需求方向要求表单后台具备四件事：验证、防垃圾、保存、通知。
 * 本文件实现这四件事，并把"通知"抽象成可插拔 adapter，
 * 后续接入企微 / CRM / 邮件 / 自建 API 时只改配置，不改页面。
 *
 * 安全约定：
 * - 密钥、Webhook 地址只放在 form-config.js（该文件默认不入库，见 .env.example）
 * - 线索属于受限数据，仅写入本地队列 / 后端接口，绝不在前端日志打印
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "dsg-lead-queue-v1";
  var RATE_KEY = "dsg-lead-rate-v1";
  var MIN_FILL_MS = 2000;          // 填写耗时低于该值判定为机器人
  var MAX_PER_HOUR = 5;            // 同一浏览器每小时最多提交次数

  var config = global.DSG_FORM_CONFIG || {};
  var policyVersion = config.policyVersion || "2026-09-01";

  // ------------------------------------------------------------ 工具

  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId() {
    var d = new Date();
    var stamp = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("");
    return "LEAD-" + stamp + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ------------------------------------------------------------ 验证

  var PHONE_RE = /^1[3-9]\d{9}$|^[0-9+\-() ]{6,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(values) {
    var errors = {};
    if (!values.name || values.name.trim().length < 2) errors.name = "请填写真实姓名（至少 2 个字）";
    if (!values.company || values.company.trim().length < 2) errors.company = "请填写公司名称";
    if (!values.phone || !PHONE_RE.test(values.phone.trim())) errors.phone = "请填写有效的联系电话";
    if (!values.email || !EMAIL_RE.test(values.email.trim())) errors.email = "请填写有效的邮箱";
    if (values.interest && values.interest.length > 200) errors.interest = "内容过长";
    if (!values.consent) errors.consent = "请先阅读并同意隐私条款";
    return errors;
  }

  // ------------------------------------------------------------ 防垃圾

  function spamCheck(values) {
    if (values.website) return "honeypot";                     // 隐藏字段被填写
    var startedAt = Number(values.formStartedAt || 0);
    if (startedAt && Date.now() - startedAt < MIN_FILL_MS) return "too-fast";

    var stamps = readJson(RATE_KEY, []).filter(function (t) {
      return Date.now() - t < 3600000;
    });
    if (stamps.length >= MAX_PER_HOUR) return "rate-limit";
    stamps.push(Date.now());
    writeJson(RATE_KEY, stamps);
    return null;
  }

  // ------------------------------------------------------------ 保存

  function buildLead(values, eventId) {
    return {
      id: makeId(),
      type: values.interest || "报名参会",
      name: values.name.trim(),
      company: values.company.trim(),
      jobTitle: values.jobTitle ? values.jobTitle.trim() : null,
      phone: values.phone.trim(),
      email: values.email.trim(),
      eventId: eventId || null,
      source: global.location.pathname.split("/").pop() || "unknown",
      message: values.message ? values.message.trim() : null,
      consent: {
        granted: Boolean(values.consent),
        at: nowIso(),
        policyVersion: policyVersion
      },
      owner: null,
      status: "new",
      createdAt: nowIso(),
      accessLevel: "restricted"
    };
  }

  function enqueue(lead) {
    var queue = readJson(STORAGE_KEY, []);
    queue.push(lead);
    writeJson(STORAGE_KEY, queue);
    return queue.length;
  }

  function queue() {
    return readJson(STORAGE_KEY, []);
  }

  function clearQueue() {
    writeJson(STORAGE_KEY, []);
  }

  function exportQueue() {
    // 受限数据：仅允许有权限的人在后台操作，导出为 CSV 后需按公司数据规范处理
    var rows = [["id", "createdAt", "type", "name", "company", "jobTitle", "phone", "email", "eventId", "source", "status"]];
    queue().forEach(function (lead) {
      rows.push([
        lead.id, lead.createdAt, lead.type, lead.name, lead.company,
        lead.jobTitle || "", lead.phone, lead.email, lead.eventId || "", lead.source, lead.status
      ]);
    });
    return rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? "" : cell).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
  }

  // ------------------------------------------------------------ 通知（可插拔）

  var adapters = {
    // 本地队列：默认通道，保证任何环境下线索都不丢
    "local-queue": function (lead) {
      enqueue(lead);
      return Promise.resolve({ ok: true, channel: "local-queue" });
    },
    // 自建 / 第三方 Webhook（企微机器人、表单服务、Serverless 函数等）
    webhook: function (lead) {
      if (!config.webhookUrl) {
        enqueue(lead);
        return Promise.resolve({ ok: false, channel: "local-queue", reason: "未配置 webhookUrl，已降级到本地队列" });
      }
      return global.fetch(config.webhookUrl, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, config.webhookHeaders || {}),
        body: JSON.stringify(lead)
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return { ok: true, channel: "webhook" };
      }).catch(function (err) {
        enqueue(lead);
        return { ok: false, channel: "local-queue", reason: "webhook 失败：" + err.message + "，已降级到本地队列" };
      });
    },
    email: function (lead) {
      // 静态站点不直接发信，交给后端或表单服务；此处只入队并标记待发送
      enqueue(lead);
      return Promise.resolve({ ok: true, channel: "email", reason: "已入队，由后端按 mailto/邮件服务发送" });
    },
    "wechat-work": function (lead) {
      enqueue(lead);
      return Promise.resolve({ ok: true, channel: "wechat-work", reason: "已入队，由后端推送企微群机器人" });
    }
  };

  function notify(lead) {
    var channel = config.channel || "local-queue";
    var adapter = adapters[channel] || adapters["local-queue"];
    return adapter(lead);
  }

  // ------------------------------------------------------------ 对外 API

  var DSGForms = {
    validate: validate,
    spamCheck: spamCheck,
    buildLead: buildLead,
    enqueue: enqueue,
    queue: queue,
    clearQueue: clearQueue,
    exportQueue: exportQueue,
    notify: notify,
    policyVersion: policyVersion,
    channels: Object.keys(adapters),
    /**
     * 从 <form> 元素收集并提交通用线索。
     * @returns {Promise<{ok:boolean, lead?:object, errors?:object, reason?:string}>}
     */
    submitForm: function (form, context) {
      context = context || {};
      var data = new FormData(form);
      var values = {
        name: data.get("name"),
        company: data.get("company"),
        jobTitle: data.get("jobTitle"),
        phone: data.get("phone"),
        email: data.get("email"),
        interest: data.get("interest"),
        message: data.get("message"),
        consent: data.get("consent") === "on" || data.get("consent") === "true",
        website: data.get("website"),            // honeypot
        formStartedAt: data.get("formStartedAt")
      };

      var errors = validate(values);
      if (Object.keys(errors).length) {
        return Promise.resolve({ ok: false, errors: errors });
      }

      var spam = spamCheck(values);
      if (spam) {
        // 不告诉机器人具体原因，静默成功以减少探测
        return Promise.resolve({ ok: true, spam: spam });
      }

      var lead = buildLead(values, context.eventId || null);
      return notify(lead).then(function (result) {
        return { ok: true, lead: lead, result: result };
      });
    }
  };

  global.DSGForms = DSGForms;
})(window);
