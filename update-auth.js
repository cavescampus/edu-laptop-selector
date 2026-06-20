(() => {
  const allowedDomains = ["cave.com.tw", "cavesbooks.com.tw"];
  const updateApiPath = "/.netlify/functions/update";
  const identityScriptUrl = "https://identity.netlify.com/v1/netlify-identity-widget.js";

  const state = {
    identityReady: false,
    currentUser: null,
    mode: "login",
  };

  const styles = `
    .is-auth-locked .shell {
      filter: blur(6px);
      pointer-events: none;
      user-select: none;
    }

    .auth-overlay {
      align-items: center;
      background: rgba(17, 20, 24, 0.66);
      inset: 0;
      display: flex;
      justify-content: center;
      padding: 18px;
      position: fixed;
      z-index: 50;
    }

    .auth-overlay[hidden] {
      display: none;
    }

    .auth-panel {
      background: var(--paper, #fffdf9);
      border: 1px solid var(--line, #ddd6ca);
      border-radius: 10px;
      box-shadow: 0 24px 70px rgba(18, 20, 24, 0.24);
      max-width: 520px;
      padding: 24px;
      width: min(100%, 520px);
    }

    .auth-title {
      font-size: 28px;
      line-height: 1.15;
      margin: 0 0 10px;
    }

    .auth-text {
      color: var(--muted, #6a665f);
      font-size: 14px;
      line-height: 1.7;
      margin: 0 0 14px;
    }

    .auth-chip-row,
    .auth-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .auth-chip {
      align-items: center;
      background: #f7f2e9;
      border: 1px solid var(--line, #ddd6ca);
      border-radius: 999px;
      color: var(--accent-dark, #084f48);
      display: inline-flex;
      font-size: 12px;
      font-weight: 800;
      min-height: 30px;
      padding: 4px 10px;
    }

    .auth-tabs {
      margin: 18px 0 14px;
    }

    .auth-tab {
      background: #fff;
      border: 1px solid var(--line, #ddd6ca);
      border-radius: 6px;
      color: var(--ink, #1b1e23);
      flex: 1 1 0;
      font-size: 14px;
      font-weight: 800;
      min-height: 42px;
    }

    .auth-tab.is-active {
      background: var(--accent, #0d6b5f);
      border-color: var(--accent, #0d6b5f);
      color: #fff;
    }

    .auth-form {
      display: grid;
      gap: 10px;
    }

    .auth-field {
      display: grid;
      gap: 6px;
    }

    .auth-field span {
      color: var(--muted, #6a665f);
      font-size: 12px;
      font-weight: 800;
    }

    .auth-field input {
      background: #fff;
      border: 1px solid var(--line, #ddd6ca);
      border-radius: 6px;
      color: var(--ink, #1b1e23);
      min-height: 44px;
      padding: 0 12px;
    }

    .auth-status {
      color: var(--muted, #6a665f);
      font-size: 13px;
      line-height: 1.7;
      margin-top: 10px;
      min-height: 22px;
    }

    .auth-status.warn {
      color: var(--danger, #b73535);
    }

    .auth-status.good {
      color: var(--accent-dark, #084f48);
    }

    .auth-subnote {
      color: var(--muted, #6a665f);
      font-size: 12px;
      line-height: 1.6;
      margin-top: 14px;
    }

    .auth-logout {
      position: fixed;
      right: 18px;
      top: 18px;
      z-index: 51;
    }

    body:not(.is-authenticated) .auth-logout {
      display: none;
    }
  `;

  function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function isAllowedEmail(value) {
    const email = normalizeEmail(value);
    return allowedDomains.some((domain) => email.endsWith(`@${domain}`));
  }

  function injectStyles() {
    if (document.getElementById("update-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "update-auth-styles";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function injectOverlay() {
    if (document.getElementById("auth-overlay")) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <button class="button ghost auth-logout" id="auth-logout" type="button">登出</button>
        <div class="auth-overlay" id="auth-overlay">
          <section class="auth-panel" aria-labelledby="auth-title">
            <p class="eyebrow">更新入口</p>
            <h1 class="auth-title" id="auth-title">請先登入</h1>
            <p class="auth-text">
              僅接受 @cave.com.tw 或 @cavesbooks.com.tw 的帳號。登入後才可進入更新頁、上傳 Excel 與照片。
            </p>
            <div class="auth-chip-row">
              <span class="auth-chip">帳號申請</span>
              <span class="auth-chip">密碼登入</span>
              <span class="auth-chip">忘記密碼</span>
            </div>
            <div class="auth-tabs" role="tablist" aria-label="登入功能切換">
              <button class="auth-tab is-active" id="auth-tab-login" type="button">登入</button>
              <button class="auth-tab" id="auth-tab-signup" type="button">建立帳號</button>
              <button class="auth-tab" id="auth-tab-reset" type="button">忘記密碼</button>
            </div>
            <form class="auth-form" id="auth-login-form">
              <label class="auth-field">
                <span>信箱</span>
                <input autocomplete="email" id="auth-login-email" type="email" />
              </label>
              <label class="auth-field">
                <span>密碼</span>
                <input autocomplete="current-password" id="auth-login-password" type="password" />
              </label>
              <button class="button primary" type="submit">登入</button>
            </form>
            <form class="auth-form" id="auth-signup-form" hidden>
              <label class="auth-field">
                <span>信箱</span>
                <input autocomplete="email" id="auth-signup-email" type="email" />
              </label>
              <label class="auth-field">
                <span>密碼</span>
                <input autocomplete="new-password" id="auth-signup-password" type="password" />
              </label>
              <label class="auth-field">
                <span>確認密碼</span>
                <input autocomplete="new-password" id="auth-signup-password2" type="password" />
              </label>
              <button class="button primary" type="submit">建立帳號</button>
            </form>
            <form class="auth-form" id="auth-reset-form" hidden>
              <label class="auth-field">
                <span>信箱</span>
                <input autocomplete="email" id="auth-reset-email" type="email" />
              </label>
              <button class="button primary" type="submit">寄送重設連結</button>
            </form>
            <div class="auth-status" id="auth-status">請使用公司信箱登入。</div>
            <div class="auth-subnote">
              帳號申請與重設密碼都只接受指定網域。若系統尚未啟用 Netlify Identity，這個畫面會停留在登入狀態。
            </div>
          </section>
        </div>
      `,
    );
  }

  function showMode(mode) {
    state.mode = mode;
    const isLogin = mode === "login";
    const isSignup = mode === "signup";
    const isReset = mode === "reset";
    els.authLoginForm.hidden = !isLogin;
    els.authSignupForm.hidden = !isSignup;
    els.authResetForm.hidden = !isReset;
    els.authTabLogin.className = isLogin ? "auth-tab is-active" : "auth-tab";
    els.authTabSignup.className = isSignup ? "auth-tab is-active" : "auth-tab";
    els.authTabReset.className = isReset ? "auth-tab is-active" : "auth-tab";
  }

  function setStatus(message, kind = "") {
    els.authStatus.textContent = message;
    els.authStatus.className = kind ? `auth-status ${kind}` : "auth-status";
  }

  function setAuthenticated(user) {
    state.currentUser = user ?? null;
    const loggedIn = Boolean(state.currentUser);
    document.body.classList.toggle("is-authenticated", loggedIn);
    document.body.classList.toggle("is-auth-locked", !loggedIn);
    els.authOverlay.hidden = loggedIn;
    if (loggedIn) {
      setStatus(`已登入：${state.currentUser.email}`, "good");
    } else {
      setStatus("請使用公司信箱登入。");
      showMode("login");
    }
  }

  function getIdentity() {
    const identity = window.netlifyIdentity;
    if (!identity) {
      throw new Error("登入元件尚未載入，請先確認 Netlify Identity 已啟用。");
    }
    return identity;
  }

  async function ensureIdentity() {
    if (window.netlifyIdentity) {
      return window.netlifyIdentity;
    }

    if (!window.__updateIdentityLoading) {
      window.__updateIdentityLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = identityScriptUrl;
        script.async = true;
        script.onload = () => resolve(window.netlifyIdentity);
        script.onerror = () => reject(new Error("無法載入登入元件。"));
        document.head.appendChild(script);
      });
    }

    await window.__updateIdentityLoading;
    return window.netlifyIdentity;
  }

  async function loginUser(email, password) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) {
      throw new Error("登入信箱只接受 @cave.com.tw 或 @cavesbooks.com.tw。");
    }
    return identity.login(email, password);
  }

  async function signupUser(email, password) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) {
      throw new Error("申請帳號只接受 @cave.com.tw 或 @cavesbooks.com.tw。");
    }
    return identity.signup(email, password);
  }

  async function resetPassword(email) {
    const identity = await ensureIdentity();
    if (!isAllowedEmail(email)) {
      throw new Error("重設密碼只接受 @cave.com.tw 或 @cavesbooks.com.tw。");
    }
    const method =
      identity.requestPasswordRecovery ||
      identity.recover ||
      identity.requestRecoveryEmail ||
      identity.sendPasswordRecoveryEmail;
    if (typeof method !== "function") {
      throw new Error("目前登入元件不支援重設密碼。");
    }
    return method.call(identity, email);
  }

  async function getAuthHeader() {
    const identity = await ensureIdentity();
    const user = identity.currentUser?.();
    if (!user) {
      throw new Error("請先登入。");
    }
    const jwt = await user.jwt();
    return `Bearer ${jwt}`;
  }

  function installFetchGuard() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!String(url).includes(updateApiPath)) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init.headers || {});
      headers.set("Authorization", await getAuthHeader());
      return originalFetch(input, {
        ...init,
        headers,
      });
    };
  }

  const els = {};
  function cacheElements() {
    els.authOverlay = document.getElementById("auth-overlay");
    els.authStatus = document.getElementById("auth-status");
    els.authLogout = document.getElementById("auth-logout");
    els.authTabLogin = document.getElementById("auth-tab-login");
    els.authTabSignup = document.getElementById("auth-tab-signup");
    els.authTabReset = document.getElementById("auth-tab-reset");
    els.authLoginForm = document.getElementById("auth-login-form");
    els.authSignupForm = document.getElementById("auth-signup-form");
    els.authResetForm = document.getElementById("auth-reset-form");
    els.authLoginEmail = document.getElementById("auth-login-email");
    els.authLoginPassword = document.getElementById("auth-login-password");
    els.authSignupEmail = document.getElementById("auth-signup-email");
    els.authSignupPassword = document.getElementById("auth-signup-password");
    els.authSignupPassword2 = document.getElementById("auth-signup-password2");
    els.authResetEmail = document.getElementById("auth-reset-email");
  }

  async function boot() {
    injectStyles();
    injectOverlay();
    cacheElements();
    installFetchGuard();
    document.body.classList.add("is-auth-locked");

    els.authTabLogin.addEventListener("click", () => showMode("login"));
    els.authTabSignup.addEventListener("click", () => showMode("signup"));
    els.authTabReset.addEventListener("click", () => showMode("reset"));
    els.authLogout.addEventListener("click", async () => {
      const identity = await ensureIdentity();
      identity.logout();
    });

    els.authLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("登入中...");
        await loginUser(els.authLoginEmail.value, els.authLoginPassword.value);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    els.authSignupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        if (els.authSignupPassword.value !== els.authSignupPassword2.value) {
          throw new Error("兩次輸入的密碼不一致。");
        }
        setStatus("建立帳號中...");
        await signupUser(els.authSignupEmail.value, els.authSignupPassword.value);
        setStatus("帳號已送出申請，請到信箱完成確認。", "good");
        showMode("login");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    els.authResetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("寄送重設連結中...");
        await resetPassword(els.authResetEmail.value);
        setStatus("重設密碼連結已寄出，請到公司信箱收信。", "good");
        showMode("login");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
      }
    });

    try {
      const identity = await ensureIdentity();
      identity.on("init", setAuthenticated);
      identity.on("login", setAuthenticated);
      identity.on("logout", () => setAuthenticated(null));
      identity.init();
      setAuthenticated(identity.currentUser?.() || null);
    } catch (error) {
      setAuthenticated(null);
      setStatus(error instanceof Error ? error.message : String(error), "warn");
    }

    showMode("login");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
