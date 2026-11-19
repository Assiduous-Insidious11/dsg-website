/**
 * 页面区块文案绑定器
 * ---------------------------------------------------------------
 * 页面不用改结构，只在元素上加 data-bind="区块.字段"，由这里填充。
 *
 * 为什么不走 Alpine 的 x-text：x-text 在数据未到达时会把元素清空，
 * 首屏会闪一下空白，爬虫也可能抓到空标题。这里的规则是
 * 「数据没到就保留 HTML 原文」——所以断网、JS 失败、SEO 抓取都拿到完整文案。
 *
 * 支持的标记（后台只需普通文本框）：
 *   \n          换行，渲染成 <br>；元素加 data-bind-br="br-lead" 可指定断行 class
 *   [[文字]]    金色强调（hero-emphasis + 不折行）
 *   {{文字}}    不折行词组（nw）
 *   含 < 的值    视为后台直接写的 HTML，原样输出
 *
 * 附属属性：data-bind-href / data-bind-src / data-bind-alt
 */
(function (global) {
  "use strict";

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) { return ESC[c]; });
  }

  function rich(text, brClass) {
    if (text == null) return "";
    var s = String(text);
    if (/<[a-z][\s\S]*>/i.test(s)) return s;
    s = escapeHtml(s);
    s = s.replace(/\[\[(.+?)\]\]/g, '<span class="hero-emphasis nw">$1</span>');
    s = s.replace(/\{\{(.+?)\}\}/g, '<span class="nw">$1</span>');
    s = s.replace(/\r?\n/g, brClass ? '<br class="' + brClass + '">' : "<br>");
    return s;
  }

  function pick(root, path) {
    if (!root || !path) return undefined;
    var parts = String(path).split(".");
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /**
   * 取当前页面的数据键。
   * 不能用 body 上的 dsgApp('summits')：那是业务模块名，和数据文件名不是一回事
   * （events-summits.html → 'summits'，supply-chain-ai.html → 'ai'）。
   * 统一按文件名取，只把 index 映射成 home。
   */
  var PAGE_ALIAS = { index: "home" };

  function pageKey() {
    var file = String(location.pathname || "").split("/").pop() || "";
    var name = file.replace(/\.html?$/i, "").replace(/-en$/, "");
    if (!name) name = document.body.getAttribute("data-page") || "";
    return PAGE_ALIAS[name] || name;
  }

  var Blocks = {
    data: null,
    page: "",
    ready: false,

    load: function () {
      var self = this;
      var lang = (document.documentElement.lang || "").toLowerCase();
      var file = lang === "en" ? "content-en/page-blocks.json" : "content/page-blocks.json";
      var request;
      if (global.fetchJsonFallback) {
        request = global.fetchJsonFallback(file);
      } else {
        // 没有 site.js 的轻量页面（如 privacy）直接读内嵌快照或 fetch
        var key = file.indexOf("content-en/") === 0 ? "page-blocks-en" : "page-blocks";
        if (global.DSG_EMBEDDED && global.DSG_EMBEDDED[key]) {
          request = Promise.resolve(global.DSG_EMBEDDED[key]);
        } else {
          request = fetch(file, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          });
        }
      }

      return request.then(function (data) {
        self.data = data || {};
        self.page = pageKey();
        self.ready = true;
        self.render();
        document.dispatchEvent(new CustomEvent("dsg:blocks", { detail: self.data }));
      }).catch(function (err) {
        try { console.warn("[blocks] 文案数据未加载，保留 HTML 原文：" + (err && err.message)); } catch (e) {}
      });
    },

    scope: function () {
      return this.page ? pick(this.data, this.page) : null;
    },

    render: function () {
      var scope = this.scope();
      if (!scope) return;
      var nodes = document.querySelectorAll("[data-bind],[data-bind-src],[data-bind-alt]");

      Array.prototype.forEach.call(nodes, function (el) {
        var path = el.getAttribute("data-bind");
        if (path) {
          var v = pick(scope, path);
          if (v != null && v !== "") {
            var attr = el.getAttribute("data-bind-attr");
            if (attr) el.setAttribute(attr, String(v));
            else el.innerHTML = rich(v, el.getAttribute("data-bind-br") || "");
          }
        }
        ["href", "src", "alt"].forEach(function (name) {
          var p = el.getAttribute("data-bind-" + name);
          if (!p) return;
          var val = pick(scope, p);
          if (val != null && val !== "") el.setAttribute(name, String(val));
        });
      });
    }
  };

  global.DSGBlocks = Blocks;

  function boot() { Blocks.load(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
