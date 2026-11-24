function dsgAdmin() {
  const storageKey = "dsg-admin-drafts-v1";
  const rolesKey = "dsg-admin-roles-v1";
  const defaultRoles = [
    // 角色权限矩阵（谁负责什么板块）：
    // - 超级管理员：全部模块
    // - 业务管理员：供应链AI创新专区 + 线索管理（商务向）
    // - 会议管理员：会议管理
    // - 行业洞察管理员：行业洞察
    // - 供应链AI管理员：供应链AI创新专区
    // locked 角色的权限以本矩阵为准，任何本地旧数据都不得覆盖
    { id: "super-admin", name: "超级管理员", locked: true, permissions: ["dashboard", "content", "appearance", "events", "ai", "insights", "leads", "permissions"], scope: "全部模块，含页面内容、外观设置、权限授权与线索管理" },
    { id: "business-admin", name: "业务管理员", locked: true, permissions: ["dashboard", "ai", "leads"], scope: "供应链AI创新专区 + 线索管理" },
    { id: "events-admin", name: "会议管理员", locked: true, permissions: ["dashboard", "events"], scope: "会议管理（峰会/城市会议/精英六人谈）" },
    { id: "insights-admin", name: "行业洞察管理员", locked: true, permissions: ["dashboard", "insights"], scope: "行业洞察（文章/视频/纪要）" },
    { id: "ai-admin", name: "供应链AI管理员", locked: true, permissions: ["dashboard", "ai"], scope: "供应链AI创新专区" }
  ];

  return {
    session: { active: false, roleId: "super-admin" },
    loginRole: "super-admin",
    password: "",
    loginError: "",
    activeModule: "dashboard",
    dataError: false,
    saveState: "草稿自动保存在本机浏览器",
    modules: [
      { id: "content", name: "页面内容", description: "13 个页面的文案、图片、按钮文字与链接，改完即影响前台" },
      { id: "appearance", name: "外观设置", description: "字号倍率、区块留白、内容宽度、圆角与主色，控制全站排版" },
      { id: "events", name: "会议管理", description: "年度峰会、城市沙龙、精英六人谈的增删改查与发布状态" },
      { id: "ai", name: "供应链AI创新专区", description: "AI 解决方案案例、应用场景、视频与 Demo 入口" },
      { id: "insights", name: "行业洞察", description: "文章、视频回放、白皮书、闭门纪要" },
      { id: "leads", name: "线索管理", description: "查看、导出与清理由前台表单提交的线索（受限数据）" },
      { id: "permissions", name: "权限授权", description: "为不同角色分配可管理模块" }
    ],
    roles: [],
    leads: [],
    source: { events: [], aiCases: [], insights: [] },
    draft: { events: [], aiCases: [], insights: [] },
    // —— 页面内容 / 外观设置 ——
    blocks: { data: null, dataEn: null, lang: "zh", page: "home", filter: "", dirty: false },
    theme: { data: null, draft: null, dirty: false },
    selected: { events: null, ai: null, insights: null, role: null },
    filters: { events: "", ai: "", insights: "", leads: "" },
    eventTypeFilter: "all",
    // —— 发布通道（local / github / readonly）——
    publish: { mode: "unknown", busy: false, commit: "", at: "", repo: "Assiduous-Insidious11/dsg-website", branch: "main", server: null },
    ghToken: "",
    publishMessage: "",

    get currentRole() {
      return this.roles.find((role) => role.id === this.session.roleId) || this.roles[0] || defaultRoles[0];
    },
    // 侧边栏菜单：标记每个模块对当前角色是否可访问
    get navModules() {
      const labels = {
        content: "页面内容",
        appearance: "外观设置",
        events: "会议管理",
        ai: "供应链AI创新专区",
        insights: "行业洞察",
        leads: "线索管理",
        permissions: "权限授权"
      };
      return Object.keys(labels).map((id) => ({
        id,
        label: labels[id],
        accessible: this.can(id)
      }));
    },
    // 权限矩阵用：角色是否拥有某模块（超级管理员恒有）
    roleHas(role, moduleId) {
      if (moduleId === "dashboard") return true;
      if (role && role.id === "super-admin") return true;
      return !!(role && Array.isArray(role.permissions) && role.permissions.includes(moduleId));
    },
    get moduleTitle() {
      const titles = {
        dashboard: "内容与权限总览",
        content: "页面内容（文案、图片与链接）",
        appearance: "外观设置（版式与配色）",
        events: "会议管理",
        ai: "供应链AI创新专区管理",
        insights: "行业洞察管理",
        leads: "线索管理（受限数据）",
        permissions: "管理员权限授权"
      };
      return titles[this.activeModule] || "管理后台";
    },
    get filteredEvents() {
      const query = this.filters.events.trim().toLowerCase();
      return this.draft.events
        .filter((event) => this.eventTypeFilter === "all" || event.type === this.eventTypeFilter)
        .filter((event) => this.matches(event, query, ["title", "city", "status", "eyebrow", "summary"]));
    },
    get filteredAiCases() {
      const query = this.filters.ai.trim().toLowerCase();
      return this.draft.aiCases.filter((item) => this.matches(item, query, ["title", "industry", "product", "pain", "value"]));
    },
    get filteredInsights() {
      const query = this.filters.insights.trim().toLowerCase();
      return this.draft.insights.filter((item) => this.matches(item, query, ["title", "type", "date", "summary"]));
    },
    get filteredLeads() {
      const query = this.filters.leads.trim().toLowerCase();
      if (!query) return this.leads;
      return this.leads.filter((item) => this.matches(item, query, ["name", "company", "email", "phone"]));
    },

    async init() {
      this.roles = this.loadRoles();
      await this.loadContent();
      await this.loadBlocks();
      await this.loadTheme();
      try { this.ghToken = localStorage.getItem("dsg-gh-token") || ""; } catch (err) { /* 隐私模式忽略 */ }
      this.detectChannel();
      const savedSession = this.readJson("dsg-admin-session-v1", null);
      if (savedSession?.active) {
        // 旧会话角色可能已被新矩阵替换/移除，强制校正到当前矩阵中的角色
        const roleExists = this.roles.some((r) => r.id === savedSession.roleId);
        if (roleExists) {
          this.session = savedSession;
          this.loginRole = savedSession.roleId;
        } else {
          // 角色已不存在（如旧版仅 super-admin/events-admin），回退到超级管理员并清除旧会话
          this.session = { active: true, roleId: "super-admin" };
          this.loginRole = "super-admin";
          try { localStorage.removeItem("dsg-admin-session-v1"); } catch (e) { /* ignore */ }
        }
      }
    },
    // 本机已存的角色配置不会自动获得新增模块，这里做一次性补齐：
    // 线索属受限数据，仅补进超级管理员，不影响其他角色的人工授权结果
    loadRoles() {
      const stored = this.readJson(rolesKey, null);
      if (!stored || !Array.isArray(stored)) return this.clone(defaultRoles);
      let changed = false;
      // locked（内置）角色：权限永远以 defaultRoles 矩阵为准，
      // 本地旧数据可能缺模块/权限不全，必须强制合并补齐。
      const merged = stored.map((role) => {
        const def = defaultRoles.find((d) => d.id === role.id);
        if (def && role.locked) {
          if (JSON.stringify(role.permissions) !== JSON.stringify(def.permissions) || role.scope !== def.scope) {
            role.permissions = this.clone(def.permissions);
            role.scope = def.scope;
            changed = true;
          }
          return role;
        }
        return role;
      });
      // 默认矩阵里有、本地缺失的内置角色也要补回（如业务管理员）
      defaultRoles.forEach((def) => {
        if (def.locked && !merged.some((r) => r.id === def.id)) {
          merged.push(this.clone(def));
          changed = true;
        }
      });
      // 清理：不在新矩阵里的旧角色（如旧版残留）直接移除，避免登录下拉出现"僵尸角色"
      const validIds = defaultRoles.map((d) => d.id);
      const filtered = merged.filter((r) => validIds.indexOf(r.id) !== -1);
      if (filtered.length !== merged.length) {
        merged.length = 0;
        merged.push.apply(merged, filtered);
        changed = true;
      }
      if (changed) {
        try { localStorage.setItem(rolesKey, JSON.stringify(merged)); } catch (error) { /* 隐私模式下忽略 */ }
      }
      return merged;
    },
    async loadContent() {
      try {
        const [events, aiCases, insights] = await Promise.all([
          this.fetchJson("content/events.json"),
          this.fetchJson("content/ai-cases.json"),
          this.fetchJson("content/articles.json")
        ]);
        // 后台编辑沿用 image 字段，保存时再映射回内容层的 heroImage
        events.forEach((event) => { if (!event.image) event.image = event.heroImage; });
        this.source = { events, aiCases, insights };
      } catch (error) {
        console.error("Admin content load failed", error);
        this.dataError = true;
      }
      this.refreshLeads();
      const stored = this.readJson(storageKey, null);
      this.draft = stored ? stored : this.clone(this.source);
      ["events", "aiCases", "insights"].forEach((k) => {
        if (Array.isArray(this.draft[k])) this.draft[k] = this.draft[k].filter((x) => x && typeof x === "object");
      });
      if (!this.draft.events) this.draft.events = [];
      if (!this.draft.aiCases) this.draft.aiCases = [];
      if (!this.draft.insights) this.draft.insights = [];
    },
    async fetchJson(url) {
      try {
        const response = await fetch(`${url}?v=20260906-content1`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        return await response.json();
      } catch (err) {
        const key = url.split("/").pop().replace(".json", "");
        if (window.DSG_EMBEDDED && window.DSG_EMBEDDED[key]) return window.DSG_EMBEDDED[key];
        throw err;
      }
    },

    // ---------------------------------------------------------- 线索（受限数据）
    refreshLeads() {
      this.leads = window.DSGForms ? window.DSGForms.queue() : [];
    },
    exportLeads() {
      if (!window.DSGForms) return;
      const csv = window.DSGForms.exportQueue();
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `dsg-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      this.saveState = `已导出 ${this.leads.length} 条线索 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    },
    clearLeads() {
      if (!confirm("确认清空线索队列？请先完成导出，清空后不可恢复。")) return;
      if (window.DSGForms) window.DSGForms.clearQueue();
      this.refreshLeads();
      this.saveState = "线索队列已清空";
    },
    login() {
      // Demo 登录校验：演示账号 admin / DSG2026；真实上线替换为服务端认证
      const demoAccount = { username: "admin", password: "DSG2026" };
      if (this.password !== demoAccount.password) {
        this.loginError = "密码错误，无法进入后台（演示账号：admin / DSG2026）";
        this.password = "";
        return;
      }
      this.loginError = "";
      this.session = { active: true, roleId: this.loginRole };
      localStorage.setItem("dsg-admin-session-v1", JSON.stringify(this.session));
      this.activeModule = "dashboard";
      this.password = "";
    },
    logout() {
      this.session = { active: false, roleId: "super-admin" };
      localStorage.removeItem("dsg-admin-session-v1");
    },
    // ==================================================== 发布（真链路）
    // 三种通道：
    //   local    本机发布服务（tools/admin_server.py）：写文件 + git 提交 + 推 GitHub，最可靠
    //   github   线上后台 + GitHub 令牌：直接调 Contents API 改仓库，适合不在本机时用
    //   readonly 线上只读（既没有本机服务、也没有令牌）：只能改草稿，不会上线
    async detectChannel() {
      // 先按地址给个初值：线上公开地址默认"只读"，本机地址等探测结果，
      // 免得状态标在探测完成前一直显示"检测中"。
      const isLocalHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
      if (!isLocalHost) this.publish.mode = this.ghToken ? "github" : "readonly";
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (d && d.mode === "local") {
            this.publish.mode = "local";
            this.publish.server = d;
            return;
          }
        }
      } catch (err) { /* 线上没有这个接口，正常 */ }
      if (this.publish.mode === "unknown") this.publish.mode = this.ghToken ? "github" : "readonly";
    },
    get publishModeLabel() {
      return { local: "本机直连（可发布）", github: "GitHub 令牌（可发布）", readonly: "线上只读", unknown: "检测中…" }[this.publish.mode] || "检测中…";
    },
    saveGhToken(value) {
      this.ghToken = (value || "").trim();
      try {
        if (this.ghToken) localStorage.setItem("dsg-gh-token", this.ghToken);
        else localStorage.removeItem("dsg-gh-token");
      } catch (err) { /* 隐私模式忽略 */ }
      this.detectChannel();
      this.saveState = this.ghToken ? "已保存 GitHub 令牌，可在线发布" : "已清除令牌";
    },
    // 把后台草稿整理成"要写进内容层"的四份文件
    buildPayload() {
      const events = (this.draft.events || []).map((event) => {
        const copy = JSON.parse(JSON.stringify(event));
        if (copy.image) copy.heroImage = copy.image;
        delete copy.image;
        return copy;
      });
      return {
        events,
        aiCases: this.draft.aiCases || [],
        insights: this.draft.insights || [],
        pageBlocks: this.blocks.data || null,
        pageBlocksEn: this.blocks.dataEn || null,
        message: this.publishMessage || ""
      };
    },
    async publishToFrontend() {
      if (this.publish.busy) return;
      const payload = this.buildPayload();
      if (!payload.events.length) {
        this.saveState = "没有可发布的活动数据，请先新增或恢复内容";
        return;
      }
      this.publish.busy = true;
      this.saveState = "正在发布…";
      try {
        if (this.publish.mode === "unknown") await this.detectChannel();
        if (this.publish.mode === "local") return await this.publishLocal(payload);
        if (this.publish.mode === "github") return await this.publishGithub(payload);
        this.saveState = "当前是线上只读版：请在本机双击「启动后台.bat」打开后台后再发布";
      } catch (err) {
        this.saveState = "发布失败：" + (err && err.message ? err.message : err);
      } finally {
        this.publish.busy = false;
      }
    },
    async publishLocal(payload) {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) {
        this.saveState = "发布失败：" + (d.error || "服务返回异常") + (d.tail ? " / " + d.tail.join(" ") : "");
        return;
      }
      // 真数据已经落到文件里，本机演示快照要清掉，避免前台读到旧快照
      try { localStorage.removeItem("dsg-demo-published-v1"); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
      this.publish.commit = d.commit || "";
      this.publish.at = new Date().toLocaleString("zh-CN", { hour12: false });
      if (d.changed === false) {
        this.saveState = "内容与线上一致，没有需要发布的变化";
        return;
      }
      this.saveState = `已推送上线（提交 ${d.commit}）：${d.files.length} 个数据文件，约 1 分钟后全网可见`;
    },
    b64(text) {
      const bytes = new TextEncoder().encode(text);
      let bin = "";
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      return btoa(bin);
    },
    async ghApi(path, options) {
      const res = await fetch("https://api.github.com/repos/" + this.publish.repo + path, Object.assign({
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": "Bearer " + this.ghToken,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }, options || {}));
      return res;
    },
    async publishGithub(payload) {
      const branch = this.publish.branch;
      const files = [
        ["content/events.json", payload.events],
        ["content/ai-cases.json", payload.aiCases],
        ["content/articles.json", payload.insights],
        ["content/page-blocks.json", payload.pageBlocks],
        ["content-en/page-blocks.json", payload.pageBlocksEn]
      ].filter((f) => f[1]);
      let last = "";
      for (const [path, data] of files) {
        const head = await this.ghApi("/contents/" + path + "?ref=" + branch);
        let sha = null;
        if (head.status === 200) {
          const meta = await head.json();
          sha = meta.sha;
        } else if (head.status !== 404) {
          throw new Error("读取 " + path + " 失败（" + head.status + "），请检查令牌权限");
        }
        const body = {
          message: (payload.message || "后台发布内容更新") + " · " + path,
          content: this.b64(JSON.stringify(data, null, 2) + "\n"),
          branch: branch
        };
        if (sha) body.sha = sha;
        const put = await this.ghApi("/contents/" + path, {
          method: "PUT",
          headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + this.ghToken,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28"
          },
          body: JSON.stringify(body)
        });
        if (!put.ok) {
          const err = await put.json().catch(() => ({}));
          throw new Error("写入 " + path + " 失败（" + put.status + " " + (err.message || "") + "）");
        }
        const out = await put.json();
        last = out.commit && out.commit.sha ? out.commit.sha.slice(0, 7) : last;
      }
      this.publish.commit = last;
      this.publish.at = new Date().toLocaleString("zh-CN", { hour12: false });
      this.saveState = `已通过 GitHub 发布（提交 ${last}）：约 1 分钟后全网可见`;
    },
    can(moduleId) {
      if (moduleId === "dashboard") return true;
      const role = this.currentRole;
      if (!role || !Array.isArray(role.permissions)) return false;
      // 超级管理员：全部模块可用，永不灰
      if (role.id === "super-admin") return true;
      return role.permissions.includes(moduleId);
    },
    matches(item, query, fields) {
      if (!query) return true;
      return fields.some((field) => String(item[field] || "").toLowerCase().includes(query));
    },
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },
    readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : this.clone(fallback);
      } catch {
        return this.clone(fallback);
      }
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify(this.draft));
      localStorage.setItem(rolesKey, JSON.stringify(this.roles));
      this.saveState = `已保存草稿 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    },
    resetDrafts() {
      if (!confirm("确认清空本机草稿并恢复 data/*.json 的内容？")) return;
      localStorage.removeItem(storageKey);
      this.draft = this.clone(this.source);
      this.selected = { events: null, ai: null, insights: null, role: null };
      this.saveState = "已恢复数据文件内容";
    },
    joinList(list) {
      return Array.isArray(list) ? list.join("，") : "";
    },
    splitList(value) {
      return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    },

    newEvent() {
      const today = new Date();
      const iso = today.toISOString().slice(0, 10);
      const year = iso.slice(0, 4);
      const event = {
        id: `EVT-${year}-${String(Date.now()).slice(-4)}`,
        urlName: `evt-${year}-${String(Date.now()).slice(-4)}`,
        type: "city",
        typeLabel: "城市沙龙",
        category: "city",
        categoryLabel: "城市沙龙",
        eyebrow: "城市会议",
        title: "新会议活动",
        date: iso,
        dateText: "",
        time: "14:00-17:00",
        city: "上海",
        venue: "活动场地待确认",
        status: "报名中",
        organizerRole: "主办",
        scale: {
          expected: this.emptyMetric(100),
          registered: this.emptyMetric(null),
          checkedIn: this.emptyMetric(null),
          onlineViews: this.emptyMetric(null),
          reach: this.emptyMetric(null)
        },
        heroImage: "assets/module-city-v2.png",
        image: "assets/module-city-v2.png",
        summary: "请填写活动摘要。",
        tags: ["城市会议"],
        agenda: ["主题分享", "案例拆解", "圆桌交流"],
        language: "zh-CN",
        translationStatus: "missing",
        registrationOpen: true,
        gallery: [],
        // 新建即发布：会议团队"填完就在日历上看到"，不用再找发布状态那一栏
        publishStatus: "published",
        contentQuality: "edited",
        approvedBy: null,
        seo: { title: "新会议活动 | DSG 数创时代", description: "", keywords: [] }
      };
      this.draft.events.unshift(event);
      this.selected.events = event;
      this.persist();
    },
    emptyMetric(value) {
      return {
        value,
        status: value == null ? "pending" : "estimated",
        note: "",
        provenance: { sourceFile: null, verifiedBy: null, verifiedOn: null }
      };
    },
    editEvent(event) {
      this.selected.events = event;
    },
    saveEvent() {
      this.persist();
    },
    deleteEvent() {
      if (!this.selected.events || !confirm("确认删除该会议草稿？")) return;
      this.draft.events = this.draft.events.filter((event) => event !== this.selected.events);
      this.selected.events = null;
      this.persist();
    },

    // 类型 → 前台字段一次改全：type / category / typeLabel / categoryLabel / eyebrow
    // 老数据里就存在"城市会议"与"城市沙龙"两种写法：前者是类型名，后者是卡片标签，
    // 这里按老数据约定写死，避免新活动缺 category 而在前台任何一栏都不出现。
    EVENT_TYPE_META: {
      summit: { typeLabel: "年度峰会", categoryLabel: "年度峰会", eyebrow: "年度峰会" },
      city: { typeLabel: "城市会议", categoryLabel: "城市沙龙", eyebrow: "城市会议" },
      elite: { typeLabel: "精英六人谈", categoryLabel: "精英六人谈", eyebrow: "精英六人谈" }
    },
    syncEventType(event) {
      if (!event) return;
      const meta = this.EVENT_TYPE_META[event.type] || this.EVENT_TYPE_META.city;
      event.category = event.type;
      event.typeLabel = meta.typeLabel;
      event.categoryLabel = meta.categoryLabel;
      event.eyebrow = meta.eyebrow;
      this.persist();
    },
    syncCategoryLabel(event) {
      if (!event) return;
      const meta = this.EVENT_TYPE_META[event.category] || this.EVENT_TYPE_META.city;
      event.categoryLabel = meta.categoryLabel;
      if (!event.typeLabel) event.typeLabel = meta.typeLabel;
      this.persist();
    },
    attendeeText(event) {
      if (!event) return "";
      return (event.attendees || []).map((a) => [a.org || "", a.role || ""].join(" | ")).join("\n");
    },
    setAttendees(event, text) {
      if (!event) return;
      event.attendees = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const parts = line.split("|").map((s) => s.trim());
        return { name: "", org: parts[0] || "", role: parts[1] || "" };
      });
      this.persist();
    },
    // 图片上传：本机发布服务负责落盘到 assets/photos/<活动编号>/，返回站内相对路径
    pickImage(kind) {
      const event = this.selected.events;
      if (!event) return;
      if (this.publish.mode !== "local") {
        this.saveState = "上传图片需要本机后台：请双击「启动后台.bat」后再上传";
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          this.saveState = "正在上传图片…";
          try {
            const res = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: file.name, dataUrl: reader.result, bucket: event.id || "misc" })
            });
            const d = await res.json();
            if (!d.ok) { this.saveState = "上传失败：" + (d.error || ""); return; }
            if (kind === "gallery") {
              event.gallery = (event.gallery || []).concat([d.path]);
            } else {
              event.image = d.path;
              event.heroImage = d.path;
            }
            this.persist();
            this.saveState = "图片已上传：" + d.path;
          } catch (err) {
            this.saveState = "上传失败：本机发布服务未运行";
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },

    newAiCase() {
      const item = {
        title: "新供应链AI案例",
        industry: "行业",
        pain: "请填写业务痛点。",
        product: "AI解决方案",
        value: "请填写业务价值。",
        video: "视频演示",
        image: "assets/module-supply-ai-v2.png"
      };
      this.draft.aiCases.unshift(item);
      this.selected.ai = item;
      this.persist();
    },
    editAiCase(item) {
      this.selected.ai = item;
    },
    saveAiCase() {
      this.persist();
    },
    deleteAiCase() {
      if (!this.selected.ai || !confirm("确认删除该 AI 案例草稿？")) return;
      this.draft.aiCases = this.draft.aiCases.filter((item) => item !== this.selected.ai);
      this.selected.ai = null;
      this.persist();
    },

    newInsight() {
      const item = {
        title: "新行业洞察",
        type: "行业文章",
        date: new Date().toISOString().slice(0, 10),
        summary: "请填写摘要。"
      };
      this.draft.insights.unshift(item);
      this.selected.insights = item;
      this.persist();
    },
    editInsight(item) {
      this.selected.insights = item;
    },
    saveInsight() {
      this.persist();
    },
    deleteInsight() {
      if (!this.selected.insights || !confirm("确认删除该洞察草稿？")) return;
      this.draft.insights = this.draft.insights.filter((item) => item !== this.selected.insights);
      this.selected.insights = null;
      this.persist();
    },

    newRole() {
      const role = { id: `role-${Date.now()}`, name: "新管理员角色", permissions: ["dashboard"] };
      this.roles.push(role);
      this.selected.role = role;
      this.persist();
    },
    editRole(role) {
      this.selected.role = role;
    },
    saveRole() {
      if (!this.selected.role.permissions.includes("dashboard")) this.selected.role.permissions.unshift("dashboard");
      this.persist();
    },
    deleteRole() {
      if (!this.selected.role || this.selected.role.id === "super-admin") return;
      if (!confirm("确认删除该角色？")) return;
      this.roles = this.roles.filter((role) => role !== this.selected.role);
      this.selected.role = null;
      this.persist();
    },
    // ================= 页面内容 =================
    BLOCK_PAGE_LABELS: {
      home: "首页", about: "关于我们", consult: "轻咨询", contact: "联系我们",
      insights: "行业洞察", privacy: "隐私条款", "supply-chain-ai": "供应链AI创新专区",
      events: "活动中心", "events-summits": "年度峰会", "events-city": "城市沙龙",
      "events-elite-talks": "精英六人谈", "events-calendar": "活动日历", "event-detail": "活动详情"
    },
    BLOCK_KIND: {
      h1: "主标题", h2: "标题", h3: "小标题", h4: "小标题", p: "正文",
      a: "链接文字", button: "按钮文字", span: "行内文字", eye: "眉标",
      strong: "强调文字", li: "列表项", div: "角标",
      eyebrow: "眉标", title: "标题", titleRest: "标题后半句", lead: "导语",
      desc: "说明", linkLabel: "链接文字", label: "按钮文字",
      mark: "角标", src: "图片路径", alt: "图片说明", href: "跳转地址"
    },
    BLOCK_GROUP: {
      hero: "首屏", business: "业务架构", recent: "近期活动", ai: "AI 案例"
    },

    async loadBlocks() {
      const read = async (file, embKey) => {
        try {
          if (location.protocol === "http:" || location.protocol === "https:") {
            const res = await fetch(file, { cache: "no-store" });
            if (res.ok) return await res.json();
          }
        } catch (err) { /* 本地双击打开时走内嵌快照 */ }
        return (window.DSG_EMBEDDED && window.DSG_EMBEDDED[embKey]) || null;
      };
      const zh = await read("content/page-blocks.json", "page-blocks");
      const en = await read("content-en/page-blocks.json", "page-blocks-en");
      this.blocks.data = this.readJson("dsg-admin-blocks-zh-v1", null) || zh;
      this.blocks.dataEn = this.readJson("dsg-admin-blocks-en-v1", null) || en;
    },
    get blockData() {
      return this.blocks.lang === "en" ? this.blocks.dataEn : this.blocks.data;
    },
    switchBlocksLang(lang) {
      this.blocks.lang = lang;
      this.blocks.page = "home";
      this.blocks.filter = "";
    },
    get blockPages() {
      const src = this.blockData;
      if (!src) return [];
      return Object.keys(src)
        .filter((k) => k.charAt(0) !== "_")
        .map((k) => ({ key: k, label: this.BLOCK_PAGE_LABELS[k] || k, count: 0 }));
    },
    get blockFields() {
      const root = this.blockData && this.blockData[this.blocks.page];
      if (!root) return [];
      const out = [];
      const walk = (node, prefix) => {
        Object.keys(node).forEach((k) => {
          if (k === "variant") return;
          const v = node[k];
          const path = prefix ? prefix + "." + k : k;
          if (Array.isArray(v)) {
            v.forEach((item, i) => {
              if (item && typeof item === "object") walk(item, path + "." + i);
              else out.push({ path: path + "." + i, value: String(item) });
            });
          } else if (v && typeof v === "object") {
            walk(v, path);
          } else {
            out.push({ path, value: String(v == null ? "" : v) });
          }
        });
      };
      walk(root, "");
      return out;
    },
    get filteredBlockFields() {
      const q = this.blocks.filter.trim().toLowerCase();
      if (!q) return this.blockFields;
      return this.blockFields.filter((f) =>
        f.path.toLowerCase().indexOf(q) >= 0 || f.value.toLowerCase().indexOf(q) >= 0);
    },
    fieldLabel(path) {
      const parts = String(path).split(".");
      const tail = parts[parts.length - 1].replace(/\d+$/, "");
      const name = this.BLOCK_KIND[tail] || tail;
      const sec = parts[0].match(/^s(\d+)$/);
      if (sec) return "区块 " + sec[1] + " · " + name;
      const group = this.BLOCK_GROUP[parts[0]] || parts[0];
      return group + " · " + name;
    },
    setBlockValue(path, value) {
      const parts = String(path).split(".");
      let node = this.blockData[this.blocks.page];
      for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
      node[parts[parts.length - 1]] = value;
      this.blocks.dirty = true;
      this.persistBlocks();
    },
    persistBlocks() {
      try {
        const key = this.blocks.lang === "en" ? "dsg-admin-blocks-en-v1" : "dsg-admin-blocks-zh-v1";
        localStorage.setItem(key, JSON.stringify(this.blockData));
        this.saveState = "页面内容已存本机草稿（未导出）";
        this.blocks.dirty = false;
      } catch (err) { this.saveState = "本机存储不可用，请直接导出"; }
    },
    resetBlocksDraft() {
      try {
        localStorage.removeItem(this.blocks.lang === "en" ? "dsg-admin-blocks-en-v1" : "dsg-admin-blocks-zh-v1");
      } catch (err) { /* ignore */ }
      this.blocks.filter = "";
      this.loadBlocks().then(() => { this.saveState = "已恢复为线上内容"; });
    },
    exportBlocks() {
      const en = this.blocks.lang === "en";
      const name = en ? "page-blocks-en.json" : "page-blocks.json";
      this.download(name, JSON.stringify(this.blockData, null, 2));
      this.saveState = en
        ? "已导出英文内容，改名为 page-blocks.json 覆盖 content-en/ 后即生效"
        : "已导出中文内容，覆盖 content/page-blocks.json 后即生效";
    },

    // ================= 外观设置 =================
    async loadTheme() {
      let data = null;
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          const res = await fetch("content/theme.json", { cache: "no-store" });
          if (res.ok) data = await res.json();
        }
      } catch (err) { /* ignore */ }
      if (!data && window.DSG_EMBEDDED) data = window.DSG_EMBEDDED.theme || null;
      this.theme.data = data || (window.DSGTheme ? window.DSGTheme.defaults : null);
      const saved = this.readJson("dsg-admin-theme-v1", null);
      this.theme.draft = this.clone(saved || this.theme.data);
      this.normalizeThemeDraft();
      this.applyTheme(false);
    },
    // 补齐新增令牌：历史草稿与旧 theme.json 里没有 image / heroBase 这些键，
    // 不补的话表单绑定拿到 undefined，输入框会显示 "undefined"。
    normalizeThemeDraft() {
      const d = this.theme.draft;
      if (!d) return;
      d.scale = d.scale || {};
      d.layout = d.layout || {};
      d.shape = d.shape || {};
      d.color = d.color || {};
      d.image = d.image || {};
      if (typeof d.image.heroBg !== "string") d.image.heroBg = "";
      const base = (window.DSGTheme && window.DSGTheme.defaults) || {};
      ["heroBase", "darkBase", "onDark"].forEach((k) => {
        if (!d.color[k]) d.color[k] = (base.color && base.color[k]) || "";
      });
      if (!d.color.ink) d.color.ink = "#111315";
      if (!d.color.muted) d.color.muted = "#6a7178";
      if (!d.color.gold) d.color.gold = "#b8924a";
    },
    applyTheme(persist = true) {
      if (!this.theme.draft || !window.DSGTheme) return;
      window.DSGTheme.apply(this.theme.draft);
      if (persist) {
        this.theme.dirty = true;
        try { localStorage.setItem("dsg-admin-theme-v1", JSON.stringify(this.theme.draft)); } catch (err) { /* ignore */ }
        this.saveState = "外观已应用到预览（未导出）";
      }
    },
    resetTheme() {
      this.theme.draft = this.clone(this.theme.data);
      this.applyTheme(false);
      try { localStorage.removeItem("dsg-admin-theme-v1"); } catch (err) { /* ignore */ }
      this.saveState = "外观已恢复为线上值";
    },
    exportTheme() {
      this.download("theme.json", JSON.stringify(this.theme.draft, null, 2));
      this.saveState = "已导出 theme.json，覆盖 content/ 后即生效";
    },
    get themePreviewStyle() {
      const d = this.theme.draft || {};
      const s = d.scale || {};
      const c = d.color || {};
      const hero = 38 * (s.h2 || 1) * 0.58;
      const h2 = 38 * (s.h2 || 1) * 0.42;
      const body = 15 * 0.95;
      return "font-size:" + hero.toFixed(1) + "px;color:" + (c.ink || "#111315") +
        ";line-height:1.2;margin:0 0 2px;";
    },
    // 首屏背景图预览：留空时回落到当前线上用的那张
    get heroPreviewSrc() {
      const p = (this.theme.draft && this.theme.draft.image && this.theme.draft.image.heroBg) || "";
      return p || "assets/photos/hero-aurora/hero-aurora-3060.webp";
    },

    download(filename, text) {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },

    exportCurrent() {
      // 导出前把后台编辑用的 image 映射回内容层字段 heroImage
      const events = this.draft.events.map((event) => {
        const copy = JSON.parse(JSON.stringify(event));
        if (copy.image) copy.heroImage = copy.image;
        return copy;
      });
      const map = {
        events: { name: "events.json", data: events },
        ai: { name: "ai-cases.json", data: this.draft.aiCases },
        insights: { name: "articles.json", data: this.draft.insights },
        content: { name: this.blocks.lang === "en" ? "page-blocks-en.json" : "page-blocks.json", data: this.blockData },
        appearance: { name: "theme.json", data: this.theme.draft },
        permissions: { name: "admin-roles.json", data: this.roles },
        leads: { name: "dsg-leads.csv", data: null, csv: window.DSGForms ? window.DSGForms.exportQueue() : "" },
        dashboard: { name: "dsg-admin-export.json", data: this.draft }
      };
      const payload = map[this.activeModule] || map.dashboard;
      const isCsv = typeof payload.csv === "string";
      const body = isCsv ? "\ufeff" + payload.csv : JSON.stringify(payload.data, null, 2);
      const blob = new Blob([body], { type: isCsv ? "text/csv;charset=utf-8" : "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = payload.name;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  };
}
