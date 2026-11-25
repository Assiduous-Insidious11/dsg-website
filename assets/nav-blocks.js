/*!
 * DSG 前台 · 导航与板块同步层（2026-11-25）
 * ------------------------------------------------------------------
 * 作用：读取 content/navigation.json 与 content/blocks.json，在运行时把后台的
 *       导航设置与板块编排套用到已有页面上。
 *
 * 三条硬约束：
 *   1. 绝不改写 HTML 文件，只改 DOM。后台不点「发布上线」，页面与现在一字不差。
 *   2. 任何一步出错都静默退出，页面保持原样 —— 后台配置坏了不能把前台弄坏。
 *   3. 导航就地复用已有节点，不整体重建 innerHTML，保留移动端汉堡菜单的既有绑定。
 *
 * 英文站（lang=en）不套用中文配置，直接返回。
 */
(function () {
  "use strict";

  var V = "20261125a";

  // 字号档位：写死在样式表里只有这 4 档，避免自由像素在手机上溢出
  var SCALE = { s: 0.92, standard: 1, l: 1.12, xl: 1.24 };
  // 文字颜色：6 个已验证对比度的值
  var COLOR = { "default": "", ink: "#111315", teal: "#0f7b74", blue: "#1f4f9c", gold: "#b8924a", muted: "#6a7178" };

  function fetchJson(path) {
    // 版本号优先跟随 site.js 的内容版本：内容一改，缓存自然失效
    var v = (window.DSG_CONTENT_VERSION || V);
    return fetch(path + "?v=" + v, { cache: "default" }).then(function (r) {
      if (!r.ok) throw new Error("fetch " + path);
      return r.json();
    });
  }

  function curFile() {
    var p = (location.pathname || "").split("/").pop();
    return (p || "index.html").toLowerCase();
  }

  function plain(href) {
    return String(href || "").split("?")[0].split("#")[0].replace(/^\.\//, "");
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ------------------------------------------------------------------ 导航
  function applyNav(cfg) {
    var nav = document.querySelector("nav.nav");
    if (!nav || !cfg || !Array.isArray(cfg.items)) return;
    var box = nav.querySelector(".nav-links");
    if (!box) return;

    var file = curFile();
    var existing = {};
    Array.prototype.forEach.call(box.children, function (node) {
      var a = node.tagName === "A" ? node : node.querySelector("a");
      if (!a) return;
      var key = plain(a.getAttribute("href"));
      if (key && !existing[key]) existing[key] = node;
    });

    var used = [];
    cfg.items.forEach(function (item) {
      if (!item || item.visible === false) return;
      var key = plain(item.href);
      var node = existing[key];

      if (!node) {
        // 新增菜单：按现有结构造节点，CSS 类不变，样式自动继承
        if (item.children && item.children.length) {
          node = document.createElement("div");
          node.className = "nav-item";
          var a0 = document.createElement("a");
          a0.setAttribute("href", item.href || "index.html");
          node.appendChild(a0);
          var dd0 = document.createElement("div");
          dd0.className = "dropdown";
          node.appendChild(dd0);
        } else {
          node = document.createElement("a");
          node.setAttribute("href", item.href || "index.html");
        }
      }

      var link = node.tagName === "A" ? node : node.querySelector("a");
      if (link) {
        link.textContent = item.label || "";
        link.setAttribute("href", item.href || "index.html");
        link.classList.toggle("active", plain(item.href) === file);
      }

      var dd = node.classList && node.classList.contains("nav-item") ? node.querySelector(".dropdown") : null;
      if (dd) {
        var kids = (item.children || []).filter(function (c) { return c && c.visible !== false; });
        var childMap = {};
        Array.prototype.forEach.call(dd.children, function (c) {
          childMap[plain(c.getAttribute("href"))] = c;
        });
        var keep = [];
        kids.forEach(function (c) {
          var el = childMap[plain(c.href)] || document.createElement("a");
          el.textContent = c.label || "";
          el.setAttribute("href", c.href || "#");
          if (plain(c.href) === file) el.classList.add("active");
          keep.push(el);
        });
        dd.textContent = "";
        keep.forEach(function (el) { dd.appendChild(el); });
        dd.style.display = keep.length ? "" : "none";
      }

      used.push(node);
    });

    // 配置里没有的菜单：从导航上拿掉（页面文件仍可访问）
    Array.prototype.slice.call(box.children).forEach(function (node) {
      if (used.indexOf(node) === -1) box.removeChild(node);
    });
    // 按配置顺序重排
    used.forEach(function (node) { box.appendChild(node); });

    var cta = nav.querySelector(".nav-cta");
    if (cta) {
      if (cfg.cta && cfg.cta.visible !== false) {
        cta.style.display = "";
        cta.textContent = cfg.cta.label || "预约咨询";
        cta.setAttribute("href", cfg.cta.href || "contact.html");
      } else {
        cta.style.display = "none";
      }
    }

    var lang = nav.querySelector(".lang-toggle");
    if (lang) {
      if (cfg.showLangSwitch === false) {
        lang.style.display = "none";
      } else {
        lang.style.display = "";
        if (cfg.langSwitch) {
          lang.textContent = cfg.langSwitch.label || "EN";
          lang.setAttribute("href", cfg.langSwitch.href || "index-en.html");
        }
      }
    }

    nav.classList.toggle("nav-style-button", cfg.navStyle === "button");
    nav.classList.toggle("nav-style-text", cfg.navStyle !== "button");
  }

  // ------------------------------------------------------------------ 板块
  function applyStyle(el, b) {
    var s = b.style || {};
    var f = SCALE[s.fontScale];
    if (f && f !== 1) {
      el.style.setProperty("--t-h2", String(f));
      el.style.setProperty("--t-hero", String(f));
    } else {
      el.style.removeProperty("--t-h2");
      el.style.removeProperty("--t-hero");
    }
    var color = COLOR[s.themeColor];
    if (color) el.style.color = color;
    else el.style.removeProperty("color");
    el.style.textAlign = s.align === "center" ? "center" : "";
    if (s.bgImage) {
      el.style.backgroundImage = 'url("' + s.bgImage + '")';
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
    } else {
      el.style.removeProperty("background-image");
      el.style.removeProperty("background-size");
      el.style.removeProperty("background-position");
    }
  }

  function renderCustom(el, b) {
    var c = b.content || {};
    var html = '<div class="container"><div class="section-head"><div>';
    if (c.eyebrow) html += '<span class="eyebrow">' + esc(c.eyebrow) + "</span>";
    html += '<h2 class="h2-wide">' + esc(c.title || "") + "</h2></div>";
    if (c.body) html += "<p>" + esc(c.body).replace(/\n/g, "<br>") + "</p>";
    html += "</div>";
    if (c.image) html += '<div class="blk-media"><img src="' + esc(c.image) + '" alt=""></div>';
    if (c.buttonLabel) {
      html += '<div class="hero-actions"><a class="btn gold" href="' + esc(c.buttonHref || "#") + '">' +
        esc(c.buttonLabel) + "</a></div>";
    }
    html += "</div>";
    el.innerHTML = html;
  }

  function ensureCustom(b, prev) {
    var el = document.querySelector('[data-block-custom="' + b.id + '"]');
    var isNew = !el;
    if (isNew) {
      el = document.createElement("section");
      el.className = "section surface-white";
      el.setAttribute("data-block-custom", b.id);
    }
    var stamp = "";
    try { stamp = JSON.stringify(b.content || {}); } catch (e) { stamp = ""; }
    if (isNew || el.getAttribute("data-stamp") !== stamp) {
      renderCustom(el, b);
      el.setAttribute("data-stamp", stamp);
    }
    if (isNew) {
      var anchor = prev && prev.parentNode ? prev : document.querySelector("[data-block]");
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
      else (document.querySelector("main") || document.body).appendChild(el);
    }
    return el;
  }

  function applyBlocks(cfg) {
    if (!cfg || !cfg.pages) return;
    var file = curFile();
    var pageKey = null;
    Object.keys(cfg.pages).forEach(function (k) {
      if (plain((cfg.pages[k] || {}).file) === file) pageKey = k;
    });
    if (!pageKey) return;

    var pg = cfg.pages[pageKey];
    var all = (pg.sections || []).concat(pg.custom || []);
    all.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    var prev = null;
    all.forEach(function (b) {
      var el = b.custom
        ? ensureCustom(b, prev)
        : document.querySelector(b.selector || ("[data-block='" + b.id + "']"));
      if (!el) return;
      el.style.display = (b.visible === false || b.deleted) ? "none" : "";
      applyStyle(el, b);
      // 只有同一父节点内才重排，跨容器不动，避免把页脚搬坏
      if (prev && prev.parentNode === el.parentNode && prev.nextElementSibling !== el) {
        prev.parentNode.insertBefore(el, prev.nextSibling);
      }
      prev = el;
    });
  }

  // ------------------------------------------------------------------ 启动
  function boot() {
    if ((document.documentElement.lang || "").toLowerCase() === "en") return;
    Promise.all([
      fetchJson("content/navigation.json").catch(function () { return null; }),
      fetchJson("content/blocks.json").catch(function () { return null; })
    ]).then(function (res) {
      try { if (res[0]) applyNav(res[0]); } catch (e) { /* 静默：前台保持原样 */ }
      try { if (res[1]) applyBlocks(res[1]); } catch (e) { /* 静默 */ }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
