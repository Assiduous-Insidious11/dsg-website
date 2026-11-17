/*!
 * DSG 官网前台数据层
 * ---------------------------------------------------------------
 * 原则（网站需求方向.docx）：
 * 1. 先设计数据，再设计页面 —— 一条活动只存一份，各页面读取同一数据源
 * 2. 只有 publishStatus === "published" 的数据才允许出现在正式页面
 * 3. 数字口径分 verified / estimated / pending，pending 一律不渲染
 * 4. 未取得授权的嘉宾不展示实名与头像
 */
(function (global) {
  "use strict";

  // 缓存版本号：内容更新时同步修改，用于绕过浏览器与 CDN 缓存
  var CONTENT_VERSION = "20260906-content1";

  var CONTENT_FILES = {
    events: "events",
    articles: "articles",
    organizations: "organizations",
    speakers: "speakers",
    media: "media",
    aiCases: "ai-cases",
    legacyCases: "legacy-cases",
    pages: "pages"
  };

  function chinaParts() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).reduce(function (acc, item) {
      acc[item.type] = item.value;
      return acc;
    }, {});
    return parts;
  }

  /**
   * 兼容层：把新内容模型映射回模板已在用的字段，
   * 同时把口径不全的数字收敛成 null（页面不得显示）。
   */
  function decorate(event, derivatives) {
    var scale = event.scale || {};
    var expected = (scale.expected || {}).value;
    var registered = (scale.registered || {}).value;
    var hero = event.heroImage || event.image || "assets/module-events-v2.png";
    // 内容层存原图，页面用构建生成的 WebP（原图保留，可随时回滚）
    var optimized = (derivatives || {})[hero];
    event.image = (optimized && optimized.webp) || hero;
    event.imageFallback = hero;
    /* 小尺寸缩略图（首页「近期活动」次卡）优先用实拍现场照：
       竖版海报塞进横条里只能截成一条白纸条，实拍照裁切后仍然可读。
       没有实拍就从图集里取第一张；两者都没有时留空，由模板走排版卡兜底。 */
    event.thumb = event.thumb || (event.gallery || [])[0] || "";
    event.capacity = expected == null ? null : expected;
    event.seatsLeft = (expected != null && registered != null) ? Math.max(expected - registered, 0) : null;
    return event;
  }

  /**
   * 往期案例卡上的「形式」标签。
   * 数据里 legacy-cases 的 format 大多是「峰会会后报告」「城市站会后报告」，
   * 那是内部归档时的文件名说法，直接印在卡片上等于向访客交代资料归档，
   * 对外只保留活动形态本身（峰会 / 城市站 / 私董会 …）。
   */
  function caseFormatLabel(item) {
    var f = String((item && item.format) || "").replace(/\s*会后报告\s*/g, "").trim();
    return f || (item && item.category) || "";
  }

  function metricText(metric, unit) {
    if (!metric || metric.value == null || metric.status === "pending") return "";
    var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
    // 不再输出「约 / 大概 / ~」：数字要么是确切值，要么是 N+ 门槛值
    var text = String(metric.value);
    // 门槛值（至少 N）：显示「300+」，不加"约""大概"，避免把精确数写成估数
    if (metric.atLeast) text += "+";
    return unit ? text + " " + unit : text;
  }

  global.DSG_CONTENT_VERSION = CONTENT_VERSION;
  global.fetchJsonFallback = async function (url) {
    try {
      var response = await fetch(url + "?v=" + CONTENT_VERSION, { cache: "no-store" });
      if (!response.ok) throw new Error("fetch failed " + url);
      return await response.json();
    } catch (err) {
      var key = url.split("/").pop().replace(".json", "");
      if (url.indexOf("content-en/") === 0) key = key + "-en";
      if (global.DSG_EMBEDDED && global.DSG_EMBEDDED[key]) return global.DSG_EMBEDDED[key];
      throw err;
    }
  };

  global.dsgApp = function dsgApp(page) {
    var parts = chinaParts();
    var chinaToday = parts.year + "-" + parts.month + "-" + parts.day;
    var archiveCutoffYear = Number(parts.year) - 2;

    var defaultEvent = {
      id: "",
      type: "",
      title: "活动详情",
      eyebrow: "",
      date: chinaToday,
      dateText: "",
      time: "",
      city: "",
      venue: "",
      capacity: null,
      seatsLeft: null,
      status: "",
      image: "assets/module-events-v2.png",
      summary: "",
      tags: [],
      agenda: [],
      scale: {}
    };

    return {
      page: page,
      menuOpen: false,
      typeFilter: "all",
      selectedEvent: null,
      selectedVideo: null,
      dataReady: false,
      dataError: false,
      content: {
        events: [], articles: [], organizations: [], speakers: [], media: [],
        aiCases: [], legacyCases: [], pages: [], site: {}
      },
      formState: { submitting: false, errors: {}, message: "", ok: false },

      async init() {
        await this.loadContent();
        /* 首页「报名参会」直接跳到详情页并带 #register：
           落地即拉起报名弹层，省掉在详情页再找一次按钮。
           只在带 id 的详情页响应，避免首页 / 活动页被误触发。 */
        if (global.location.hash === "#register" && new URLSearchParams(global.location.search).get("id")) {
          this.openRegistration(this.currentEvent);
        }
      },

      async loadContent() {
        try {
          // 多语言内容层：英文页（lang="en"）优先加载 content-en/，缺失回退 content/
          var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
          var prefix = isEn ? "content-en/" : "content/";
          var fallbackPrefix = isEn ? "content-en/" : "content/";
          var names = Object.keys(CONTENT_FILES);
          var results = await Promise.all(names.map((key) =>
            this.fetchJson(prefix + CONTENT_FILES[key] + ".json")
                .catch(function () { return global.fetchJsonFallback(fallbackPrefix + CONTENT_FILES[key] + ".json"); })
          ));
          var loaded = {};
          names.forEach(function (key, index) { loaded[key] = results[index]; });
          var site = await this.fetchJson(prefix + "site.json")
            .catch(function () { return global.fetchJsonFallback(fallbackPrefix + "site.json").catch(function () { return {}; }); });
          loaded.site = site;
          // Demo 模式发布桥接：后台点击"发布到前台（Demo）"后，
          // 数据写入 localStorage（dsg-demo-published-v1），前台优先读取，
          // 实现"后台发布 → 刷新前台即见"的演示闭环；正式上线由后端数据库驱动。
          // 英文页（lang="en"）不合并：后台发布数据为中文，若合并会污染英文页，
          // 英文页必须 100% 显示 content-en 英文内容。
          if (!isEn) try {
            var demoPublished = JSON.parse(global.localStorage.getItem("dsg-demo-published-v1") || "null");
            // 构建戳门槛（2026-11-16）：本地「发布到前台」快照是按 id 整体覆盖源数据的，
            // 几天前的旧快照一旦留下，就会把大部分活动覆盖成草稿状态，
            // 前台过滤 published 后只剩两三条，页面看着像数据丢了。
            // 快照的 stamp 必须等于当前 embedded-data 的构建戳，否则视为过期，直接删除。
            if (demoPublished && demoPublished.stamp !== (global.DSG_DATA_STAMP || "")) {
              global.localStorage.removeItem("dsg-demo-published-v1");
              demoPublished = null;
            }
            if (demoPublished && demoPublished.data) {
              // 合并发布队列：以源内容为基础，把发布数据按 id 合并进去。
              // 同 id 用发布数据覆盖（后台编辑过的内容），新 id 追加（后台新建的活动），
              // 其余源数据全部保留——绝不会把页面清空，只会增量更新。
              var mergeById = function (sourceList, publishedList) {
                if (!Array.isArray(publishedList) || !publishedList.length) return sourceList || [];
                var src = sourceList || [];
                var result = src.slice();
                publishedList.forEach(function (item) {
                  if (!item || !item.id) return;
                  var idx = result.findIndex(function (r) { return r && r.id === item.id; });
                  if (idx !== -1) result[idx] = item;
                  else result.push(item);
                });
                return result;
              };
              loaded.events = mergeById(loaded.events, demoPublished.data.events);
              loaded.aiCases = mergeById(loaded.aiCases, demoPublished.data.aiCases);
              loaded.articles = mergeById(loaded.articles, demoPublished.data.insights);
            }
          } catch (demoError) {
            console.warn("DSG demo published queue ignored", demoError);
          }
          // 发布状态门禁：非 published 一律不进页面数据
          var derivatives = {};
          (loaded.media || []).forEach(function (m) {
            if (m.derivatives && m.derivatives.webp) derivatives[m.path] = m.derivatives;
          });
          loaded.events = (loaded.events || []).map(function (e) { return decorate(e, derivatives); });
          loaded.articles = (loaded.articles || []).filter((a) => a.publishStatus === "published");
          loaded.aiCases = (loaded.aiCases || []).filter((a) => a.publishStatus === "published");
          loaded.organizations = (loaded.organizations || []).filter((o) => o.publishStatus === "published");
          loaded.speakers = (loaded.speakers || []).filter(function (s) {
            return s.publishStatus === "published" && (s.license || {}).status !== "unknown" && (s.license || {}).status !== "denied";
          });
          this.content = loaded;
          this.dataReady = true;
          this.injectStructuredData();
        } catch (error) {
          console.error("DSG content load failed", error);
          this.dataError = true;
          this.dataReady = true;
        }
      },

      async fetchJson(url) {
        // 双击 file:// 打开时浏览器禁止 fetch 本地 JSON，回退内嵌数据（assets/embedded-data.js）
        try {
          var response = await fetch(url + "?v=" + CONTENT_VERSION, { cache: "no-store" });
          if (!response.ok) throw new Error("Failed to load " + url);
          return await response.json();
        } catch (err) {
          var key = url.split("/").pop().replace(".json", "");
          if (url.indexOf("content-en/") === 0) key = key + "-en";
          if (global.DSG_EMBEDDED && global.DSG_EMBEDDED[key]) return global.DSG_EMBEDDED[key];
          throw err;
        }
      },

      // ------------------------------------------------------ 数据源
      get events() {
        return (this.content.events || []).filter((e) => e.publishStatus === "published");
      },
      /**
       * 首页「近期活动」排序（2026-11-12 晚）：
       * 11-06 评审要求「首页放时间最接近的近期活动」（销售负责人点名 11 月 13 日那场）。
       * 原来直接 events.slice(0,3)，取的是数据文件里的顺序，
       * 结果最近的 11-13 反而排到最后，前两张是 8 月和 3 月已结束的场次。
       * 现在：未开的按日期由近到远排前，已结束的按时间由新到旧补后。
       */
      get homeEvents() {
        var today = chinaToday;
        var all = this.events.slice();
        var upcoming = all.filter(function (e) { return (e.date || "") >= today; })
          .sort(function (a, b) { return a.date > b.date ? 1 : (a.date < b.date ? -1 : 0); });
        var past = all.filter(function (e) { return (e.date || "") < today; })
          .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
        return upcoming.concat(past);
      },
      /**
       * 首页「近期活动」只显示一场（2026-11-15 第二批 #12/#13）：
       * 取"下一场还没办的活动"；没有未来场次时返回 null，页面显示「敬请期待」。
       * 注意：不能用 homeEvents[0]，因为它在无未来场次时会把已办完的旧场顶上来。
       */
      get nextUpcomingEvent() {
        var today = chinaToday;
        var upcoming = this.events
          .filter(function (e) { return (e.date || "") >= today; })
          .sort(function (a, b) { return a.date > b.date ? 1 : (a.date < b.date ? -1 : 0); });
        if (upcoming.length) return upcoming[0];
        // 没有未开始场次时，兜底取日期最近的一场已结束活动（评审：首页放时间最接近的近期活动），
        // 不再直接回退空态；卡片状态文案由 eventPhaseLabel 显示"已结束"。
        var past = this.events
          .filter(function (e) { return (e.date || "") < today; })
          .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
        return past.length ? past[0] : null;
      },
      get articles() { return this.content.articles || []; },
      get aiCases() { return this.content.aiCases || []; },
      get insights() { return this.content.articles || []; },
      get organizations() { return this.content.organizations || []; },
      get speakers() { return this.content.speakers || []; },
      get media() { return this.content.media || []; },
      get pages() { return this.content.pages || []; },
      get site() { return this.content.site || {}; },
      get legacyCases() { return this.content.legacyCases || []; },
      get historicalCases() { return this.legacyCases; },
      get homeMetrics() {
        // 首页指标：已核实(verified)直接展示；估算(estimated)保留"约"字前缀上首页；
        // pending / 无值的口径一律不渲染。估算项须在 note 写明口径，不得使用 AI 生成数字。
        return (this.site.homeMetrics || []).filter(function (m) {
          return m.metric && m.metric.value != null &&
            (m.metric.status === "verified" || m.metric.status === "estimated");
        });
      },
      get contactInfo() { return this.site.contact || {}; },

      get summitCases() { return this.legacyCases.filter((i) => i.category === "峰会" || i.category === "年度峰会"); },
      get cityCases() { return this.legacyCases.filter((i) => i.category === "城市沙龙"); },
      get eliteCases() { return this.legacyCases.filter((i) => i.category === "精英六人谈"); },
      get visitCases() { return this.legacyCases.filter((i) => i.category === "走进企业"); },
      recentCasesByCategory(category, limit) {
        limit = limit || 6;
        return this.legacyCases
          .filter((i) => i.category === category)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit)
          .map((i) => Object.assign({}, i, { format: caseFormatLabel(i) }));
      },

      get summits() { return this.events.filter((e) => e.type === "summit"); },
      get cityEvents() { return this.events.filter((e) => e.type === "city"); },
      get eliteEvents() { return this.events.filter((e) => e.type === "elite"); },

      /* ------------------------------------------------------------------
       * 活动三类分层（2026-11-17 改）
       * 依据案例集锦开篇的三大核心业务：年度峰会（千人，一年 2 次）、
       * DSG 全球供应链城市站（百人沙龙）、精英六人谈（10 人私董会）。
       * 与 11-16 评审一致：
       *   · 删「外部承办」——它是替别人办会，不是自己的可报名场次；
       *   · 删「闭门会」独立分类——闭门会与走进企业统一并入「精英六人谈」，
       *     category 已在 content/events.json 内改为 elite，此处不再单列。
       * ---------------------------------------------------------------- */
      get eventCategories() {
        var self = this;
        var defs = [
          { key: "summit", label: "年度峰会", desc: "千人规模，一年两场。", anchor: "summit" },
          { key: "city", label: "城市沙龙", desc: "百人规模，走进区域产业带，把行业议题落到本地企业。", anchor: "city" },
          { key: "elite", label: "精英六人谈", desc: "十人私董会，每周 1—2 场，按行业拆解一个具体问题。", anchor: "elite" }
        ];
        return defs.map(function (d) {
          d.events = self.events.filter(function (e) { return e.category === d.key; });
          d.count = d.events.length;
          return d;
        });
      },
      eventsOfCategory(key) {
        return this.events.filter(function (e) { return e.category === key; });
      },
      /** 活动页列表：同一类内按日期由新到旧，最新的排最前 */
      eventsOfCategorySorted(key) {
        return this.eventsOfCategory(key).slice().sort(function (a, b) {
          return (a.date || "") > (b.date || "") ? -1 : ((a.date || "") < (b.date || "") ? 1 : 0);
        });
      },
      /** 五类总览卡上的「最近一场」：日期 + 城市；没有场次时给一句兜底 */
      latestCategoryEvent(key) {
        var list = this.eventsOfCategorySorted(key);
        if (!list.length) return "按项目沟通档期";
        var e = list[0];
        var d = (e.date || "").replace(/-/g, ".");
        return "最近一场 " + d + (e.city ? " · " + e.city : "");
      },
      /** 页面上只展示有场次的类型，避免出现「0 场」的空栏目 */
      get visibleCategories() {
        return this.eventCategories.filter(function (c) { return c.count > 0; });
      },
      /**
       * 每类精选：先看素材厚度（真实照片 > 有交流话题 > 有参会名单 > 有会后资料），
       * 同样厚的按日期由新到旧。理由——评审要求「真实照片 + 真实 KV」，
       * 素材齐的场次才撑得住大幅版面。
       */
      featuredOfCategory(key, limit) {
        limit = limit || 3;
        var score = function (e) {
          return (e.photoCount > 0 ? 4 : 0) + ((e.topics || []).length ? 3 : 0) +
            ((e.attendees || []).length ? 2 : 0) + ((e.materials || []).length ? 1 : 0);
        };
        return this.eventsOfCategory(key).slice().sort(function (a, b) {
          var d = score(b) - score(a);
          if (d !== 0) return d;
          return (b.date || "") > (a.date || "") ? 1 : -1;
        }).slice(0, limit);
      },
      countOfCategory(key) {
        return this.eventsOfCategory(key).length;
      },

      /* ---------------------------- 首页「近期活动」 */
      /** 首页主卡：优先未开始场次，没有就取最近一场已结束（评审：放时间最接近的那场） */
      get homeFeaturedEvent() { return this.nextUpcomingEvent; },
      /** 首页次卡：主卡之外的最近两场，按时间倒排 */
      get homeSideEvents() {
        var main = this.homeFeaturedEvent;
        var today = chinaToday;
        return this.events.slice()
          .filter(function (e) { return !main || e.id !== main.id; })
          .filter(function (e) { return (e.date || "") < today; })
          .sort(function (a, b) { return (a.date || "") > (b.date || "") ? -1 : 1; })
          /* 2026-11-17：首页只留最近刚结束的一场。
             两场并排时，一场有实拍、一场只有排版卡，左右不平；
             单场横铺成一条，标题也能收在一行里。 */
          .slice(0, 1);
      },

      /* ---------------------------- 活动日历：按年 12 格 */
      get calendarYears() {
        var years = {};
        this.events.forEach(function (e) { years[(e.date || "").slice(0, 4)] = true; });
        years[parts.year] = true;
        return Object.keys(years).filter(Boolean).sort().reverse();
      },
      calendarYear: String(parts.year),
      get monthsGrid() {
        var year = Number(this.calendarYear);
        var self = this;
        var out = [];
        for (var m = 1; m <= 12; m += 1) {
          var mm = String(m).padStart(2, "0");
          var list = this.events.filter(function (e) { return (e.date || "").slice(0, 7) === year + "-" + mm; });
          var cats = [];
          list.forEach(function (e) { if (e.category && cats.indexOf(e.category) === -1) cats.push(e.category); });
          out.push({
            month: m, key: year + "-" + mm, count: list.length, cats: cats,
            events: list.sort(function (a, b) { return a.date > b.date ? 1 : -1; }),
            lead: list.length ? list[list.length - 1].title : ""
          });
        }
        return out;
      },
      activeMonth: null,
      openMonth(key) { this.activeMonth = key; },
      closeMonth() { this.activeMonth = null; },
      get activeMonthEvents() {
        if (!this.activeMonth) return [];
        var key = this.activeMonth;
        return this.events.filter(function (e) { return (e.date || "").slice(0, 7) === key; })
          .sort(function (a, b) { return a.date > b.date ? 1 : -1; });
      },
      get activeMonthLabel() {
        if (!this.activeMonth) return "";
        var p = this.activeMonth.split("-");
        return p[0] + " 年 " + Number(p[1]) + " 月";
      },

      /* ---------------------------- 活动页：系统日历（2026-11-17 评审）
       * 评审原话：“电脑日历不会 26 年 25 年 24 年那样，它直接……后台数据库肯定是
       * 年月日，在这上浮现出来不就行了吗，又不要写死的。”
       * 所以这里不按年分页，光标停在某一个月，年份与月份各一个下拉直接跳。
       * ---------------------------------------------------------- */
      get calYear() { return Number((this.calendarCursor || "").slice(0, 4)); },
      get calMonth() { return Number((this.calendarCursor || "").slice(5, 7)); },
      setCalYear(year) { this.setCalCursor(Number(year), this.calMonth); },
      setCalMonth(month) { this.setCalCursor(this.calYear, Number(month)); },
      setCalCursor(year, month) {
        this.calendarCursor = year + "-" + String(month).padStart(2, "0") + "-01";
      },
      /** 年份下拉：只列有场次的年份，加上当前年，升序 */
      get calYears() {
        var years = {};
        this.events.forEach(function (e) {
          var y = (e.date || "").slice(0, 4);
          if (y) years[y] = true;
        });
        years[parts.year] = true;
        return Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
      },
      /**
       * 月历格子：周一为第一列（与系统日历一致），并把前后月的补格一起排出来，
       * 保证每一行都是满 7 格，行列永远齐。
       */
      get calCells() {
        var year = this.calYear;
        var month = this.calMonth;
        var cells = [];
        var i;
        var lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
        for (i = lead; i > 0; i -= 1) {
          cells.push(this.calCellOf(new Date(year, month - 1, 1 - i), true));
        }
        var days = new Date(year, month, 0).getDate();
        for (i = 1; i <= days; i += 1) {
          cells.push(this.calCellOf(new Date(year, month - 1, i), false));
        }
        var tail = (7 - (cells.length % 7)) % 7;
        for (i = 1; i <= tail; i += 1) {
          cells.push(this.calCellOf(new Date(year, month - 1, days + i), true));
        }
        return cells;
      },
      calCellOf(date, outside) {
        var iso = this.toISODate(date);
        return {
          key: iso,
          day: date.getDate(),
          iso: iso,
          outside: outside,
          today: iso === chinaToday,
          /* 补格只做占位，不挂活动，避免同一场在两个月里各出现一次 */
          events: outside ? [] : this.events.filter(function (e) { return e.date === iso; })
        };
      },

      /* ---------------------------- 活动页：类型筛选视图 */
      /** 当前筛选对应的类型定义（全部活动时为 null） */
      get activeCategory() {
        var key = this.typeFilter;
        var hit = this.eventCategories.filter(function (c) { return c.key === key; });
        return hit.length ? hit[0] : null;
      },
      get activeCategoryEvents() {
        return this.typeFilter === "all" ? [] : this.eventsOfCategorySorted(this.typeFilter);
      },

      /* ------------------------------------------------------------------
       * 类型列表：搜索 + 分页（2026-11-17 需求，对齐邮箱那套控件）
       * 三类各自记住自己的关键词 / 每页条数 / 当前页，互不干扰；
       * 换关键词自动回到第 1 页，换每页条数同理。
       * ---------------------------------------------------------------- */
      listQuery: { summit: "", city: "", elite: "" },
      listSize: { summit: 20, city: 20, elite: 20 },
      listPage: { summit: 1, city: 1, elite: 1 },

      /**
       * 一类活动的行序：
       *   精英六人谈按「期号」数字倒序（用户明确要求按数字排，不看录入顺序）；
       *   期号相同的按日期新的在前；没有期号的专场排在最后。
       *   其余类型按日期倒序。
       * 上一版是按日期排，于是出现 45 期(9.22) 排在 46 期(9.18) 前面的错位。
       */
      categoryRows(key) {
        var list = this.eventsOfCategory(key).slice();
        if (key === "elite") {
          list.sort(function (a, b) {
            var na = typeof a.sessionNo === "number" ? a.sessionNo : -1;
            var nb = typeof b.sessionNo === "number" ? b.sessionNo : -1;
            if (na !== nb) return nb - na;
            return (a.date || "") > (b.date || "") ? -1 : ((a.date || "") < (b.date || "") ? 1 : 0);
          });
          return list;
        }
        list.sort(function (a, b) {
          return (a.date || "") > (b.date || "") ? -1 : ((a.date || "") < (b.date || "") ? 1 : 0);
        });
        return list;
      },
      /** 一行可被搜到的全部文字：标题、城市、日期、期号、场地、话题、议程、摘要 */
      searchBlob(event) {
        var parts = [
          event.title, event.city, event.dateText, event.venue, event.summary, event.theme,
          event.categoryLabel, event.status,
          event.sessionNo ? ("第 " + event.sessionNo + " 期") : "",
          event.sessionNo ? String(event.sessionNo) : ""
        ];
        (event.topics || []).forEach(function (t) { parts.push(t.title, t.desc); });
        (event.agendaDetail || []).forEach(function (a) { parts.push(a.time, a.text); });
        (event.agenda || []).forEach(function (a) { parts.push(String(a)); });
        (event.tags || []).forEach(function (t) { parts.push(String(t)); });
        return parts.filter(Boolean).join(" ").toLowerCase();
      },
      /** 按关键词过滤后的行（关键词为空时返回全部） */
      listRows(key) {
        var q = String((this.listQuery && this.listQuery[key]) || "").trim().toLowerCase();
        var rows = this.categoryRows(key);
        if (!q) return rows;
        var words = q.split(/\s+/).filter(Boolean);
        var self = this;
        return rows.filter(function (e) {
          var blob = self.searchBlob(e);
          return words.every(function (w) { return blob.indexOf(w) !== -1; });
        });
      },
      listTotal(key) { return this.listRows(key).length; },
      pageCount(key) {
        var size = Number((this.listSize && this.listSize[key]) || 20);
        return Math.max(1, Math.ceil(this.listTotal(key) / size));
      },
      currentPage(key) {
        var pc = this.pageCount(key);
        var p = Number((this.listPage && this.listPage[key]) || 1);
        return Math.min(Math.max(1, p), pc);
      },
      /** 当前页要渲染的行 */
      pageRows(key) {
        var size = Number((this.listSize && this.listSize[key]) || 20);
        var start = (this.currentPage(key) - 1) * size;
        return this.listRows(key).slice(start, start + size);
      },
      setQuery(key, value) {
        this.listQuery[key] = value;
        this.listPage[key] = 1;
      },
      setPage(key, page) {
        this.listPage[key] = Math.min(Math.max(1, Number(page) || 1), this.pageCount(key));
      },
      jumpPage(key, value) {
        this.setPage(key, value);
      },
      setSize(key, value) {
        this.listSize[key] = Number(value) || 20;
        this.listPage[key] = 1;
      },
      /** 页码按钮：首页、末页、当前页左右各 1 页，其余折叠成省略号 */
      pageNumbers(key) {
        var pc = this.pageCount(key);
        var cur = this.currentPage(key);
        var out = [];
        if (pc <= 7) {
          for (var i = 1; i <= pc; i += 1) out.push(i);
          return out;
        }
        out.push(1);
        var from = Math.max(2, cur - 1);
        var to = Math.min(pc - 1, cur + 1);
        if (from > 2) out.push("…");
        for (var j = from; j <= to; j += 1) out.push(j);
        if (to < pc - 1) out.push("…");
        out.push(pc);
        return out;
      },
      /** 搜索结果为空时的提示语里要用到当前关键词 */
      queryOf(key) { return String((this.listQuery && this.listQuery[key]) || "").trim(); },

      /**
       * 峰会卡片上的议程（2026-11-17）：
       * 案例集锦里的写法两种——「DAY 1：…」「上午：…」，还有一行单独的「03月27日（峰会日）」。
       * 这里统一拆成「日期 / 时段 / 内容」三列，日期按 DAY n 从活动首日往后推，
       * 于是左右两张卡的日期、时段、正文各占同样的三列，左边一律从 0 线起排。
       */
      summitAgenda(event) {
        var list = (event && event.agendaDetail) || [];
        var baseDate = String((event && event.date) || "");
        var fallback = (event && event.dateText) || (baseDate ? this.formatDate(baseDate) : "");
        var out = [];
        var self = this;
        list.forEach(function (item) {
          var text = String((item && item.text) || "").trim();
          if (!text) return;
          // 「03月27日（峰会日）」只是下面时段的日期抬头，不单独占一行
          if (/^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(text) && text.length <= 24) return;
          var m = /^DAY\s*(\d+)\s*[：:]\s*(.*)$/i.exec(text);
          if (m) {
            out.push({ date: self.dayLabel(baseDate, Number(m[1]) - 1), tag: "DAY " + m[1], text: m[2] });
            return;
          }
          m = /^(上午|下午|晚间|全天)\s*[：:]\s*(.*)$/.exec(text);
          if (m) { out.push({ date: fallback, tag: m[1], text: m[2] }); return; }
          out.push({ date: fallback, tag: "", text: text });
        });
        return out;
      },
      /** 活动首日往后 offset 天的「月.日」 */
      dayLabel(iso, offset) {
        if (!iso) return "";
        var d = new Date(iso + "T00:00:00");
        if (isNaN(d.getTime())) return "";
        d.setDate(d.getDate() + (Number(offset) || 0));
        return (d.getMonth() + 1) + "." + d.getDate();
      },
      /**
       * 分享嘉宾人数：以案例集锦「演讲嘉宾」名单的实到人数为准（speakerCount），
       * 没有该字段才退回 site 里的授权嘉宾 id 数量。
       */
      speakerCountOf(event) {
        if (!event) return 0;
        if (typeof event.speakerCount === "number") return event.speakerCount;
        return ((event && event.speakerIds) || []).length;
      },
      /**
       * 从 ?cat=summit 这类链接直接落到对应筛选（首页分类胶囊、外部转发都用它）。
       * 参数只认三类的 key，其余一律回到「全部活动」。
       */
      applyCatFromUrl() {
        var match = String((global.location && global.location.search) || "").match(/[?&]cat=([a-z]+)/);
        var key = match ? match[1] : "";
        if (["summit", "city", "elite"].indexOf(key) !== -1) this.typeFilter = key;
      },
      monthShortLabel(month) { return month + " 月"; },

      /* ---------------------------- 卡片/详情通用小工具 */
      /** 无头像时用的首字头像：中文取首字，英文取首字母 */
      initialOf(text) {
        var s = String(text || "").trim();
        if (!s) return "·";
        var first = s.charAt(0);
        if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
        return first;
      },
      avatarTone(text) {
        var s = String(text || "");
        var h = 0;
        for (var i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 5;
        return "tone-" + (h + 1);
      },
      /** 一行信息：把「主题口号 / 参会人员 / 活动形式」分行加冒号呈现（11-06 明确要求） */
      infoRows(event) {
        if (!event) return [];
        var rows = [];
        var theme = event.theme || "";
        var bare = function (x) { return String(x || "").replace(/[\s——\-—：:，,。、·]/g, ""); };
        // 主题口号与标题几乎一样时不重复第二遍（案例集锦里多处「活动主题」就是标题原文）
        if (theme && bare(theme) === bare(event.title)) theme = "";
        if (theme && bare(event.title).indexOf(bare(theme)) === 0 && bare(theme).length >= bare(event.title).length * 0.8) theme = "";
        if (theme) rows.push({ k: "主题口号", v: theme });
        var aud = this.audienceText(event);
        if (aud) rows.push({ k: "参会人员", v: aud });
        var form = (event.agendaDetail || []).map(function (a) { return a.text; }).filter(Boolean);
        if (form.length && event.category === "summit") rows.push({ k: "活动形式", v: form.join("；") });
        return rows;
      },
      agendaRows(event) {
        var list = (event && event.agendaDetail) || [];
        if (list.length) return list;
        return ((event && event.agenda) || []).map(function (t) { return { time: "", text: t }; });
      },
      topicsOf(event) { return (event && event.topics) || []; },
      attendeesOf(event) { return (event && event.attendees) || []; },
      /** 卡片上的嘉宾：优先已授权演讲嘉宾，其次文档里的参会名单 */
      cardSpeakers(event) {
        var ids = (event && event.speakerIds) || [];
        if (!ids.length) return [];
        var self = this;
        return this.speakers.filter(function (s) { return ids.indexOf(s.id) !== -1; })
          .map(function (s) { return { id: s.id, name: self.speakerDisplayName(s), company: s.company || "", jobTitle: s.jobTitle || "" }; });
      },
      /** 适用人群文案：把「50人」「15-20人」这类纯规模串排除，规模另有一行，避免两行重复 */
      audienceText(event) {
        var a = String((event && event.audience) || "").trim();
        if (!a) return "";
        // 对外不写「约 / 左右 / 大概」：模糊前缀一律去掉，规模另有确切数字
        a = a.replace(/[，,、]?\s*(总参会人数|参会人数|规模)?\s*约?\s*\d+\s*人(左右|上下|余)?\s*$/g, "").replace(/约|左右|大概|预计/g, "").trim();
        // 「15-20人」被上面剥掉尾段后会只剩「15-」，这种半截规模串同样不能上卡片
        a = a.replace(/[\-—–~～]\s*$/, "").trim();
        if (!a) return "";
        if (/^(约?\s*\d+\s*(-\s*\d+)?\s*人|规模\s*\d+\s*人|约?\s*\d+\s*[\-—–~～]\s*\d*|\d+)$/.test(a)) return "";
        return a;
      },
      cardPeopleNote(event) {
        var orgs = {};
        (event && event.attendees || []).forEach(function (p) { if (p.org) orgs[p.org] = true; });
        var n = Object.keys(orgs).length;
        if (n) return "等 " + n + " 家参会企业";
        var sp = this.cardSpeakers(event).length;
        return sp ? sp + " 位分享嘉宾" : "";
      },
      photoWall(event) { return (event && event.gallery) || []; },
      /** 图位是否有真实素材（现场照或运营给的活动海报），没有就退回排版 KV，绝不放模块插画假装现场 */
      hasMedia(event) { return !!(event && (event.photoCount > 0 || event.poster)); },
      /**
       * KV 卡上的短标题：没有真实现场图时，图片位上放排版 KV。
       * 这里只取主题口号那一段（—— / ：之前），避免和卡正文的完整标题重复两遍。
       */
      kvTitle(event) {
        var t = String((event && event.title) || "");
        var short = t.split(/——|—|：|:/)[0].trim();
        return short || t;
      },
      /** 关键数字（详情页顶部） */
      keyNumbers(event) {
        if (!event) return [];
        var out = [];
        var exp = event.scale && event.scale.expected && event.scale.expected.value;
        if (exp) out.push({ v: exp + " 人", k: "活动规模" });
        if (event.city) out.push({ v: event.city, k: "举办城市" });
        if ((event.topics || []).length) out.push({ v: event.topics.length + " 个", k: "讨论话题" });
        if ((event.attendees || []).length) out.push({ v: event.attendees.length + " 家", k: "参会企业" });
        return out.slice(0, 4);
      },

      get filteredEvents() {
        return this.typeFilter === "all" ? this.events : this.events.filter((e) => e.type === this.typeFilter);
      },
      get upcomingFilteredEvents() {
        return this.filteredEvents.filter((e) => this.isUpcoming(e));
      },
      upcomingEventsByType(type) {
        return this.events
          .filter((e) => e.type === type)
          .filter((e) => this.isUpcoming(e))
          .sort((a, b) => new Date(a.date) - new Date(b.date));
      },
      archivedEventsByType(type, limit) {
        limit = limit || 4;
        return this.events
          .filter((e) => e.type === type)
          .filter((e) => !this.isUpcoming(e))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit);
      },
      get archivedEventGroups() {
        if (this.typeFilter === "all") return [];
        var cutoff = archiveCutoffYear;
        var archived = this.filteredEvents
          .filter((e) => !this.isUpcoming(e))
          .filter((e) => Number((e.date || "").slice(0, 4)) >= cutoff)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        var groups = [];
        archived.forEach(function (event) {
          var year = (event.date || "").slice(0, 4);
          var group = groups.filter((g) => g.year === year)[0];
          if (!group) { group = { year: year, events: [] }; groups.push(group); }
          group.events.push(event);
        });
        return groups;
      },

      get calendarEvents() {
        return this.events.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      },
      get upcomingEvents() {
        return this.calendarEvents.filter((e) => this.isUpcoming(e));
      },

      // ------------------------------------------------------ 详情页
      get currentEvent() {
        var params = new URLSearchParams(global.location.search);
        var id = params.get("id");
        return this.events.filter((e) => e.id === id)[0] || this.events[0] || defaultEvent;
      },
      get currentEventSpeakers() {
        var ids = this.currentEvent.speakerIds || [];
        if (!ids.length) return [];
        return this.speakers.filter((s) => ids.indexOf(s.id) !== -1);
      },
      get currentEventOrganizations() {
        var ids = (this.currentEvent.organizationIds || []).concat(this.currentEvent.organizerOrgId ? [this.currentEvent.organizerOrgId] : []);
        if (!ids.length) return [];
        return this.organizations.filter((o) => ids.indexOf(o.id) !== -1);
      },

      // ------------------------------------------------------ 日历
      calendarCursor: parts.year + "-" + parts.month + "-01",
      get calendarTitle() {
        var loc = (document.documentElement.lang || "").toLowerCase() === "en" ? "en-US" : "zh-CN";
        return new Intl.DateTimeFormat(loc, { year: "numeric", month: "long" }).format(new Date(this.calendarCursor));
      },
      get monthDays() {
        var cursor = new Date(this.calendarCursor);
        var year = cursor.getFullYear();
        var month = cursor.getMonth();
        var startOffset = new Date(year, month, 1).getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var cells = [];
        for (var i = 0; i < startOffset; i += 1) cells.push({ blank: true, key: "blank-" + i });
        for (var day = 1; day <= daysInMonth; day += 1) {
          var iso = this.toISODate(new Date(year, month, day));
          cells.push({
            blank: false, key: iso, day: day, iso: iso,
            events: this.events.filter((e) => e.date === iso)
          });
        }
        return cells;
      },
      toISODate(date) {
        return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
      },
      changeMonth(direction) {
        var cursor = new Date(this.calendarCursor);
        cursor.setMonth(cursor.getMonth() + direction);
        cursor.setDate(1);
        this.calendarCursor = this.toISODate(cursor);
      },

      /**
       * 活动详情页注入 Event 结构化数据，便于搜索引擎理解活动时间地点。
       * 只输出 publishStatus=published 且日期完整的数据。
       */
      injectStructuredData() {
        if (this.page !== "detail" || !global.document) return;
        var event = this.currentEvent;
        if (!event || !event.id || !event.date) return;
        var org = (this.organizations || []).filter((o) => o.id === event.organizerOrgId)[0];
        var data = {
          "@context": "https://schema.org",
          "@type": "Event",
          name: event.title,
          startDate: event.date,
          eventStatus: !this.isUpcoming(event)
            ? "https://schema.org/EventScheduled"
            : "https://schema.org/EventScheduled",
          location: {
            "@type": "Place",
            name: event.venue || event.city,
            address: { "@type": "PostalAddress", addressLocality: event.city || "" }
          },
          description: event.summary || "",
          organizer: {
            "@type": "Organization",
            name: org ? org.name : "数创时代 DSG",
            url: global.location.origin
          }
        };
        var scale = event.scale || {};
        if (scale.expected && scale.expected.value != null && scale.expected.status !== "pending") {
          data.maximumAttendeeCapacity = scale.expected.value;
        }
        var script = document.createElement("script");
        script.type = "application/ld+json";
        script.text = JSON.stringify(data);
        document.head.appendChild(script);
      },

      // ------------------------------------------------------ 展示辅助
      formatDate(date) {
        var loc = (document.documentElement.lang || "").toLowerCase() === "en" ? "en-US" : "zh-CN";
        return new Intl.DateTimeFormat(loc, { month: "long", day: "numeric", weekday: "short" }).format(new Date(date));
      },
      eventDateLabel(event) { return event.dateText || this.formatDate(event.date); },
      eventDetailUrl(event) {
        var page = document.documentElement.lang === "en" ? "event-detail-en.html" : "event-detail.html";
        return page + "?id=" + encodeURIComponent(event.id);
      },
      /**
       * 标题断行（2026-11-12 需求）：按语义断句，不在词中间腰断。
       * 一级断点（一定断）：冒号留在上行末；破折号「——」、「暨」随下行开头。
       * 二级断点（一行太长时才断）：「·」「与」「和」「及」「、」，
       *   连接词随下行，避免出现"…供应链创 / 新与可持续…"这种把词拆开的折行。
       *   第四届 DSG 金融领袖峰会暨苏州农商行社区金融游学研讨会
       *   → 第四届 DSG 金融领袖峰会 / 暨苏州农商行社区金融游学研讨会
       *   第三届 DSG 全球供应链创新与可持续发展高峰论坛
       *   → 第三届 DSG 全球供应链创新 / 与可持续发展高峰论坛
       */
      titleLines(title, maxLines) {
        var text = String(title == null ? "" : title).trim();
        if (!text) return [];
        var limit = maxLines || 3;
        var lines = [];
        var buf = "";
        var push = function () {
          if (buf.trim()) lines.push(buf.trim());
          buf = "";
        };
        for (var i = 0; i < text.length; i += 1) {
          var ch = text.charAt(i);
          if (ch === "：" || ch === ":") {
            buf += ch;
            push();
            continue;
          }
          if (ch === "—" && text.charAt(i + 1) === "—") {
            push();
            buf = "——";
            i += 1;
            continue;
          }
          if (ch === "暨" && buf.trim().length >= 4) {
            push();
            buf = "暨";
            continue;
          }
          buf += ch;
        }
        push();

        // 二级断点：某一行仍然过长（>16 字）时，在并列连词处再断一次
        var secondary = ["·", "与", "和", "及", "、"];
        var refined = [];
        lines.forEach(function (line, idx) {
          // 副标行（「暨」「——」开头）不做二次切分：它已经是小字说明，
          // 再按并列连词切只会碎成三段，反而更乱。
          if (idx > 0 && /^(暨|——)/.test(line)) { refined.push(line); return; }
          if (line.length <= 16) { refined.push(line); return; }
          var best = -1;
          var bestScore = Infinity;
          for (var c = 0; c < secondary.length; c += 1) {
            var key = secondary[c];
            for (var p = line.indexOf(key, 6); p !== -1; p = line.indexOf(key, p + 1)) {
              var right = line.length - p;
              if (right < 5) continue;
              var score = Math.abs(p - line.length / 2);
              if (score < bestScore) { bestScore = score; best = p; }
            }
          }
          if (best > 0) {
            refined.push(line.slice(0, best).trim());
            refined.push(line.slice(best).trim());
          } else {
            refined.push(line);
          }
        });
        lines = refined;
        // 超出上限的碎行并回最后一行，避免卡片里冒出第四行
        if (lines.length > limit) {
          lines = lines.slice(0, limit - 1).concat([lines.slice(limit - 1).join("")]);
        }
        return lines;
      },
      titleHtml(title, maxLines) {
        var escape = function (s) {
          return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        };
        var lines = this.titleLines(title, maxLines);
        // 副标判定（2026-11-12 晚，D 方案）：标题被「暨 / —— / 冒号」切出来的那一段
        // 是协办说明或说明句，不是标题续文，降一号转黑体；被并列连词切出来的续行不算。
        // 关键：一旦第二行是副标，后面所有行都跟着是副标 —— 否则同一句说明会被
        // 拆成「前一半灰小字、后一半黑大字」，比不拆更乱。
        var subFrom = -1;
        if (lines.length > 1) {
          var isSub = /^(暨|——)/.test(lines[1]) || /[：:]\s*$/.test(lines[0]);
          if (isSub) subFrom = 1;
        }
        return lines.map(function (line, i) {
          var cls = "title-line";
          var text = line;
          if (subFrom > 0 && i >= subFrom) {
            cls += " title-sub";
            // 副标不要带着破折号起头：断行后「——2026 …」看着像正文，不像副标
            text = line.replace(/^[—\-]{1,2}\s*/, "");
          }
          return '<span class="' + cls + '">' + escape(text) + "</span>";
        }).join("");
      },
      /**
       * 卡片事实行（2026-11-12 晚）：
       * 起因是首页三张卡里第一张写「主题口号：」、第二张写「主题：」、第三张什么都不写，
       * 同一行位置三种说法，读者不知道这行到底是什么；而且它是自由文本，三张卡左边怎么也对不齐。
       * 现在统一由数据拼出「主题 / 参会 / 形式」三行，标签永远相同，值永远从同一列起步。
       * 取值只用已有字段，不编造：
       *   主题 → summary 里自带的「主题口号：/主题：」＞标题「——」前的口号＞summary 首句
       *   参会 → summary 里的「参会人员…」句＞规模字段「预计 N 人」
       *   形式 → agenda 数组（全天峰会 / 闭门思想会 / 实地游学）
       */
      /**
       * 详情页导语（2026-11-12 晚）：
       * 段首的「主题口号：」「活动主题：」是录入时手写的标签，卡片里已经拆成标签列，
       * 详情页作为一段导语不该再带这个前缀——读者不需要被告知"这段是主题口号"。
       * 只剥前缀，正文一字不改。
       */
      summaryText(event) {
        var s0 = String((event && event.summary) || "").trim();
        if (!s0) return "";
        var stripped = s0.replace(/^(?:主题口号|活动主题|主题|Theme|Topic)\s*[：:]\s*/, "").trim();
        return stripped || s0;
      },
      eventFacts(event) {
        var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
        var summary = String((event && event.summary) || "").trim();
        var title = String((event && event.title) || "").trim();
        var cut = function (s, n) {
          s = String(s || "").trim().replace(/^[，,、。；;：:\s]+/, "");
          if (s.length <= n) return s;
          return s.slice(0, n).replace(/[、，,\s]+$/, "") + "…";
        };

        // 主题
        var theme = "";
        var m = summary.match(/^(?:主题口号|活动主题|主题)\s*[：:]\s*([^。；;]+)/);
        if (m) theme = m[1];
        if (!theme && title.indexOf("——") > 0) theme = title.split("——")[0];
        if (!theme) theme = summary.split(/[。；;]/)[0];

        // 参会
        var audience = "";
        var a = summary.match(/参会(?:人员|嘉宾|代表)?\s*(?:覆盖|包括|为)?\s*[：:]?\s*([^。；;]+)/);
        if (a) audience = a[1];
        var scaleValue = event && event.scale && event.scale.expected && event.scale.expected.value;

        // 形式
        var agenda = Array.isArray(event && event.agenda) ? event.agenda.filter(Boolean) : [];

        var facts = [
          { k: isEn ? "Theme" : "主题", v: cut(theme, isEn ? 90 : 34) },
          { k: isEn ? "Who" : "参会", v: audience ? cut(audience, isEn ? 90 : 30) : (scaleValue ? (isEn ? "~" + scaleValue + " attendees" : "预计 " + scaleValue + " 人") : "") },
          { k: isEn ? "Format" : "形式", v: agenda.length ? cut(agenda.join(" / "), isEn ? 90 : 34) : "" }
        ];
        return facts.filter(function (f) { return f.v; });
      },
      isUpcoming(event) {
        return !((event.date || "") < chinaToday);
      },
      eventPhaseLabel(event) {
        var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
        var ended = (event.date || "") < chinaToday;
        return isEn ? (ended ? "Archived" : "Upcoming") : (ended ? "已结束" : "未开始");
      },

      /** 规模文案：只显示有口径的数字，pending 返回空串 */
      scaleText(event) {
        var scale = (event && event.scale) || {};
        var isEn = (document.documentElement.lang || "").toLowerCase() === "en";
        var unit = isEn ? "people" : "人";
        var expected = metricText(scale.expected, unit);
        // 已报名只在核过后才显示：早期把估算值当已报名写上去，读起来像真实签到数，会误导
        var registered = ((scale.registered || {}).status === "verified") ? metricText(scale.registered, unit) : "";
        if (!expected) return "";
        return registered ? expected + " · 已报名 " + registered : expected;
      },
      /** 剩余席位文案，无口径时返回空串（避免渲染 "剩余 null 席"） */
      seatsText(event) {
        var scale = (event && event.scale) || {};
        var expected = (scale.expected || {}).value;
        var registered = (scale.registered || {}).value;
        if (expected == null || registered == null) return "";
        return "剩余 " + Math.max(expected - registered, 0) + " 席";
      },
      metricText(metric, unit) { return metricText(metric, unit); },
      /** 未授权嘉宾只显示姓氏 + 公司，不显示实名与头像 */
      speakerDisplayName(speaker) {
        if (!speaker) return "";
        var lic = (speaker.license || {}).status;
        if (lic === "owned" || lic === "licensed") return speaker.name;
        return (speaker.name || "").slice(0, 1) + "先生/女士";
      },
      speakerPortrait(speaker) {
        if (!speaker) return null;
        var lic = (speaker.license || {}).status;
        return (lic === "owned" || lic === "licensed") ? speaker.portrait : null;
      },
      /** 无真人头像时取姓名首字做色块占位，不伪造人脸照片 */
      avatarInitial(speaker) {
        var name = this.speakerDisplayName(speaker) || (speaker && speaker.name) || "";
        return (String(name).trim().charAt(0) || "?").toUpperCase();
      },

      // ------------------------------------------------------ 表单
      openRegistration(event) {
        this.selectedEvent = event;
        this.formState = { submitting: false, errors: {}, message: "", ok: false };
        document.body.classList.add("modal-open");
      },
      closeRegistration() {
        this.selectedEvent = null;
        document.body.classList.remove("modal-open");
      },
      openVideo(label) {
        this.selectedVideo = label;
        document.body.classList.add("modal-open");
      },
      closeVideo() {
        this.selectedVideo = null;
        document.body.classList.remove("modal-open");
      },
      /**
       * 统一提交入口：调用 DSGForms 做验证 / 防垃圾 / 保存 / 通知。
       * 模板里写成 @submit.prevent="submitRegistration($event)"。
       */
      submitRegistration(submitEvent) {
        var form = submitEvent && submitEvent.target ? submitEvent.target : null;
        var event = this.selectedEvent || this.currentEvent;
        if (!form || !global.DSGForms) return;
        this.formState.submitting = true;
        this.formState.errors = {};
        this.formState.message = "";
        global.DSGForms.submitForm(form, { eventId: event && event.id }).then((result) => {
          this.formState.submitting = false;
          if (!result.ok && result.errors) {
            this.formState.errors = result.errors;
            return;
          }
          this.formState.ok = true;
          this.formState.message = "已收到，我们会在 1 个工作日内与你联系。";
          form.reset();
          setTimeout(() => this.closeRegistration(), 1200);
        });
      }
    };
  };
})(window);
