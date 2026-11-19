/**
 * 版式令牌注入器
 * ---------------------------------------------------------------
 * 后台改了 content/theme.json 之后，前台不需要重新构建 CSS：
 * 这里把令牌写成 <html> 上的内联 CSS 变量，样式表照旧用 var() 读取。
 *
 * 两个原则：
 * 1. 只做“倍率乘法”，不改断点自己的 clamp 曲线，所以调档不会打乱响应式；
 * 2. 值等于默认值时不写入，避免给元素增加无意义的内联样式（也方便排查）。
 *
 * 取值顺序：window.DSG_EMBEDDED.theme（同步，零闪动）→ content/theme.json
 */
(function (global) {
  "use strict";

  var DEFAULT = {
    scale: { hero: 1, display: 1, h2: 1, h3: 1, sectionY: 1, sectionYSm: 1 },
    layout: { pageMax: 1240, gutterMin: 20, gutterVw: 5, gutterMax: 64 },
    shape: { radius: 8 },
    image: { heroBg: "" },
    color: {
      ink: "#111315", ink2: "#1d2328", muted: "#6a7178", line: "#dfe4e8",
      paper: "#f7f6f1", gold: "#b8924a", teal: "#00c0b0", blue: "#1070f8",
      green: "#41765f",
      /* 2026-11-19：把首屏底色、深色区底色、深色区文字也纳入可配置，
         原来这三个值是写死在样式表里的（#0d182d / #0b0d10 / #f7f8fa）。 */
      heroBase: "#0d182d", darkBase: "#0b0d10", onDark: "#f7f8fa"
    }
  };

  var COLOR_VARS = {
    ink: "--ink", ink2: "--ink-2", muted: "--muted", line: "--line",
    paper: "--paper", gold: "--gold", teal: "--teal", blue: "--blue", green: "--green",
    heroBase: "--hero-base", darkBase: "--dark-base", onDark: "--on-dark"
  };

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function scaleOf(cfg, key) {
    var v = (cfg.scale || {})[key];
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : DEFAULT.scale[key];
  }

  function rawOf(cfg, group, key) {
    var v = (cfg[group] || {})[key];
    return v == null ? DEFAULT[group][key] : v;
  }

  function apply(cfg) {
    if (!cfg || typeof cfg !== "object") cfg = {};
    var root = document.documentElement;
    var set = function (name, value, isDefault) {
      if (isDefault) root.style.removeProperty(name);
      else root.style.setProperty(name, value);
    };

    // 字号与纵向节奏：纯倍率
    [
      ["hero", "--t-hero"], ["display", "--t-display"], ["h2", "--t-h2"],
      ["h3", "--t-h3"], ["sectionY", "--t-sec"], ["sectionYSm", "--t-sec-sm"]
    ].forEach(function (pair) {
      var v = scaleOf(cfg, pair[0]);
      set(pair[1], String(v), Math.abs(v - DEFAULT.scale[pair[0]]) < 1e-6);
    });

    // 栅格
    var pageMax = num(rawOf(cfg, "layout", "pageMax"), DEFAULT.layout.pageMax);
    set("--page-max", pageMax + "px", pageMax === DEFAULT.layout.pageMax);

    var gMin = num(rawOf(cfg, "layout", "gutterMin"), DEFAULT.layout.gutterMin);
    var gVw = num(rawOf(cfg, "layout", "gutterVw"), DEFAULT.layout.gutterVw);
    var gMax = num(rawOf(cfg, "layout", "gutterMax"), DEFAULT.layout.gutterMax);
    var gutter = "clamp(" + gMin + "px, " + gVw + "vw, " + gMax + "px)";
    var gutterDefault = gMin === DEFAULT.layout.gutterMin &&
      gVw === DEFAULT.layout.gutterVw && gMax === DEFAULT.layout.gutterMax;
    set("--gutter", gutter, gutterDefault);

    // 圆角
    var radius = num(rawOf(cfg, "shape", "radius"), DEFAULT.shape.radius);
    set("--radius", radius + "px", radius === DEFAULT.shape.radius);

    // 颜色
    Object.keys(COLOR_VARS).forEach(function (key) {
      var val = String(rawOf(cfg, "color", key) || "").trim();
      if (!val) { root.style.removeProperty(COLOR_VARS[key]); return; }
      set(COLOR_VARS[key], val, val.toLowerCase() === String(DEFAULT.color[key]).toLowerCase());
    });

    // 首屏背景图：留空表示沿用样式表里的默认图（内容不做任何改变）。
    // 用绝对地址写入，避免 url() 的相对路径按 <html> 内联样式解析而 404。
    var heroBg = String(rawOf(cfg, "image", "heroBg") || "").trim();
    if (heroBg) {
      var abs = heroBg;
      try { abs = new URL(heroBg, location.href).href; } catch (e) { /* 保持原样 */ }
      root.style.setProperty("--hero-bg", 'url("' + abs + '")');
    } else {
      root.style.removeProperty("--hero-bg");
    }

    global.DSG_THEME = cfg;
    document.dispatchEvent(new CustomEvent("dsg:theme", { detail: cfg }));
  }

  function fromEmbedded() {
    var emb = global.DSG_EMBEDDED;
    return emb && emb.theme && typeof emb.theme === "object" ? emb.theme : null;
  }

  function load() {
    var sync = fromEmbedded();
    if (sync) apply(sync);
    // file:// 下直接双击打开时只认内嵌快照（fetch 会被 CORS 拦，报了也没用）；
    // 线上（http/https）先套快照保证首屏不闪，再拉一次源文件——
    // 后台改完 content/theme.json 后刷新即生效，不必重建内嵌快照。
    if (sync && location.protocol === "file:") return;
    fetch("content/theme.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) { if (cfg) apply(cfg); })
      .catch(function () { /* 读不到就沿用已应用的值，不影响渲染 */ });
  }

  global.DSGTheme = { apply: apply, load: load, defaults: DEFAULT };
  load();
})(window);
