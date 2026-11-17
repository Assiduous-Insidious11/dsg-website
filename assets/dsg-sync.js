/*!
 * DSG 全站数据同步组件
 * ---------------------------------------------------------------
 * 目标：让"每一个前台页面"打开后都能看到同一份最新活动数据：
 *   1. 数据源统一：content/*.json（HTTP 下 fetch）→ assets/embedded-data.js（file:// 双击回退）
 *      → localStorage 发布队列（后台"发布到前台"后立即覆盖，实现跨页面同步）
 *   2. 渲染统一：在页面 <div data-dsg-sync></div> 处渲染
 *      【活动日历（月历）+ 近期活动列表】；没有挂载点的页面自动在 footer 前插入。
 *   3. 事件统一：所有"查看详情/报名"链接指向同一个 events-calendar.html / event-detail.html，
 *      与日历页完全一致。
 * 依赖：Alpine.js（x-data 由各页面 site.js 提供，本组件只做数据同步与渲染补强）。
 */
(function () {
  "use strict";
  var SYNC_KEY = "dsg-demo-published-v1";

  function normalize(event) {
    var hero = event.heroImage || event.image || "assets/module-events-v2.png";
    if (!event.image) event.image = hero;
    if (!event.dateText && event.date) {
      try {
        var loc = (document.documentElement.lang || "").toLowerCase() === "en" ? "en-US" : "zh-CN";
        event.dateText = new Intl.DateTimeFormat(loc, { month: "long", day: "numeric", weekday: "short" }).format(new Date(event.date));
      } catch (e) { event.dateText = event.date; }
    }
    event.phase = (event.date || "") < todayISO() ? "archived" : "upcoming";
    return event;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fetchJson(url) {
    return fetch(url + "?v=20260916-final3", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("fetch failed " + url); return r.json(); })
      .catch(function () {
        var key = url.split("/").pop().replace(".json", "");
        if (url.indexOf("content-en/") === 0) key = key + "-en";
        if (window.DSG_EMBEDDED && window.DSG_EMBEDDED[key]) return window.DSG_EMBEDDED[key];
        throw new Error("no data for " + url);
      });
  }

  function loadPublished() {
    try {
      var raw = window.localStorage.getItem(SYNC_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // 构建戳门槛：过期快照会把旧数据覆盖回来，直接作废（与 site.js 保持一致）
      if (!parsed || parsed.stamp !== (window.DSG_DATA_STAMP || "")) {
        window.localStorage.removeItem(SYNC_KEY);
        return null;
      }
      var data = parsed && parsed.data ? parsed.data : null;
      // 结构校验：events/aiCases/insights 必须是数组，否则视为脏数据丢弃
      if (!data) return null;
      if (data.events && !Array.isArray(data.events)) data.events = null;
      if (data.aiCases && !Array.isArray(data.aiCases)) data.aiCases = null;
      if (data.insights && !Array.isArray(data.insights)) data.insights = null;
      return data;
    } catch (e) { return null; }
  }

  function monthCells(events, cursor) {
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var start = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < start; i++) cells.push({ blank: true, key: "b" + i, events: [] });
    for (var d = 1; d <= days; d++) {
      var iso = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      cells.push({ blank: false, key: iso, day: d, events: events.filter(function (e) { return e.date === iso; }) });
    }
    return cells;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(mount) {
    var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
    var prefix = isEn ? "content-en/" : "content/";
    Promise.all([
      fetchJson(prefix + "events.json").catch(function () { return []; }),
      fetchJson(prefix + "site.json").catch(function () { return {}; })
    ]).then(function (res) {
      var events = (res[0] || [])
        .filter(function (e) { return e.publishStatus === "published"; })
        .map(normalize);
      // 后台发布队列合并（非空才合并；结构已在上方校验为数组）
      // 同 id 用发布数据覆盖，新 id 追加，其余源数据全部保留
      var published = loadPublished();
      if (published && Array.isArray(published.events) && published.events.length > 0) {
        var pubEvents = published.events.filter(function (e) { return e && e.publishStatus === "published"; });
        var merged = events.slice();
        pubEvents.forEach(function (item) {
          var idx = merged.findIndex(function (r) { return r && r.id === item.id; });
          if (idx !== -1) merged[idx] = item;
          else merged.push(item);
        });
        events = merged.map(normalize);
      }
      var upcoming = events.filter(function (e) { return e.phase === "upcoming"; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 4);
      var cursor = new Date();
      var cells = monthCells(events, cursor);
      var monthTitle = new Intl.DateTimeFormat(isEn ? "en-US" : "zh-CN", { year: "numeric", month: "long" }).format(cursor);
      var weekdays = isEn ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

      var html = "";
      html += '<section class="section dsg-sync-block">';
      html += '<div class="container">';
      html += '<div class="sync-head"><div><span class="meta">' + (isEn ? "Upcoming" : "近期安排") + '</span>';
      html += '<h2>' + (isEn ? "Events Calendar" : "活动日历") + '</h2>';
      html += '<p class="muted">' + (isEn ? "Browse upcoming events and reserve your seat." : "查看近期活动安排，可直接报名参加。") + '</p></div>';
      html += '<a class="btn secondary" href="' + (isEn ? "events-calendar-en.html" : "events-calendar.html") + '">' + (isEn ? "Full Calendar" : "完整日历") + '</a></div>';
      html += '<div class="sync-grid">';
      // 月历
      html += '<div class="sync-calendar month-calendar"><div class="month-toolbar"><div><h3>' + escapeHtml(monthTitle) + '</h3></div></div>';
      html += '<div class="weekday-row">' + weekdays.map(function (w) { return '<div class="weekday">' + w + '</div>'; }).join("") + '</div>';
      html += '<div class="month-grid">';
      cells.forEach(function (cell) {
        html += '<div class="day-cell' + (cell.blank ? " blank" : "") + ((!cell.blank && cell.events && cell.events.length) ? " has-event" : "") + '">';
        if (!cell.blank) {
          html += '<span class="day-number">' + cell.day + '</span><div class="day-events">';
          (cell.events || []).slice(0, 2).forEach(function (ev) {
            html += '<a class="day-event" href="' + (isEn ? "event-detail-en.html" : "event-detail.html") + '?id=' + encodeURIComponent(ev.id) + '"><span>' + escapeHtml(ev.eyebrow) + ' · ' + escapeHtml(ev.title) + '</span></a>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
      // 近期活动列表
      html += '<div class="sync-list">';
      upcoming.forEach(function (ev) {
        html += '<article class="calendar-item">';
        html += '<div class="datebox"><span>' + (isEn ? (ev.phase === "archived" ? "Archived" : "Upcoming") : (ev.phase === "archived" ? "已结束" : "未开始")) + '</span><strong>' + escapeHtml(ev.dateText || ev.date) + '</strong></div>';
        html += '<div><div class="meta">' + escapeHtml(ev.eyebrow) + ' · ' + escapeHtml(ev.time || "") + ' · ' + escapeHtml(ev.city || "") + '</div>';
        html += '<h3>' + escapeHtml(ev.title) + '</h3><p>' + escapeHtml(ev.summary || "") + '</p></div>';
        html += '<div class="actions"><a class="btn secondary" href="' + (isEn ? "event-detail-en.html" : "event-detail.html") + '?id=' + encodeURIComponent(ev.id) + '">' + (isEn ? "Details" : "查看详情") + '</a>';
        html += '<a class="btn gold" href="' + (isEn ? "contact-en.html" : "contact.html") + '">' + (isEn ? "Register" : "报名参会") + '</a></div>';
        html += '</article>';
      });
      if (!upcoming.length) {
        html += '<p class="muted">' + (isEn ? "No upcoming events at the moment." : "暂无即将开始的活动。") + '</p>';
      }
      html += '</div></div></div></section>';
      mount.innerHTML = html;
    }).catch(function (err) {
      console.error("[DSG-SYNC]", err);
      mount.innerHTML = '<section class="section"><div class="container"><p class="muted">' + (isEn ? "Event data is not available right now." : "活动数据暂不可用。") + '</p><p class="muted" style="font-size:12px">' + String(err && err.message || err) + '</p></div></section>';
    });
  }

  function ensureMount() {
    var mounts = document.querySelectorAll("[data-dsg-sync]");
    // 2026-11-06 改版：删除"无挂载点自动插到 footer 前"的行为。
    // 依据 2026-09-17 评审：AI 创新专区、行业洞察、关于 DSG 等栏目底部重复出现活动板块属于冗余，
    // 活动内容只保留统一入口。只有页面显式写了 <div data-dsg-sync> 才渲染。
    if (!mounts.length) return;
    mounts.forEach(function (m) { render(m); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureMount);
  } else {
    ensureMount();
  }
})();
