function dsgAdmin() {
  // 2026-11-26：给自检输出一个版本号。用户截图时能一眼看出打开的是不是最新脚本，
  // 省掉"改了没生效"和"缓存了旧文件"之间的来回猜。
  window.DSG_ADMIN_BUILD = "2026-11-26b";
  // —— 方案 B：GitHub 授权登录 ——
  // 填上这两个值，后台的「登录」就变成点一下按钮、跳 GitHub 点 Authorize、自动回来，
  // 不用再复制粘贴任何令牌。两个值都为空时自动退回令牌登录，不会把人卡住。
  //   clientId：GitHub → Settings → Developer settings → OAuth Apps → 那串 Client ID（公开的，不是密钥）
  //   proxy   ：换 code 用的中转地址。GitHub 的换票接口不允许网页直接调用（已实测无跨域头），
  //             必须有一个只做这件事的小中转；它拿到 code 后连 GitHub 换回访问凭证。
  const GH_OAUTH = {
    clientId: "",
    proxy: "",
    scope: "public_repo", // 只够读写公开仓库，碰不到私库
    callback: location.origin + location.pathname
  };
  window.DSG_OAUTH = GH_OAUTH;
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
    { id: "super-admin", name: "超级管理员", locked: true, permissions: ["dashboard", "content", "navigation", "blocks", "events", "ai", "insights", "leads", "appearance", "history", "policy", "permissions"], scope: "全部模块，含导航、板块、页面内容、版本历史与权限授权" },
    { id: "business-admin", name: "业务管理员", locked: true, permissions: ["dashboard", "ai", "leads"], scope: "供应链AI创新专区 + 线索管理" },
    { id: "events-admin", name: "会议管理员", locked: true, permissions: ["dashboard", "events"], scope: "会议管理（峰会/城市沙龙/精英六人谈）" },
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
    saveState: "改动会自动保存",
    modules: [
      { id: "navigation", name: "导航菜单", short: "导航", description: "顶部六个一级菜单：改名、排序、显示/隐藏、新增与删除；EN 按钮与预约咨询按钮" },
      { id: "blocks", name: "板块管理", short: "板块", description: "首页与活动页的板块：显示/隐藏、上下排序、新增、删除、背景图、字号档位与文字颜色" },
      { id: "content", name: "页面内容", short: "页面", description: "前台每个页面的文案、图片、按钮文字与链接；左侧列表按站点真实页面生成" },
      { id: "history", name: "版本历史", short: "版本", description: "撤销与重做、回退到任意一步历史、全部操作留痕" },
      { id: "events", name: "会议管理", short: "会议", description: "年度峰会、城市沙龙、精英六人谈的增删改查与发布状态" },
      { id: "ai", name: "供应链AI创新专区", short: "供应链AI", description: "AI 解决方案案例、应用场景、视频与 Demo 入口" },
      { id: "insights", name: "行业洞察", short: "洞察", description: "文章、视频回放、白皮书、闭门纪要" },
      { id: "policy", name: "可编辑范围", short: "范围", description: "后台到底能改什么、谁能改、改一次要动到什么级别" },
      { id: "appearance", name: "外观设置", short: "外观", description: "字号倍率、区块留白、内容宽度、圆角与主色，控制全站排版" },
      { id: "leads", name: "线索管理", short: "线索", description: "查看、导出与清理由前台表单提交的线索（受限数据）" },
      { id: "permissions", name: "权限管理", short: "权限", description: "超级管理员专用：角色、模块与授权力统计" }
    ],
    roles: [],
    leads: [],
    source: { events: [], aiCases: [], insights: [] },
    draft: { events: [], aiCases: [], insights: [] },
    // —— 页面内容 / 外观设置 ——
    blocks: { data: null, dataEn: null, lang: "zh", page: "home", filter: "", dirty: false },
    manifest: null,
    requirements: null,
    fieldPolicy: null,
    theme: { data: null, draft: null, dirty: false },
    // 可编辑范围表：「说明」这一栏默认显示，可一键收起（记在本机浏览器）
    policyNote: true,
    selected: { events: null, ai: null, insights: null, role: null },
    filters: { events: "", ai: "", insights: "", leads: "" },
    eventTypeFilter: "all",
    // —— 发布通道（local / github / readonly）——
    publish: { mode: "unknown", busy: false, commit: "", at: "", repo: "Assiduous-Insidious11/dsg-website", branch: "main", server: null, error: "" },
    // 令牌状态："" 未检测 / valid 有效 / invalid 401 无效 / denied 403 无权限 / offline 网络不通
    tokenState: "",
    ghToken: "",
    // 2026-11-26：发布账号改成「谁用谁登录」。令牌只代表这个人的 GitHub 账号，
    // 换电脑、换人各登各的，后台不再绑定某一台机器。
    ghLogin: "",
    loginOpen: false,
    tokenInput: "",
    tokenBusy: false,
    loginError: "",
    // 手动展开「用访问令牌登录」这条备用路（默认只在没接授权登录时才露出来）
    tokenOpen: false,
    // 这次登录是怎么进来的：oauth（点按钮授权）/ token（粘贴令牌）/ 空（还没登录）
    authVia: "",
    publishMessage: "",

    get currentRole() {
      return this.roles.find((role) => role.id === this.session.roleId) || this.roles[0] || defaultRoles[0];
    },
    // 侧边栏菜单：只列当前角色有权进入的模块。
    // 2026-11-25：以前是每个模块都渲染一个「无权限」灰按钮，不但暴露后台全部功能，
    // 12 个模块还撑爆了侧栏高度，把最下面的「权限管理」挤出可视区。
    // 现在没有权限的模块直接不出现——其他角色登录看不到「权限管理」。
    get navModules() {
      const labels = {
        navigation: "导航菜单",
        blocks: "板块管理",
        content: "页面内容",
        history: "版本历史",
        events: "会议管理",
        ai: "供应链AI创新专区",
        insights: "行业洞察",
        policy: "可编辑范围",
        appearance: "外观设置",
        leads: "线索管理",
        permissions: "权限管理"
      };
      return Object.keys(labels)
        .filter((id) => this.can(id))
        .map((id) => ({ id, label: labels[id], accessible: true }));
    },
    // 权限矩阵用：角色是否拥有某模块（超级管理员恒有）
    roleHas(role, moduleId) {
      if (moduleId === "dashboard") return true;
      if (role && role.id === "super-admin") return true;
      return !!(role && Array.isArray(role.permissions) && role.permissions.includes(moduleId));
    },
    // 单个角色拿到了几个模块（用于矩阵右侧的「授权数」）
    grantCount(role) {
      return this.modules.filter((m) => this.roleHas(role, m.id)).length;
    },
    // 权限管理页顶部的统计：角色数、内置/自定义、已授权项、空白位
    get permStats() {
      const grants = this.roles.reduce((sum, role) => sum + this.grantCount(role), 0);
      const total = this.roles.length * this.modules.length;
      return {
        roles: this.roles.length,
        builtin: this.roles.filter((role) => role.locked).length,
        custom: this.roles.filter((role) => !role.locked).length,
        grants,
        gaps: Math.max(0, total - grants)
      };
    },
    get moduleTitle() {
      const titles = {
        dashboard: "内容与权限总览",
        navigation: "导航菜单（一级 / 二级）",
        blocks: "板块管理（显示、顺序、样式）",
        content: "页面内容（文案、图片与链接）",
        history: "版本历史与操作日志",
        events: "会议管理",
        ai: "供应链AI创新专区管理",
        insights: "行业洞察管理",
        policy: "可编辑范围（后台能力清单）",
        appearance: "外观设置（版式与配色）",
        leads: "线索管理（受限数据）",
        permissions: "权限管理（角色与授权统计）"
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
      await this.loadManifest();
      await this.loadTheme();
      await this.loadNav();
      await this.loadBlocksCfg();
      await this.loadSite();
      this.restoreUndoState();
      try { this.ghToken = localStorage.getItem("dsg-gh-token") || ""; } catch (err) { /* 隐私模式忽略 */ }
      try { this.authVia = localStorage.getItem("dsg-gh-via") || ""; } catch (err) { /* ignore */ }
      // 从 GitHub 授权页跳回来时，地址上带着 code：先把它换成凭证，再做通道检测。
      await this.handleOauthCallback();
      try {
        const noteRaw = localStorage.getItem("dsg-admin-policy-note");
        if (noteRaw === "0") this.policyNote = false;
      } catch (err) { /* 忽略 */ }
      await this.detectChannel();
      // 本机后台：把服务端那份共享草稿对上来（谁的时间新用谁的）
      await this.syncDraftFromServer();
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
      // 登录后开始盯变化（撤销/重做 + 自动存草稿），并拉一次历史
      this.startWatcher();
      this.loadHistory();
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
      if (!isLocalHost) {
        // 线上域名下不存在 /api/*（本机服务只监听 127.0.0.1），不去请求，避免一串 404
        if (!this.ghToken) {
          this.publish.mode = "readonly";
          return;
        }
        // 2026-11-25：以前只要浏览器里存着令牌就亮「可发布」，令牌过期了也照样亮，
        // 点发布才在第一个文件上炸掉。现在先问一句 GitHub「这串令牌是谁」，
        // 401 就当没令牌处理，状态标与实际能力一致。
        const ok = await this.checkGhToken(true);
        this.publish.mode = ok ? "github" : "readonly";
        if (!ok) {
          // 确认被 GitHub 拒绝（401/403）才清掉，别再每次打开都甩一条红色报错；
          // 只是网络不通的话保留令牌，等网络好了还能用。
          if (this.tokenState === "invalid" || this.tokenState === "denied") {
            this.ghToken = "";
            this.ghLogin = "";
            try { localStorage.removeItem("dsg-gh-token"); } catch (e) { /* ignore */ }
            this.saveState = "未登录：登录后才能发布";
          } else {
            this.saveState = "连不上 GitHub，暂时只能存草稿";
          }
        }
        return;
      }
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (d && d.mode === "local") {
            this.publish.mode = "local";
            this.publish.server = d;
            this.saveState = "草稿存在共享稿库，换设备或同事接手看到同一份";
            return;
          }
        }
      } catch (err) { /* 线上没有这个接口，正常 */ }
      if (this.publish.mode === "unknown") {
        // 本机地址但后台服务没起来：同样先验令牌，别亮一个假的「可发布」
        if (this.ghToken) {
          const ok = await this.checkGhToken(true);
          this.publish.mode = ok ? "github" : "readonly";
        } else {
          this.publish.mode = "readonly";
        }
      }
    },
    get publishModeLabel() {
      const base = { local: "本机直连（可发布）", github: "GitHub 账号（可发布）", readonly: "未登录（只读草稿）", unknown: "检测中…" }[this.publish.mode] || "检测中…";
      if (this.publish.mode === "github" && this.tokenState === "valid") return "GitHub 账号（已登录）";
      return base;
    },
    // 登录面板：本机直连模式不需要；网页版只要没登录就摆出来，
    // 谁打开后台谁看得见「先登录」这一步，不再出现「点发布才知道不能发」。
    get showLoginPanel() {
      if (this.publish.mode === "local") return false;
      if (this.loginOpen) return true;
      return !this.ghLogin;
    },
    // 兼容旧模板里残留的引用
    get showTokenBox() {
      return this.showLoginPanel;
    },
    // 授权登录是否已接好：Client ID 与中转地址都填了才算。
    get oauthReady() {
      return !!(GH_OAUTH.clientId && GH_OAUTH.proxy);
    },
    // 令牌输入框：授权登录可用时就藏起来，只在人主动点「改用访问令牌」时出现。
    get showTokenInput() {
      return this.tokenOpen || !this.oauthReady;
    },
    /** 点「用 GitHub 账号登录」：跳去 GitHub 授权，回来由 handleOauthCallback 接手 */
    startGithubLogin() {
      if (this.tokenBusy) return;
      this.loginError = "";
      if (!this.oauthReady) {
        // 还没配好中转：别把人晾在按钮上，直接把令牌这条路打开
        this.tokenOpen = true;
        this.saveState = "授权登录还没接好，先用访问令牌登录（见 setup 说明）";
        return;
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem("dsg-oauth-state", state); } catch (e) { /* 隐私模式 */ }
      location.href = "https://github.com/login/oauth/authorize"
        + "?client_id=" + encodeURIComponent(GH_OAUTH.clientId)
        + "&scope=" + encodeURIComponent(GH_OAUTH.scope)
        + "&state=" + encodeURIComponent(state)
        + "&redirect_uri=" + encodeURIComponent(GH_OAUTH.callback);
    },
    /** 授权跳回后：核校验码 → 把 code 换成访问凭证 → 验明身份 → 记住 */
    async handleOauthCallback() {
      let q;
      try { q = new URLSearchParams(location.search); } catch (e) { return; }
      const code = q.get("code");
      const state = q.get("state");
      const denied = q.get("error");
      if (!code && !denied) return;
      this.loginOpen = true;
      const clean = () => { try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ } };
      if (denied) {
        this.loginError = denied === "access_denied"
          ? "你在 GitHub 页面上点了取消授权，没有登录。需要发布时再点一次「用 GitHub 账号登录」。"
          : ("GitHub 授权没有完成：" + denied + (q.get("error_description") ? "（" + q.get("error_description") + "）" : ""));
        clean();
        return;
      }
      let saved = "";
      try { saved = sessionStorage.getItem("dsg-oauth-state") || ""; } catch (e) { /* ignore */ }
      if (!saved || state !== saved) {
        this.loginError = "授权回调的校验码对不上（可能是从别处复制来的链接），为安全起见已停止登录，请重新点一次登录。";
        clean();
        return;
      }
      try { sessionStorage.removeItem("dsg-oauth-state"); } catch (e) { /* ignore */ }
      this.tokenBusy = true;
      this.saveState = "正在用 GitHub 账号换取登录凭证…";
      let data = null;
      try {
        const res = await fetch(GH_OAUTH.proxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code })
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data || !data.access_token) {
          this.loginError = "换取登录凭证失败："
            + ((data && (data.error_description || data.error)) || ("中转服务返回 HTTP " + res.status))
            + "。可以先点「改用访问令牌」登录。";
        }
      } catch (err) {
        this.loginError = "连不上登录中转服务（" + (err && err.message ? err.message : "网络不通") + "）。可以先点「改用访问令牌」登录。";
      }
      if (data && data.access_token) {
        const ok = await this.applyToken(data.access_token, "oauth");
        if (!ok) {
          this.loginError = (this.loginError || "")
            + "授权本身成功了，但这个 GitHub 账号没有本仓库的写权限。请管理员在仓库 Settings → Collaborators 里把你加进去（权限选 Write），再登录一次。";
        }
      }
      if (!this.ghToken) this.saveState = "未登录：登录后才能发布";
      this.tokenBusy = false;
      clean();
    },
    /** 拿到凭证后统一走这里：验明身份 → 存本机 → 切成可发布 */
    async applyToken(token, via) {
      this.ghToken = token;
      const ok = await this.checkGhToken(true);
      if (!ok) {
        this.ghToken = "";
        if (!this.loginError && this.tokenState !== "offline") {
          this.loginError = "这个账号没能读到仓库信息（" + (this.tokenState === "invalid" ? "凭证被 GitHub 拒绝" : "权限不足") + "）。";
        }
        return false;
      }
      try { localStorage.setItem("dsg-gh-token", token); } catch (e) { /* 隐私模式 */ }
      this.authVia = via || "token";
      try { localStorage.setItem("dsg-gh-via", this.authVia); } catch (e) { /* ignore */ }
      this.publish.mode = "github";
      this.tokenInput = "";
      this.tokenOpen = false;
      this.loginOpen = false;
      this.loginError = "";
      this.publish.error = "";
      this.saveState = "已登录 " + (this.ghLogin || "GitHub 账号") + "，可以发布";
      return true;
    },
    /** 用本人的 GitHub 令牌登录：验明身份 → 记住 → 切到可发布状态 */
    async loginWithToken() {
      if (this.tokenBusy) return;
      const token = (this.tokenInput || "").replace(/\s+/g, "");
      if (!token) {
        this.loginError = "请先粘贴 GitHub 访问令牌";
        return;
      }
      // 2026-11-26：有人只往框里敲了 6 个字符，拿回来一个 401，看着像"机制又坏了"。
      // 令牌长度是死的：经典令牌 40 位，细粒度令牌 90 多位。太短就不是令牌，直接拦。
      if (token.length < 20) {
        this.loginError = "这一串只有 " + token.length + " 个字符，不是完整令牌。完整令牌是 40 位以上（github_pat_ 开头的是 90 多位），请回 GitHub 复制整串。";
        return;
      }
      this.tokenBusy = true;
      this.loginError = "";
      const ok = await this.applyToken(token, "token");
      if (!ok) {
        this.ghToken = "";
        this.loginError = this.loginError || {
          invalid: "令牌不对或已过期，请重新生成（GitHub → Settings → Developer settings → Personal access tokens）。",
          denied: "这串令牌被 GitHub 拒绝，检查是否复制完整、是否已被撤销。",
          offline: "连不上 api.github.com，可能是网络或代理拦截；换个网络再试。"
        }[this.tokenState] || "验证没通过，请重试。";
        this.saveState = "未登录：登录后才能发布";
      }
      this.tokenBusy = false;
    },
    logoutToken() {
      this.ghToken = "";
      this.ghLogin = "";
      this.tokenState = "";
      this.tokenInput = "";
      this.tokenOpen = false;
      this.authVia = "";
      this.publish.error = "";
      this.publish.mode = "readonly";
      try { localStorage.removeItem("dsg-gh-token"); } catch (e) { /* ignore */ }
      try { localStorage.removeItem("dsg-gh-via"); } catch (e) { /* ignore */ }
      this.detectChannel();
      this.saveState = "已退出，本机不再保存这个账号的登录凭证";
    },
    // 令牌自检：只问「这串令牌是谁」，不读写仓库，零副作用。
    // 仓库目前是公开的，任何有效令牌（哪怕没有写权限）都能读到它；
    // 所以「连读都失败」只可能是令牌本身不被认，不是权限不够。
    async checkGhToken(silent) {
      if (!this.ghToken) { this.tokenState = ""; return false; }
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: { "Authorization": "Bearer " + this.ghToken, "Accept": "application/vnd.github+json" },
          cache: "no-store"
        });
        if (res.ok) {
          this.tokenState = "valid";
          try { const u = await res.json(); this.ghLogin = (u && u.login) || ""; } catch (e) { this.ghLogin = ""; }
          if (!silent) this.publish.error = "";
          return true;
        }
        if (res.status === 401 || res.status === 403) {
          this.tokenState = "invalid";
          if (!silent) this.publish.error = "登录已失效（" + res.status + "）：这个浏览器里保存的令牌被 GitHub 拒绝了。请点顶栏「登录」重新粘贴令牌，改动不会丢。";
        } else {
          this.tokenState = "denied";
          if (!silent) this.publish.error = "GitHub 拒绝了这串令牌（" + res.status + "），请检查令牌是否被撤销、是否复制完整。";
        }
        return false;
      } catch (err) {
        this.tokenState = "offline";
        if (!silent) this.publish.error = "连不上 api.github.com（网络或代理拦截），令牌无法验证。换个网络再试。";
        return false;
      }
    },
    /**
     * 发布失败自检（2026-11-26）
     * 逐个环节探一次，把 GitHub 的原话摆出来，不再让人猜是令牌、权限还是限流。
     * 顺序：令牌身份 → 仓库写权限 → 文件能否读 → 剩余额度。
     */
    async selfCheck() {
      const out = [];
      const put = (s) => out.push(s);
      put("后台版本：" + (window.DSG_ADMIN_BUILD || "未标注") + " · 打开地址：" + location.host);
      if (!this.ghToken) {
        put("令牌：浏览器里没有存");
        return out.join("\n");
      }
      put("令牌：已填写，长度 " + this.ghToken.length + "（40 为经典令牌，93 为细粒度令牌）");
      const auth = { "Authorization": "Bearer " + this.ghToken, "Accept": "application/vnd.github+json" };
      const ghLimit = (res) => {
        const r = res.headers.get("x-ratelimit-remaining");
        const retry = res.headers.get("retry-after");
        return (r != null ? " · 剩余调用 " + r : "") + (retry ? " · 需等待 " + retry + " 秒" : "");
      };
      try {
        const r = await fetch("https://api.github.com/user", { headers: auth, cache: "no-store" });
        if (r.ok) {
          let login = "";
          try { const u = await r.json(); login = (u && u.login) || ""; } catch (e) { /* 忽略 */ }
          put("[1] 令牌身份：" + r.status + " 正常，账号 " + (login || "未知") + ghLimit(r));
        } else {
          const m = await this.ghMessage(r);
          put("[1] 令牌身份：" + r.status + " " + (m || this.ghHint(r.status)) + ghLimit(r));
        }
      } catch (e) {
        put("[1] 令牌身份：连不上 api.github.com，" + (e && e.message ? e.message : "网络或代理拦截"));
      }
      try {
        const r2 = await fetch("https://api.github.com/repos/" + this.publish.repo, { headers: auth, cache: "no-store" });
        if (r2.ok) {
          const d = await r2.json();
          const p = (d && d.permissions) || {};
          put("[2] 仓库权限：" + r2.status + " " + (d && d.full_name ? d.full_name : this.publish.repo) +
              " · 可写=" + (p.push ? "是" : "否") + " · 私有=" + (d && d.private ? "是" : "否") + ghLimit(r2));
        } else {
          const m2 = await this.ghMessage(r2);
          put("[2] 仓库权限：" + r2.status + " " + (m2 || this.ghHint(r2.status)) + ghLimit(r2));
        }
      } catch (e) {
        put("[2] 仓库权限：请求失败，" + (e && e.message ? e.message : "网络异常"));
      }
      try {
        const r3 = await this.ghApi("/contents/content/events.json?ref=" + this.publish.branch);
        if (r3.ok) {
          put("[3] 读取内容文件：" + r3.status + " 正常" + ghLimit(r3));
        } else {
          const m3 = await this.ghMessage(r3);
          put("[3] 读取内容文件：" + r3.status + " " + (m3 || this.ghHint(r3.status)) + ghLimit(r3));
        }
      } catch (e) {
        put("[3] 读取内容文件：请求失败，" + (e && e.message ? e.message : "网络异常"));
      }
      return out.join("\n");
    },
    copyDiag() {
      const text = this.publish.error || "";
      try {
        navigator.clipboard.writeText(text);
        this.saveState = "诊断信息已复制，可直接发给技术查看";
      } catch (err) {
        this.saveState = "复制失败，请手动选中下面的文字";
      }
    },
    saveGhToken(value) {
      this.ghToken = (value || "").trim();
      try {
        if (this.ghToken) localStorage.setItem("dsg-gh-token", this.ghToken);
        else localStorage.removeItem("dsg-gh-token");
      } catch (err) { /* 隐私模式忽略 */ }
      if (!this.ghToken) {
        this.tokenState = "";
        this.publish.error = "";
        this.detectChannel();
        this.saveState = "已清除令牌";
        return;
      }
      this.checkGhToken().then((ok) => {
        this.publish.mode = ok ? "github" : "readonly";
        this.saveState = ok ? "令牌验证通过，可在线发布" : "令牌验证未通过，见上方提示";
      });
    },
    // GitHub 报错翻译成人话：状态码 → 该做什么
    ghHint(status) {
      if (status === 401) return "令牌无效或已过期。请重新生成令牌，或改用本机后台发布。";
      if (status === 403) return "令牌没有这个仓库的写权限，或触发了接口限流。请给令牌 Contents: Read and write 权限。";
      if (status === 404) return "找不到仓库或文件。请确认仓库名、分支，以及令牌是否已选中该仓库。";
      if (status >= 500) return "GitHub 服务端异常，稍后重试。";
      return "请检查令牌权限与网络后重试。";
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
        navigation: this.nav.data || null,
        blocks: this.cfg.data || null,
        site: this.siteData || null,
        fieldPolicy: this.fieldPolicy || null,
        ops: this.pendingOps(),
        actor: this.actorName(),
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
      this.publish.error = "";
      this.saveState = "正在发布…";
      try {
        if (this.publish.mode === "unknown") await this.detectChannel();
        // 只要浏览器里存着令牌，就先确认它还能用：发布会写仓库，不能推到一半才报 401。
        // 这里用非静默模式，失败时把 401 / 403 的具体原因摆出来。
        if (this.ghToken && this.tokenState !== "valid") {
          const alive = await this.checkGhToken();
          if (!alive) {
            this.publish.mode = "readonly";
            this.saveState = "发布失败：令牌无效，未做任何改动";
            return;
          }
          this.publish.mode = "github";
        }
        if (this.publish.mode === "local") return await this.publishLocal(payload);
        if (this.publish.mode === "github") return await this.publishGithub(payload);
        this.saveState = "还没有登录发布账号";
        this.loginOpen = true;
        // 令牌坏了的话，保留上面那句具体原因，别用泛泛的「未登录」盖掉
        this.publish.error = this.publish.error || "还没有登录，改动只在草稿里，线上没有任何变化。\n\n点顶栏「登录」，粘贴你自己的 GitHub 访问令牌即可；任何电脑都能这样登录，不需要装任何东西。";
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        this.saveState = "发布失败：" + msg;
        this.publish.error = msg + "\n\n正在自动逐项自检…";
        if (window.console && console.error) console.error("[DSG 发布失败]", err);
        // 2026-11-26：失败时自动跑一遍连通性自检，把令牌身份、仓库写权限、
        // 文件读取三关的结果直接摆出来，不再让用户靠猜或靠截图报错。
        try {
          const diag = await this.selfCheck();
          this.publish.error = msg + "\n\n—— 自动自检 ——\n" + diag +
            "\n\n判读：[1] 出错 = 令牌本身失效或复制不全；[2] 可写=否 = 令牌没给这个仓库的写权限；[3] 只有这一关出错 = 短时间调用过多，等一分钟再点。";
        } catch (diagErr) {
          this.publish.error = msg;
        }
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
        this.publish.error = (d.error || "本机发布服务返回异常") + (d.tail ? "：" + d.tail.join(" ") : "");
        return;
      }
      // 真数据已经落到文件里，本机演示快照要清掉，避免前台读到旧快照
      try { localStorage.removeItem("dsg-demo-published-v1"); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(this.UNDO_KEY); } catch (e) { /* ignore */ }
      // 已经随包上传留痕，本机队列清空，避免下次重复记录
      this.clearPendingOps();
      this.undoStack = [];
      this.redoStack = [];
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
    // 取 GitHub 返回里的原话（如 "Bad credentials"、"Resource not accessible by personal access token"）
    async ghMessage(res) {
      try {
        const j = await res.clone().json();
        return (j && (j.message || "")) || "";
      } catch (err) {
        return "";
      }
    },
    ghHeaders(extra) {
      return Object.assign({
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + this.ghToken,
        "X-GitHub-Api-Version": "2022-11-28"
      }, extra || {});
    },
    async ghApi(path, options) {
      const res = await fetch("https://api.github.com/repos/" + this.publish.repo + path, Object.assign({
        headers: this.ghHeaders()
      }, options || {}));
      return res;
    },
    /** 发一个带 JSON 体的写请求（建 blob / 建 tree / 建 commit / 移分支都用它） */
    async ghJson(method, path, body, what) {
      const res = await this.ghApi(path, {
        method: method,
        headers: this.ghHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const detail = await this.ghMessage(res);
        const err = new Error((what || "请求") + "失败（" + res.status + "）：" + (detail || this.ghHint(res.status)));
        err.status = res.status;
        throw err;
      }
      try { return await res.json(); } catch (e) { return {}; }
    },
    /** 读一个只返回 JSON 的接口 */
    async ghGetJson(path, what) {
      const res = await this.ghApi(path);
      if (!res.ok) {
        const detail = await this.ghMessage(res);
        const err = new Error((what || "读取") + "失败（" + res.status + "）：" + (detail || this.ghHint(res.status)));
        err.status = res.status;
        throw err;
      }
      return await res.json();
    },
    /**
     * 发布 = 一次原子提交（2026-11-26 重做）
     * 旧做法是逐个文件调用 Contents API，8 份内容就是 8 个提交：
     * 中途任何一步失败，线上就变成"一半新一半旧"；两个人同时发布还会互相覆盖。
     * 现在改成 Git 数据接口：先建好全部文件的 blob，再一次性生成目录、一个提交、移动分支。
     * 要么整批生效，要么什么都不变。别人抢先提交了，GitHub 会拒绝移分支，
     * 我们重新读一次最新提交再合进去重试，谁的改动都不会被吞掉。
     */
    /** 台账：这 8 份文件就是前台的"内容源"，发布与回退走同一份清单 */
    contentFiles(payload) {
      return [
        ["content/events.json", payload.events],
        ["content/ai-cases.json", payload.aiCases],
        ["content/articles.json", payload.insights],
        ["content/page-blocks.json", payload.pageBlocks],
        ["content-en/page-blocks.json", payload.pageBlocksEn],
        ["content/navigation.json", payload.navigation],
        ["content/blocks.json", payload.blocks],
        ["content/site.json", payload.site]
      ].filter((f) => f[1]);
    },
    async publishGithub(payload) {
      const branch = this.publish.branch;
      const files = this.contentFiles(payload);

      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const commit = await this.commitOnce(files, payload, branch);
          this.publish.commit = commit.slice(0, 7);
          this.publish.at = new Date().toLocaleString("zh-CN", { hour12: false });
          this.publish.error = "";
          this.clearPendingOps();
          this.saveState = "已发布（提交 " + commit.slice(0, 7) + "）：约 1 分钟后全网可见";
          return;
        } catch (err) {
          lastError = err;
          const retryable = err && (err.status === 422 || err.status === 409);
          if (!retryable || attempt === 2) throw err;
          // 有人刚刚也在发布：等一拍，重新读最新提交再合一次
          await new Promise((r) => setTimeout(r, 900 + attempt * 800));
        }
      }
      throw lastError || new Error("发布未完成");
    },
    async commitOnce(files, payload, branch) {
      const ref = await this.ghGetJson("/git/ref/heads/" + branch, "读取分支 " + branch);
      const headSha = ref && ref.object && ref.object.sha;
      if (!headSha) throw new Error("读不到分支 " + branch + " 的最新提交，请确认分支名");
      const head = await this.ghGetJson("/git/commits/" + headSha, "读取最新提交");
      const baseTree = head && head.tree && head.tree.sha;

      const blobs = await Promise.all(files.map(async (f) => {
        const out = await this.ghJson("POST", "/git/blobs", {
          content: JSON.stringify(f[1], null, 2) + "\n",
          encoding: "utf-8"
        }, "写入 " + f[0]);
        return { path: f[0], mode: "100644", type: "blob", sha: out.sha };
      }));

      const tree = await this.ghJson("POST", "/git/trees", {
        base_tree: baseTree,
        tree: blobs
      }, "生成提交目录");

      const who = this.ghLogin ? " · " + this.ghLogin : "";
      const message = (payload.message || "后台发布内容更新") + who;
      const commit = await this.ghJson("POST", "/git/commits", {
        message: message,
        tree: tree.sha,
        parents: [headSha]
      }, "创建提交");

      await this.ghJson("PATCH", "/git/refs/heads/" + branch, {
        sha: commit.sha,
        force: false
      }, "更新线上分支");
      return commit.sha;
    },
    can(moduleId) {
      if (moduleId === "dashboard") return true;
      const role = this.currentRole;
      if (!role) return false;
      // 超级管理员：全部模块可用
      if (role.id === "super-admin") return true;
      // 权限管理是超级管理员专属，其他角色一律不显示入口
      if (moduleId === "permissions") return false;
      if (!Array.isArray(role.permissions)) return false;
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
      // 2026-11-26：草稿双写。
      // 本地那份保速度、断网也不丢；本机后台模式下再同步一份到服务端，
      // 这样换电脑、换浏览器、同事接手看到的都是同一份，不再各存各的。
      const now = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify(this.draft));
        localStorage.setItem(rolesKey, JSON.stringify(this.roles));
        localStorage.setItem("dsg-admin-draft-at", String(now));
      } catch (err) { /* 隐私模式下忽略 */ }
      this.saveState = `已保存草稿 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
      this.pushDraftToServer();
    },
    // 草稿上传节流：连续操作只在停手 1.2 秒后写一次盘，避免频繁落盘
    pushDraftToServer() {
      if (this.publish.mode !== "local") return;
      if (this._draftTimer) clearTimeout(this._draftTimer);
      this._draftTimer = setTimeout(() => {
        fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: this.draft })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.ok) this.saveState = "草稿已存入共享稿库 · " + d.updated;
          })
          .catch(() => { /* 服务没起就只留本地那份 */ });
      }, 1200);
    },
    // 打开后台时对齐服务端草稿：谁的时间新用谁的，避免把刚改的覆盖掉
    async syncDraftFromServer() {
      if (this.publish.mode !== "local") return;
      try {
        const res = await fetch("/api/drafts", { cache: "no-store" });
        const d = await res.json();
        if (!d || !d.ok || !d.data || !Array.isArray(d.data.events) || !d.data.events.length) return;
        const localAt = Number(localStorage.getItem("dsg-admin-draft-at") || 0);
        const serverAt = d.updated ? new Date(d.updated.replace(" ", "T")).getTime() : 0;
        if (serverAt > localAt + 1000) {
          this.draft = d.data;
          try {
            localStorage.setItem(storageKey, JSON.stringify(this.draft));
            localStorage.setItem("dsg-admin-draft-at", String(serverAt));
          } catch (err) { /* 忽略 */ }
          this.saveState = "已载入共享草稿 · " + d.updated;
        }
      } catch (err) { /* 服务没起就沿用本地草稿 */ }
    },
    resetDrafts() {
      if (!confirm("确认清空本机草稿并恢复 content/*.json 的内容？")) return;
      localStorage.removeItem(storageKey);
      try {
        ["dsg-admin-nav-v1", "dsg-admin-blocks-cfg-v1", "dsg-admin-site-v1",
          "dsg-admin-blocks-zh-v1", "dsg-admin-blocks-en-v1", this.UNDO_KEY, this.OPS_KEY
        ].forEach(function (k) { localStorage.removeItem(k); });
      } catch (err) { /* ignore */ }
      this.draft = this.clone(this.source);
      this.selected = { events: null, ai: null, insights: null, role: null };
      this.undoStack = [];
      this.redoStack = [];
      this.saveState = "已恢复数据文件内容";
      Promise.all([this.loadNav(), this.loadBlocksCfg(), this.loadSite()]).then(() => {
        this.lastSnap = this.snapshotScopes();
      });
    },
    joinList(list) {
      return Array.isArray(list) ? list.join("，") : "";
    },
    splitList(value) {
      return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    },
    /* 2026-11-25 详情页三栏新增字段：海报 / 嘉宾名单 / 活动流程。
       嘉宾与流程按“一行一条”编辑，不能用逗号分隔——公司名和职务里本来就有逗号。 */
    guestText(ev) {
      return Array.isArray(ev.docGuests) ? ev.docGuests.join("\n") : "";
    },
    setGuests(ev, text) {
      ev.docGuests = String(text || "").split("\n").map((x) => x.trim()).filter(Boolean);
    },
    flowText(ev) {
      return (ev.docAgenda || []).map((a) => [a.time || "", a.text || "", a.note || ""].join(" | ")).join("\n");
    },
    setFlow(ev, text) {
      ev.docAgenda = String(text || "").split("\n").map((line) => {
        const p = line.split("|").map((x) => x.trim());
        return { time: p[0] || "", text: p[1] || p[0] || "", note: p[2] || "", head: false };
      }).filter((a) => a.text);
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
        eyebrow: "城市沙龙",
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
        tags: ["城市沙龙"],
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
      this.quickLog("保存会议", this.selected.events ? this.selected.events.title : "", "在会议管理里修改了活动字段");
      this.persist();
    },
    deleteEvent() {
      if (!this.selected.events || !confirm("确认删除该会议草稿？")) return;
      const title = this.selected.events.title;
      this.draft.events = this.draft.events.filter((event) => event !== this.selected.events);
      this.selected.events = null;
      this.logOp("删除会议", title, "从活动列表移除（可用撤销找回）");
      this.persist();
    },

    // 类型 → 前台字段一次改全：type / category / typeLabel / categoryLabel / eyebrow
    // 老数据里就存在"城市沙龙"与"城市沙龙"两种写法：前者是类型名，后者是卡片标签，
    // 这里按老数据约定写死，避免新活动缺 category 而在前台任何一栏都不出现。
    EVENT_TYPE_META: {
      summit: { typeLabel: "年度峰会", categoryLabel: "年度峰会", eyebrow: "年度峰会" },
      city: { typeLabel: "城市沙龙", categoryLabel: "城市沙龙", eyebrow: "城市沙龙" },
      elite: { typeLabel: "精英六人谈", categoryLabel: "精英六人谈", eyebrow: "精英六人谈" }
    },
    syncEventType(event) {
      if (!event) return;
      const meta = this.EVENT_TYPE_META[event.type] || this.EVENT_TYPE_META.city;
      // type 与前台归栏（category）在数据层永远保持一致，避免"类型写城市沙龙、归栏却写精英六人谈"这类打架
      event.category = event.type;
      event.typeLabel = meta.typeLabel;
      event.categoryLabel = event.categoryLabel || meta.categoryLabel;
      if (!event.eyebrow) event.eyebrow = meta.eyebrow;
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
    // 图片上传（2026-11-26 改成双通道）：
    //   本机模式 → 本机服务落盘到 assets/photos/
    //   网页模式 → 直接把图片提交进仓库 assets/photos/，同事在别的电脑也能换海报
    // 以前只有本机通道，等于"能改字不能换图"，多人协作根本跑不起来。
    readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("读取本地文件失败"));
        reader.readAsDataURL(file);
      });
    },
    safeFileName(name) {
      const base = String(name || "image.png").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
      const m = base.match(/\.([A-Za-z0-9]{2,5})$/);
      const ext = m ? "." + m[1].toLowerCase() : ".png";
      const stem = base.replace(/\.[A-Za-z0-9]{2,5}$/, "").slice(0, 40) || "image";
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" +
        Date.now().toString(36);
      return stamp + "-" + stem + ext;
    },
    async uploadImage(file, bucket) {
      const folder = String(bucket || "misc").replace(/[^A-Za-z0-9_\-\u4e00-\u9fa5]+/g, "-");
      const dataUrl = await this.readAsDataUrl(file);
      if (this.publish.mode === "local") {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, dataUrl: dataUrl, bucket: folder })
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || "本机上传失败");
        return d.path;
      }
      if (this.publish.mode !== "github") {
        this.loginOpen = true;
        throw new Error("还没登录发布账号");
      }
      const base64 = String(dataUrl).split(",")[1] || "";
      if (!base64) throw new Error("图片读取失败");
      const path = "assets/photos/" + folder + "/" + this.safeFileName(file.name);
      await this.ghJson("PUT", "/contents/" + path, {
        message: "上传图片 " + path + (this.ghLogin ? " · " + this.ghLogin : ""),
        content: base64,
        branch: this.publish.branch
      }, "上传图片");
      return path;
    },
    // 图片上传：本机发布服务负责落盘到 assets/photos/<活动编号>/，返回站内相对路径
    pickImage(kind) {
      const event = this.selected.events;
      if (!event) return;
      if (this.publish.mode === "readonly" || this.publish.mode === "unknown") {
        this.loginOpen = true;
        this.saveState = "请先登录发布账号，再上传图片";
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        this.saveState = "正在上传图片…";
        try {
          const path = await this.uploadImage(file, event.id || "misc");
          if (kind === "gallery") {
            event.gallery = (event.gallery || []).concat([path]);
          } else if (kind === "poster") {
            event.poster = path;
          } else {
            event.image = path;
            event.heroImage = path;
          }
          this.persist();
          this.saveState = "图片已上传：" + path;
        } catch (err) {
          this.saveState = "上传失败：" + (err && err.message ? err.message : "未知错误");
        }
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
    async loadManifest() {
      // 站点清单由 tools/check_site.py 扫描真实 HTML 生成：真实文件名、站内入链、能否从首页走到。
      // 后台只读它，不再自己拍脑子列页面——这样"后台列的"和"前台真有的"永远一致。
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          const res = await fetch("content/site-manifest.json?ts=" + Date.now(), { cache: "no-store" });
          if (res.ok) this.manifest = await res.json();
          // requirements.json 是内部改版要求清单，只留本机、不上公网；
          // field-policy.json 是后台能力承诺表，跟着发布，线上也要能看到。
          const isLocalHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
          if (isLocalHost) {
            const req = await fetch("content/requirements.json?ts=" + Date.now(), { cache: "no-store" });
            if (req.ok) this.requirements = await req.json();
          }
          const fp = await fetch("content/field-policy.json?ts=" + Date.now(), { cache: "no-store" });
          if (fp.ok) this.fieldPolicy = await fp.json();
        }
      } catch (err) { /* 离线打开时没有清单，退回按 key 推导 */ }
    },
    get requirementGroups() {
      return (this.requirements && this.requirements.groups) || [];
    },
    get requirementStats() {
      const all = this.requirementGroups.flatMap((g) => g.items || []);
      const count = (s) => all.filter((i) => i.status === s).length;
      return { total: all.length, done: count("done"), partial: count("partial"), todo: count("todo") };
    },
    reqStatusLabel(s) {
      return { done: "已落实", partial: "部分", todo: "未落实" }[s] || s;
    },
    // —— 可编辑范围清单 ——
    get policyGroups() {
      return (this.fieldPolicy && this.fieldPolicy.groups) || [];
    },
    get policyLevels() {
      return (this.fieldPolicy && this.fieldPolicy.levels) || [];
    },
    get policyStats() {
      const all = this.policyGroups.reduce(function (acc, g) { return acc.concat(g.items || []); }, []);
      const pick = function (v) { return all.filter(function (i) { return i.editable === v; }).length; };
      return { total: all.length, yes: pick("yes"), part: pick("part"), no: pick("no") };
    },
    policyBadge(v) {
      return { yes: "可改", part: "受限", no: "不可改" }[v] || v;
    },
    manifestOf(key) {
      const pages = (this.manifest && this.manifest.pages) || [];
      return pages.find((p) => p.key === key) || null;
    },
    get blockData() {
      return this.blocks.lang === "en" ? this.blocks.dataEn : this.blocks.data;
    },
    switchBlocksLang(lang) {
      this.blocks.lang = lang;
      this.blocks.page = "home";
      this.blocks.filter = "";
    },
    // 可编辑范围：收起/展开「说明」这一栏，选择记在本机浏览器
    togglePolicyNote() {
      this.policyNote = !this.policyNote;
      try { localStorage.setItem("dsg-admin-policy-note", this.policyNote ? "1" : "0"); } catch (err) { /* 忽略 */ }
    },
    get blockPages() {
      const src = this.blockData;
      if (!src) return [];
      const isEn = this.blocks.lang === "en";
      const rows = Object.keys(src)
        .filter((k) => k.charAt(0) !== "_")
        .map((k) => {
          const m = this.manifestOf(k);
          return {
            key: k,
            label: this.BLOCK_PAGE_LABELS[k] || k,
            file: isEn ? (m && m.enFile) || k + "-en.html" : (m && m.file) || k + ".html",
            status: isEn ? "en" : (m ? m.status : "unknown"),
            inbound: m ? m.inbound : 0,
            count: 0
          };
        })
        // 评审已决定取消的页面（如轻咨询）不再出现在可编辑列表里，避免继续往里填内容
        .filter((r) => r.status !== "retired");
      // 有问题的排前面：站内无入口 > 清单里查不到 > 正常
      const rank = { orphan: 0, unknown: 1, dynamic: 2, nav: 3, en: 3 };
      return rows.sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4));
    },
    get retiredPages() {
      return (this.manifest && this.manifest.retired) || [];
    },
    pageStatusLabel(p) {
      return {
        nav: "前台可达",
        dynamic: "由脚本进入",
        orphan: "站内无入口",
        unknown: "未在清单中",
        en: "英文版"
      }[p.status] || "";
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

    // ============================================================ 2026-11-25
    // 导航菜单 / 板块编排 / 撤销重做 / 操作留痕
    // 设计原则：后台只改 JSON，前台由 assets/nav-blocks.js 在运行时套用。
    // 默认数据 == 当前线上状态，所以「前台外观不变」和「后台能控制」可以同时成立。
    NAV_KEY: "dsg-admin-nav-v1",
    BLOCKS_CFG_KEY: "dsg-admin-blocks-cfg-v1",
    OPS_KEY: "dsg-admin-ops-v1",
    UNDO_KEY: "dsg-admin-undo-v1",
    nav: { data: null, dirty: false },
    cfg: { data: null, page: "home", selectedId: null, dirty: false },
    siteData: null,
    history: { revisions: [], ops: [], tab: "ops", loading: false, remote: false },
    undoStack: [],
    redoStack: [],
    undoMax: 40,
    lastSnap: null,
    pendingLabel: "",

    nowText() {
      const d = new Date();
      const p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    },
    actorName() {
      return (this.currentRole && this.currentRole.name) || "本地后台";
    },

    // ---------------------------------------------------------- 导航菜单
    async loadNav() {
      let remote = null;
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          const res = await fetch("content/navigation.json?ts=" + Date.now(), { cache: "no-store" });
          if (res.ok) remote = await res.json();
        }
      } catch (err) { /* 离线打开时只有草稿 */ }
      const saved = this.readJson(this.NAV_KEY, null);
      this.nav.data = saved || remote || {
        navStyle: "text", showLangSwitch: true,
        langSwitch: { label: "EN", href: "index-en.html" },
        cta: { label: "预约咨询", href: "contact.html", visible: true },
        items: []
      };
      this.nav.dirty = false;
    },
    persistNav(label) {
      try { localStorage.setItem(this.NAV_KEY, JSON.stringify(this.nav.data)); } catch (err) { /* ignore */ }
      this.nav.dirty = true;
      this.pendingLabel = label || "修改导航";
      this.quickLog("导航修改", label || "修改导航", "在「导航菜单」里调整了顶部菜单");
      this.saveState = "导航已存本机草稿（点「发布上线」才对访客生效）";
    },
    navAdd() {
      const id = "nav-" + Date.now();
      this.nav.data.items.push({ id: id, label: "新菜单项", href: "index.html", visible: true, children: [] });
      this.persistNav("新增一级菜单项");
    },
    navAddChild(item) {
      if (!item) return;
      item.children = item.children || [];
      item.children.push({ id: "nav-" + Date.now(), label: "新二级菜单", href: "events.html", visible: true });
      this.persistNav("给「" + item.label + "」新增二级菜单");
    },
    navMove(item) {
      const list = this.nav.data.items;
      const i = list.indexOf(item);
      if (i <= 0) return;
      list.splice(i - 1, 0, list.splice(i, 1)[0]);
      this.persistNav("调整导航顺序");
    },
    navMoveDown(item) {
      const list = this.nav.data.items;
      const i = list.indexOf(item);
      if (i < 0 || i >= list.length - 1) return;
      list.splice(i + 1, 0, list.splice(i, 1)[0]);
      this.persistNav("调整导航顺序");
    },
    navRemove(item, isChild, parent) {
      if (!confirm("确认删除菜单「" + item.label + "」？\n\n删除只是从导航上拿掉，页面文件仍在（可随时恢复）。要彻底删页面文件，需要另外执行。")) return;
      if (isChild && parent) {
        parent.children = (parent.children || []).filter(function (c) { return c !== item; });
      } else {
        this.nav.data.items = this.nav.data.items.filter(function (c) { return c !== item; });
      }
      this.persistNav("删除菜单「" + item.label + "」");
    },
    navToggle(item) {
      item.visible = !item.visible;
      this.persistNav((item.visible ? "显示" : "隐藏") + "菜单「" + item.label + "」");
    },
    navHideOnly(label) {
      // 快捷动作：只聚焦中文版时一键隐藏 EN
      this.nav.data.showLangSwitch = !this.nav.data.showLangSwitch;
      this.persistNav(this.nav.data.showLangSwitch ? "显示 EN 切换按钮" : "隐藏 EN 切换按钮");
    },
    navStyleSet(value) {
      this.nav.data.navStyle = value;
      this.persistNav("切换导航样式为 " + (value === "button" ? "按钮式" : "文字菜单"));
    },
    navReset() {
      if (!confirm("确认放弃本机草稿，恢复为线上导航？")) return;
      try { localStorage.removeItem(this.NAV_KEY); } catch (err) { /* ignore */ }
      this.loadNav().then(() => { this.saveState = "导航已恢复为线上状态"; });
    },

    // ---------------------------------------------------------- 板块编排
    async loadBlocksCfg() {
      let remote = null;
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          const res = await fetch("content/blocks.json?ts=" + Date.now(), { cache: "no-store" });
          if (res.ok) remote = await res.json();
        }
      } catch (err) { /* ignore */ }
      const saved = this.readJson(this.BLOCKS_CFG_KEY, null);
      this.cfg.data = saved || remote || { pages: {}, blockTypes: [], fontScaleOptions: [], themeColorOptions: [] };
      this.cfg.dirty = false;
    },
    persistCfg(label) {
      try { localStorage.setItem(this.BLOCKS_CFG_KEY, JSON.stringify(this.cfg.data)); } catch (err) { /* ignore */ }
      this.cfg.dirty = true;
      this.pendingLabel = label || "调整页面板块";
      this.quickLog("板块修改", label || "调整页面板块", "在「板块管理」里调整了 " + (this.cfgPage ? this.cfgPage.label : ""));
      this.saveState = "板块设置已存本机草稿（点「发布上线」才对访客生效）";
    },
    get cfgPages() {
      const pages = (this.cfg.data && this.cfg.data.pages) || {};
      return Object.keys(pages).map((k) => ({ key: k, label: pages[k].label || k, file: pages[k].file || "" }));
    },
    get cfgPage() {
      const pages = (this.cfg.data && this.cfg.data.pages) || {};
      return pages[this.cfg.page] || null;
    },
    get cfgSections() {
      const pg = this.cfgPage;
      if (!pg) return [];
      const all = (pg.sections || []).concat(pg.custom || []);
      return all.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },
    get cfgSelected() {
      const id = this.cfg.selectedId;
      if (!id) return null;
      return this.cfgSections.find(function (s) { return s.id === id; }) || null;
    },
    isCustomBlock(block) {
      const pg = this.cfgPage;
      if (!pg || !block) return false;
      return (pg.custom || []).indexOf(block) >= 0;
    },
    cfgSelect(id) { this.cfg.selectedId = id; },
    cfgToggle(block) {
      block.visible = !block.visible;
      this.persistCfg((block.visible ? "显示" : "隐藏") + "板块「" + block.name + "」");
    },
    cfgMove(block, dir) {
      const list = this.cfgSections;
      const i = list.indexOf(block);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      // 重新分配 order，保证顺序稳定（间距 10，方便以后插入）
      const swapped = list.slice();
      swapped.splice(j, 0, swapped.splice(i, 1)[0]);
      swapped.forEach(function (b, idx) { b.order = (idx + 1) * 10; });
      this.persistCfg("调整板块顺序");
    },
    cfgRemove(block) {
      if (!block) return;
      const pg = this.cfgPage;
      if (this.isCustomBlock(block)) {
        if (!confirm("确认删除板块「" + block.name + "」？删除后可用「撤销」找回。")) return;
        pg.custom = (pg.custom || []).filter(function (b) { return b !== block; });
        this.cfg.selectedId = null;
        this.persistCfg("删除板块「" + block.name + "」");
        return;
      }
      // 现有板块：删除 = 前台隐藏 + 标记 deleted，随时可恢复
      if (!confirm("确认删除板块「" + block.name + "」？\n\n它会从前台消失，但内容仍然保留，随时可以在这个列表里恢复。")) return;
      block.visible = false;
      block.deleted = true;
      this.persistCfg("删除板块「" + block.name + "」");
    },
    cfgRestore(block) {
      block.visible = true;
      block.deleted = false;
      this.persistCfg("恢复板块「" + block.name + "」");
    },
    get cfgDeleted() {
      const pg = this.cfgPage;
      if (!pg) return [];
      return (pg.sections || []).filter(function (s) { return s.deleted; });
    },
    cfgAdd(type) {
      const pg = this.cfgPage;
      if (!pg) return;
      const meta = (this.cfg.data.blockTypes || []).find(function (t) { return t.value === type; }) || { value: type, label: type };
      const maxOrder = this.cfgSections.reduce(function (m, b) { return Math.max(m, b.order || 0); }, 0);
      const block = {
        id: "blk-" + Date.now(),
        name: meta.label,
        type: type,
        custom: true,
        visible: true,
        order: maxOrder + 10,
        content: {
          eyebrow: "",
          title: meta.label + "标题",
          body: "在这里填写这段文字。支持换行，不支持 HTML。",
          buttonLabel: "",
          buttonHref: "",
          image: "",
          items: []
        },
        style: { bgImage: "", fontScale: "standard", themeColor: "default", align: "left" }
      };
      pg.custom = pg.custom || [];
      pg.custom.push(block);
      this.cfg.selectedId = block.id;
      this.persistCfg("新增板块「" + block.name + "」");
    },
    cfgSetStyle(block, key, value) {
      if (!block) return;
      block.style = block.style || {};
      block.style[key] = value;
      this.persistCfg("调整板块「" + block.name + "」的" +
        ({ fontScale: "字号", themeColor: "颜色", align: "对齐", bgImage: "背景图" }[key] || key));
    },
    cfgSetContent(block, key, value) {
      if (!block) return;
      block.content = block.content || {};
      block.content[key] = value;
      this.persistCfg("修改板块「" + block.name + "」的文字");
    },
    cfgRename(block, value) {
      if (!block) return;
      block.name = value;
      this.persistCfg("重命名板块");
    },
    get fontScaleOptions() { return (this.cfg.data && this.cfg.data.fontScaleOptions) || []; },
    get themeColorOptions() { return (this.cfg.data && this.cfg.data.themeColorOptions) || []; },
    get blockTypeOptions() { return (this.cfg.data && this.cfg.data.blockTypes) || []; },
    cfgReset() {
      if (!confirm("确认放弃本机草稿，恢复为线上板块设置？")) return;
      try { localStorage.removeItem(this.BLOCKS_CFG_KEY); } catch (err) { /* ignore */ }
      this.loadBlocksCfg().then(() => { this.saveState = "板块设置已恢复为线上"; });
    },
    // 板块背景图上传：本机 / 网页两条通道都支持，落点 assets/photos/blocks-<页面>/
    pickBlockImage() {
      const block = this.cfgSelected;
      if (!block) return;
      if (this.publish.mode === "readonly" || this.publish.mode === "unknown") {
        this.loginOpen = true;
        this.saveState = "请先登录发布账号，再上传图片";
        return;
      }
      const self = this;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async function () {
        const file = input.files && input.files[0];
        if (!file) return;
        self.saveState = "正在上传图片…";
        try {
          const path = await self.uploadImage(file, "blocks-" + self.cfg.page);
          block.style = block.style || {};
          block.style.bgImage = path;
          self.persistCfg("更换板块「" + block.name + "」的背景图");
          self.saveState = "已上传：" + path;
        } catch (err) {
          self.saveState = "上传失败：" + (err && err.message ? err.message : "未知错误");
        }
      };
      input.click();
    },

    // ---------------------------------------------------------- 首页数字带
    // 五格数字原先写死在 site.json 里、后台没有入口（营销要改一个数就得找人）。
    // 这里给它开唯一入口，同时把口径来源一并显示，避免"数字改了但没人知道来源"。
    async loadSite() {
      let remote = null;
      try {
        if (location.protocol === "http:" || location.protocol === "https:") {
          const res = await fetch("content/site.json?ts=" + Date.now(), { cache: "no-store" });
          if (res.ok) remote = await res.json();
        }
      } catch (err) { /* ignore */ }
      const saved = this.readJson("dsg-admin-site-v1", null);
      this.siteData = saved || remote || { homeMetrics: [] };
    },
    get homeMetrics() {
      return (this.siteData && this.siteData.homeMetrics) || [];
    },
    setMetric(index, key, value) {
      const m = this.homeMetrics[index];
      if (!m) return;
      if (key === "value") {
        m.metric = m.metric || {};
        m.metric.value = value === "" ? null : Number(value);
      } else if (key === "display") {
        m.metric = m.metric || {};
        m.metric.display = value;
      } else {
        m[key] = value;
      }
      this.pendingLabel = "修改首页数字带第 " + (index + 1) + " 格";
      try { localStorage.setItem("dsg-admin-site-v1", JSON.stringify(this.siteData)); } catch (err) { /* ignore */ }
      this.quickLog("数字修改", m.label || ("第 " + (index + 1) + " 格"), "数字带对外口径");
      this.saveState = "数字已存本机草稿（点「发布上线」才对访客生效）";
    },
    metricSource(index) {
      const m = this.homeMetrics[index];
      if (!m || !m.metric) return "";
      const p = m.metric.provenance || {};
      return p.sourceFile ? "来源：" + String(p.sourceFile).slice(0, 26) : "";
    },
    siteReset() {
      if (!confirm("确认放弃本机草稿，恢复为线上数字？")) return;
      try { localStorage.removeItem("dsg-admin-site-v1"); } catch (err) { /* ignore */ }
      this.loadSite().then(() => { this.saveState = "数字已恢复为线上"; });
    },

    // ---------------------------------------------------------- 操作留痕
    logOp(action, target, detail, level) {
      const op = {
        ts: this.nowText(), actor: this.actorName(),
        action: action, target: target || "", detail: detail || "", level: level || "A"
      };
      try {
        const q = this.readJson(this.OPS_KEY, []);
        q.push(op);
        localStorage.setItem(this.OPS_KEY, JSON.stringify(q.slice(-200)));
      } catch (err) { /* 隐私模式忽略 */ }
      this.history.ops.unshift(op);
      return op;
    },
    pendingOps() {
      return this.readJson(this.OPS_KEY, []);
    },
    clearPendingOps() {
      try { localStorage.removeItem(this.OPS_KEY); } catch (err) { /* ignore */ }
    },
    async loadHistory() {
      this.history.loading = true;
      const local = this.pendingOps().slice().reverse();
      const isLocal = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
      // 网页版：版本列表直接读仓库提交记录，任何设备、任何人都看到同一份
      if (!isLocal) {
        this.history.ops = local;
        if (this.publish.mode === "github") {
          try {
            const list = await this.ghGetJson("/commits?sha=" + this.publish.branch + "&per_page=20", "读取发布记录");
            this.history.revisions = (list || []).map((c) => {
              const meta = c.commit || {};
              const author = meta.author || {};
              return {
                id: c.sha,
                short: String(c.sha || "").slice(0, 7),
                message: String(meta.message || "").split("\n")[0],
                files: [],
                actor: author.name || "",
                ts: author.date ? new Date(author.date).toLocaleString("zh-CN", { hour12: false }) : ""
              };
            });
            this.history.remote = true;
          } catch (err) {
            this.history.revisions = [];
            this.history.remote = false;
          }
        }
        this.history.loading = false;
        return;
      }
      try {
        const r = await fetch("/api/revisions", { cache: "no-store" });
        const o = await fetch("/api/ops", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          this.history.revisions = d.items || [];
          this.history.remote = true;
        }
        if (o.ok) {
          const d2 = await o.json();
          this.history.ops = (d2.items || []).concat(local);
          this.history.remote = true;
        } else {
          this.history.ops = local;
        }
      } catch (err) {
        // 线上只读：没有本机服务，只能看这台浏览器里攒的操作
        this.history.ops = local;
        this.history.remote = false;
      }
      this.history.loading = false;
    },
    async revertTo(id) {
      if (!id) return;
      if (!confirm("确认把全站内容退回到 " + String(id).slice(0, 7) + " 这一步？\n\n会用那一步的内容覆盖当前内容，并立即发布上线。")) return;
      if (this.publish.mode === "github") {
        await this.revertGithub(id);
        return;
      }
      if (this.publish.mode !== "local") {
        this.loginOpen = true;
        this.saveState = "请先登录发布账号，再执行回退";
        return;
      }
      this.saveState = "正在回退…";
      try {
        const res = await fetch("/api/revert-to", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id })
        });
        const d = await res.json().catch(function () { return {}; });
        if (!d.ok) { this.saveState = "回退失败：" + (d.error || "服务返回异常"); return; }
        this.saveState = "已回退到 " + id + " 并发布（提交 " + (d.commit || "") + "）";
        await this.loadContent();
        await this.loadBlocks();
        await this.loadNav();
        await this.loadBlocksCfg();
        this.startWatcher();
        this.loadHistory();
      } catch (err) {
        this.saveState = "回退失败：本机后台服务未运行";
      }
    },
    /**
     * 网页端回退：把某次提交里的内容文件取出来，作为一次新提交推回去。
     * 不去改写历史（force push 会把同事的提交冲掉），而是在最新提交之上再走一步，
     * 所以任何人、任何设备都能安全回退。
     */
    async revertGithub(sha) {
      const short = String(sha).slice(0, 7);
      this.saveState = "正在读取 " + short + " 的内容…";
      try {
        const decode = (b64) => {
          const bin = atob(String(b64 || "").replace(/\s/g, ""));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return JSON.parse(new TextDecoder("utf-8").decode(bytes));
        };
        const keys = [
          ["content/events.json", "events"],
          ["content/ai-cases.json", "aiCases"],
          ["content/articles.json", "insights"],
          ["content/page-blocks.json", "pageBlocks"],
          ["content-en/page-blocks.json", "pageBlocksEn"],
          ["content/navigation.json", "navigation"],
          ["content/blocks.json", "blocks"],
          ["content/site.json", "site"]
        ];
        const payload = {
          message: "回退到 " + short + (this.ghLogin ? " · " + this.ghLogin : "")
        };
        for (const [path, key] of keys) {
          const res = await this.ghApi("/contents/" + path + "?ref=" + sha);
          if (res.status === 404) continue;
          if (!res.ok) throw new Error("读取 " + path + "（" + res.status + "）失败");
          const meta = await res.json();
          payload[key] = decode(meta.content);
        }
        const commit = await this.commitOnce(this.contentFiles(payload), payload, this.publish.branch);
        this.saveState = "已回退到 " + short + " 并发布（新提交 " + commit.slice(0, 7) + "）";
        await this.loadContent();
        await this.loadBlocks();
        await this.loadNav();
        await this.loadBlocksCfg();
        this.startWatcher();
        this.loadHistory();
      } catch (err) {
        this.saveState = "回退失败：" + (err && err.message ? err.message : "未知错误");
      }
    },

    // ---------------------------------------------------------- 撤销 / 重做
    // 每 1.2 秒对比一次，只记录真正变化的域；活动按「一条」记录，避免整份 events 撑爆存储。
    startWatcher() {
      if (this._watcher) clearInterval(this._watcher);
      this.lastSnap = this.snapshotScopes();
      const self = this;
      this._watcher = setInterval(function () { self.sampleChanges(); }, 1200);
    },
    snapshotScopes() {
      const snap = {};
      const asText = function (v) { try { return v ? JSON.stringify(v) : ""; } catch (e) { return ""; } };
      snap.navigation = asText(this.nav && this.nav.data);
      snap.blocks = asText(this.cfg && this.cfg.data);
      snap.pageBlocks = asText(this.blocks && this.blocks.lang === "en" ? this.blocks.dataEn : this.blocks.data);
      snap.theme = asText(this.theme && this.theme.draft);
      snap.site = asText(this.siteData);
      const listOf = function (arr) {
        return (arr || []).map(function (x) {
          return { id: String(x.id || x.title || ""), json: asText(x) };
        });
      };
      snap.events = listOf(this.draft && this.draft.events);
      snap.aiCases = listOf(this.draft && this.draft.aiCases);
      snap.insights = listOf(this.draft && this.draft.insights);
      return snap;
    },
    diffListScopes(beforeArr, afterArr) {
      const bm = new Map((beforeArr || []).map(function (x) { return [x.id, x.json]; }));
      const am = new Map((afterArr || []).map(function (x) { return [x.id, x.json]; }));
      const changed = [];
      am.forEach(function (json, id) {
        if (bm.get(id) !== json) changed.push({ id: id, before: bm.has(id) ? bm.get(id) : null, after: json });
      });
      bm.forEach(function (json, id) {
        if (!am.has(id)) changed.push({ id: id, before: json, after: null });
      });
      return changed.length ? changed : null;
    },
    diffScopes(before, after) {
      const scopes = {};
      let hit = false;
      ["navigation", "blocks", "pageBlocks", "theme", "site"].forEach(function (k) {
        if (before[k] !== after[k]) { scopes[k] = { before: before[k], after: after[k] }; hit = true; }
      });
      ["events", "aiCases", "insights"].forEach(function (k) {
        const d = this.diffListScopes(before[k], after[k]);
        if (d) { scopes[k] = d; hit = true; }
      }, this);
      if (!hit) return null;
      if (this.pendingLabel) this.lastLabel = this.pendingLabel;
      return { ts: this.nowText(), label: this.lastLabel || "修改内容", scopes: scopes };
    },
    sampleChanges() {
      const now = this.snapshotScopes();
      if (!this.lastSnap) { this.lastSnap = now; return; }
      const rec = this.diffScopes(this.lastSnap, now);
      if (rec) {
        this.undoStack.push(rec);
        if (this.undoStack.length > this.undoMax) this.undoStack.shift();
        this.redoStack = [];
        this.persistAll();
        this.saveUndoState();
        this.pendingLabel = "";
        this.lastLabel = "";
        this.saveState = "已记录：" + rec.label + "（" + this.nowText().slice(11) + "）";
      }
      this.lastSnap = now;
    },
    persistAll() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(this.draft));
        localStorage.setItem(this.NAV_KEY, JSON.stringify(this.nav.data));
        localStorage.setItem(this.BLOCKS_CFG_KEY, JSON.stringify(this.cfg.data));
        localStorage.setItem("dsg-admin-site-v1", JSON.stringify(this.siteData));
        const bk = this.blocks.lang === "en" ? "dsg-admin-blocks-en-v1" : "dsg-admin-blocks-zh-v1";
        localStorage.setItem(bk, JSON.stringify(this.blocks.lang === "en" ? this.blocks.dataEn : this.blocks.data));
      } catch (err) { /* 配额满时忽略，内存里仍有 */ }
    },
    saveUndoState() {
      try {
        localStorage.setItem(this.UNDO_KEY, JSON.stringify({
          undo: this.undoStack.slice(-this.undoMax), redo: this.redoStack.slice(-this.undoMax)
        }));
      } catch (err) {
        // 存不下就只保留最近 10 步
        try {
          localStorage.setItem(this.UNDO_KEY, JSON.stringify({
            undo: this.undoStack.slice(-10), redo: this.redoStack.slice(-10)
          }));
        } catch (e2) { /* 放弃持久化，内存里仍可撤销 */ }
      }
    },
    restoreUndoState() {
      const saved = this.readJson(this.UNDO_KEY, null);
      if (!saved) return;
      this.undoStack = saved.undo || [];
      this.redoStack = saved.redo || [];
    },
    applyScopes(rec, key) {
      const s = (rec && rec.scopes) || {};
      if (s.navigation) this.nav.data = JSON.parse(s.navigation[key] || "null");
      if (s.blocks) this.cfg.data = JSON.parse(s.blocks[key] || "null");
      if (s.pageBlocks) {
        const parsed = JSON.parse(s.pageBlocks[key] || "null");
        if (this.blocks.lang === "en") this.blocks.dataEn = parsed; else this.blocks.data = parsed;
      }
      if (s.theme) this.theme.draft = JSON.parse(s.theme[key] || "null");
      if (s.site) this.siteData = JSON.parse(s.site[key] || "null");
      const self = this;
      ["events", "aiCases", "insights"].forEach(function (k) {
        const changes = s[k];
        if (!changes) return;
        const target = self.draft[k] || [];
        changes.forEach(function (c) {
          const idx = target.findIndex(function (x) {
            return String(x.id || x.title || "") === c.id;
          });
          const raw = c[key];
          if (raw === null) {
            if (idx >= 0) target.splice(idx, 1);
            return;
          }
          const obj = JSON.parse(raw);
          if (idx >= 0) target[idx] = obj; else target.push(obj);
        });
        self.draft[k] = target;
      });
    },
    undo() {
      if (!this.undoStack.length) { this.saveState = "没有可撤销的操作"; return; }
      const rec = this.undoStack.pop();
      this.applyScopes(rec, "before");
      this.redoStack.push(rec);
      this.persistAll();
      this.saveUndoState();
      this.lastSnap = this.snapshotScopes();
      this.saveState = "已撤销：" + rec.label;
    },
    redo() {
      if (!this.redoStack.length) { this.saveState = "没有可重做的操作"; return; }
      const rec = this.redoStack.pop();
      this.applyScopes(rec, "after");
      this.undoStack.push(rec);
      this.persistAll();
      this.saveUndoState();
      this.lastSnap = this.snapshotScopes();
      this.saveState = "已重做：" + rec.label;
    },
    get canUndo() { return this.undoStack.length > 0; },
    get canRedo() { return this.redoStack.length > 0; },
    get undoLabel() { return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : ""; },
    get redoLabel() { return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : ""; },
    clearUndo() {
      if (!confirm("确认清空撤销与重做记录？历史快照不受影响。")) return;
      this.undoStack = [];
      this.redoStack = [];
      this.saveUndoState();
      this.saveState = "撤销记录已清空";
    },
    // 按 3 秒合并的轻量留痕：只记"做了什么"，不存全量内容
    quickLog(action, target, detail) {
      const key = "_lastOpKey";
      const stamp = Date.now();
      if (this[key] && this[key].k === action + "|" + target && stamp - this[key].t < 3000) {
        this[key].t = stamp;
        return;
      }
      this[key] = { k: action + "|" + target, t: stamp };
      this.logOp(action, target, detail);
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
        navigation: { name: "navigation.json", data: this.nav.data },
        blocks: { name: "blocks.json", data: this.cfg.data },
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
