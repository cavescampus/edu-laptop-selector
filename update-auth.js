(() => {
  const allowedDomains = ["caves.com.tw", "cavesbooks.com.tw"];
  const identityUrl = "https://identity.netlify.com/v1/netlify-identity-widget.js";
  const state = { user: null, loading: null };
  const els = {};

  function injectStyles() {
    if (document.getElementById("update-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "update-auth-styles";
    style.textContent = `
      .is-auth-locked .shell { filter: blur(6px); pointer-events: none; user-select: none; }
      .auth-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(17,20,24,.66); }
      .auth-overlay[hidden] { display: none; }
      .auth-panel { width: min(100%, 520px); padding: 24px; border: 1px solid var(--line, #ddd6ca); border-radius: 10px; background: var(--paper, #fffdf9); box-shadow: 0 24px 70px rgba(18,20,24,.24); }
      .auth-title { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
      .auth-text, .auth-subnote { color: var(--muted, #6a665f); line-height: 1.7; }
      .auth-tabs, .auth-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .auth-chip { display: inline-flex; align-items: center; min-height: 30px; padding: 4px 10px; border: 1px solid var(--line, #ddd6ca); border-radius: 999px; background: #f7f2e9; color: var(--accent-dark, #084f48); font-size: 12px; font-weight: 800; }
      .auth-tabs { margin: 18px 0 14px; }
      .auth-tab { flex: 1 1 0; min-height: 42px; border: 1px solid var(--line, #ddd6ca); border-radius: 6px; background: #fff; color: var(--ink, #1b1e23); font-size: 14px; font-weight: 800; }
      .auth-tab.is-active { background: var(--accent, #0d6b5f); border-color: var(--accent, #0d6b5f); color: #fff; }
      .auth-form { display: grid; gap: 10px; }
      .auth-field { display: grid; gap: 6px; }
      .auth-field span { color: var(--muted, #6a665f); font-size: 12px; font-weight: 800; }
      .auth-field input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line, #ddd6ca); border-radius: 6px; background: #fff; color: var(--ink, #1b1e23); }
      .auth-status { min-height: 22px; margin-top: 10px; color: var(--muted, #6a665f); font-size: 13px; line-height: 1.7; }
      .auth-status.warn { color: var(--danger, #b73535); }
      .auth-status.good { color: var(--accent-dark, #084f48); }
      .auth-logout { position: fixed; top: 18px; right: 18px; z-index: 51; }
      body:not(.is-authenticated) .auth-logout { display: none; }
    `;
    document.head.appendChild(style);
  }

  function injectOverlay() {
    if (document.getElementById("auth-overlay")) return;
    document.body.insertAdjacentHTML("afterbegin", `
      <button class="button ghost auth-logout" id="auth-logout" type="button">登出</button>
      <div class="auth-overlay" id="auth-overlay">
        <section class="auth-panel" aria-labelledby="auth-title">
          <p class="eyebrow">更新入口</p>
          <h1 class="auth-title" id="auth-title">請先登入</h1>
          <p class="auth-text">僅接受 @caves.com.tw 或 @cavesbooks.com.tw 的帳號。</p>
          <div class="auth-chip-row"><span class="auth-chip">帳號申請</span><span class="auth-chip">密碼登入</span><span class="auth-chip">忘記密碼</span></div>
          <div class="auth-tabs" role="tablist" aria-label="登入功能切換">
            <button class="auth-tab is-active" id="auth-tab-login" type="button">登入</button>
            <button class="auth-tab" id="auth-tab-signup" type="button">建立帳號</button>
            <button class="auth-tab" id="auth-tab-reset" type="button">忘記密碼</button>
          </div>
          <form class="auth-form" id="auth-login-form">
            <label class="auth-field"><span>信箱</span><input autocomplete="email" id="auth-login-email" type="email" /></label>
            <label class="auth-field"><span>密碼</span><input autocomplete="current-password" id="auth-login-password" type="password" /></label>
            <button class="button primary" type="submit">登入</button>
          </form>
          <form class="auth-form" id="auth-signup-form" hidden>
            <label class="auth-field"><span>信箱</span><input autocomplete="email" id="auth-signup-email" type="email" /></label>
            <label class="auth-field"><span>密碼</span><input autocomplete="new-password" id="auth-signup-password" type="password" /></label>
            <label class="auth-field"><span>確認密碼</span><input autocomplete="new-password" id="auth-signup-password2" type="password" /></label>
            <button class="button primary" type="submit">建立帳號</button>
          </form>
          <form class="auth-form" id="auth-reset-form" hidden>
            <label class="auth-field"><span>信箱</span><input autocomplete="email" id="auth-reset-email" type="email" /></label>
            <button class="button primary" type="submit">寄送重設連結</button>
          </form>
          <div class="auth-status" id="auth-status">請使用公司信箱登入。</div>
          <div class="auth-subnote">帳號申請與重設密碼都只接受指定網域。</div>
        </section>
      </div>
    `);
  }

  function cacheElements() {
    els.overlay = document.getElementById("auth-overlay");
    els.status = document.getElementById("auth-status");
    els.logout = document.getElementById("auth-logout");
    els.tabLogin = document.getElementById("auth-tab-login");
    els.tabSignup = document.getElementById("auth-tab-signup");
    els.tabReset = document.getElementById("auth-tab-reset");
    els.loginForm = document.getElementById("auth-login-form");
    els.signupForm = document.getElementById("auth-signup-form");
    els.resetForm = document.getElementById("auth-reset-form");
    els.loginEmail = document.getElementById("auth-login-email");
    els.loginPassword = document.getElementById("auth-login-password");
    els.signupEmail = document.getElementById("auth-signup-email");
    els.signupPassword = document.getElementById("auth-signup-password");
    els.signupPassword2 = document.getElementById("auth-signup-password2");
    els.resetEmail = document.getElementById("auth-reset-email");
  }

  function isAllowedEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    return allowedDomains.some((domain) => email.endsWith(`@${domain}`));
  }

  function setStatus(message, kind = "") {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.className = kind ? `auth-status ${kind}` : "auth-status";
  }

  function setMode(mode) {
    const isLogin = mode === "login";
    els.loginForm.hidden = !isLogin;
    els.signupForm.hidden = mode !== "signup";
    els.resetForm.hidden = mode !== "reset";
    els.tabLogin.className = isLogin ? "auth-tab is-active" : "auth-tab";
    els.tabSignup.className = mode === "signup" ? "auth-tab is-active" : "auth-tab";
    els.tabReset.className = mode === "reset" ? "auth-tab is-active" : "auth-tab";
  }

  function syncUser(user) {
    state.user = user || null;
    const signedIn = Boolean(state.user);
    document.body.classList.toggle("is-authenticated", signedIn);
    document.body.classList.toggle("is-auth-locked", !signedIn);
    els.overlay.hidden = signedIn;
    document.dispatchEvent(new CustomEvent("update-auth-change", { detail: { user: state.user } }));
    if (signedIn) {
      setStatus(`已登入：${state.user.email}`, "good");
    } else {
      setStatus("請使用公司信箱登入。");
      setMode("login");
    }
  }

  function getIdentity() {
    const identity = window.netlifyIdentity;
    if (!identity) throw new Error("登入元件尚未載入，請先確認 Netlify Identity 已啟用。");
    return identity;
  }

  async function ensureIdentity() {
    if (window.netlifyIdentity) return window.netlifyIdentity;
    if (!state.loading) {
      state.loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = identityUrl;
        script.async = true;
        script.onload = () => resolve(window.netlifyIdentity);
        script.onerror = () => reject(new Error("無法載入登入元件。"));
        document.head.appendChild(script);
      });
    }
    return state.loading;
  }

  async function login(email, password) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) throw new Error("登入信箱只接受 @caves.com.tw 或 @cavesbooks.com.tw。");
    return identity.login(email, password);
  }

  async function signup(email, password) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) throw new Error("申請帳號只接受 @caves.com.tw 或 @cavesbooks.com.tw。");
    return identity.signup(email, password);
  }

  async function resetPassword(email) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) throw new Error("重設密碼只接受 @caves.com.tw 或 @cavesbooks.com.tw。");
    const method = identity.requestPasswordRecovery || identity.recover || identity.requestRecoveryEmail || identity.sendPasswordRecoveryEmail;
    if (typeof method !== "function") throw new Error("目前登入元件不支援重設密碼。");
    return method.call(identity, email);
  }

  async function getAuthHeader() {
    const identity = await ensureIdentity();
    const user = identity.currentUser?.();
    if (!user) throw new Error("請先登入。");
    return { Authorization: `Bearer ${await user.jwt()}` };
  }

  window.updateAuth = {
    getCurrentUser: () => state.user,
    getAuthHeader,
    ensureIdentity,
    setMode,
  };

  async function boot() {
    injectStyles();
    injectOverlay();
    cacheElements();
    document.body.classList.add("is-auth-locked");

    els.tabLogin.addEventListener("click", () => setMode("login"));
    els.tabSignup.addEventListener("click", () => setMode("signup"));
    els.tabReset.addEventListener("click", () => setMode("reset"));
    els.logout.addEventListener("click", async () => {
      const identity = await ensureIdentity();
      identity.logout();
    });

    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("登入中...");
        await login(els.loginEmail.value, els.loginPassword.value);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    els.signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        if (els.signupPassword.value !== els.signupPassword2.value) throw new Error("兩次輸入的密碼不一致。");
        setStatus("建立帳號中...");
        await signup(els.signupEmail.value, els.signupPassword.value);
        setStatus("帳號申請已送出，請依信箱完成確認。", "good");
        setMode("login");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    els.resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("寄送重設連結中...");
        await resetPassword(els.resetEmail.value);
        setStatus("重設密碼連結已寄出，請到公司信箱收信。", "good");
        setMode("login");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    try {
      const identity = await ensureIdentity();
      identity.on("init", syncUser);
      identity.on("login", syncUser);
      identity.on("logout", () => syncUser(null));
      identity.init();
      syncUser(identity.currentUser?.() || null);
    } catch (error) {
      syncUser(null);
      setStatus(error instanceof Error ? error.message : String(error), "warn");
    }

    setMode("login");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
