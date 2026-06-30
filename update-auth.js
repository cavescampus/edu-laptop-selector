(() => {
  const ADMIN_PASSWORD = "Cavesbooks";
  const SESSION_KEY = "education-update-auth";
  const state = { unlocked: false };
  const els = {};

  function injectStyles() {
    if (document.getElementById("update-auth-styles")) return;
    const style = document.createElement("style");
    style.id = "update-auth-styles";
    style.textContent = `
      .is-auth-locked .shell { filter: blur(6px); pointer-events: none; user-select: none; }
      .auth-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(17,20,24,.66); }
      .auth-overlay[hidden] { display: none; }
      .auth-panel { width: min(100%, 460px); padding: 24px; border: 1px solid var(--line, #ddd6ca); border-radius: 10px; background: var(--paper, #fffdf9); box-shadow: 0 24px 70px rgba(18,20,24,.24); }
      .auth-title { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
      .auth-text, .auth-subnote { color: var(--muted, #6a665f); line-height: 1.7; }
      .auth-form { display: grid; gap: 12px; margin-top: 18px; }
      .auth-field { display: grid; gap: 6px; }
      .auth-field span { color: var(--muted, #6a665f); font-size: 12px; font-weight: 800; }
      .auth-field input { min-height: 46px; padding: 0 12px; border: 1px solid var(--line, #ddd6ca); border-radius: 6px; background: #fff; color: var(--ink, #1b1e23); }
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
      <div class="auth-overlay" id="auth-overlay">
        <section class="auth-panel" aria-labelledby="auth-title">
          <p class="eyebrow">更新入口</p>
          <h1 class="auth-title" id="auth-title">請輸入後台密碼</h1>
          <p class="auth-text">輸入管理密碼即可進入更新後台，不需要另外輸入帳號。</p>
          <form class="auth-form" id="auth-password-form">
            <label class="auth-field">
              <span>後台密碼</span>
              <input autocomplete="current-password" id="auth-password" type="password" autofocus />
            </label>
            <button class="button primary" type="submit">進入後台</button>
          </form>
          <div class="auth-status" id="auth-status">請輸入後台密碼。</div>
          <div class="auth-subnote">密碼通過後，本次瀏覽期間可直接操作後台。</div>
        </section>
      </div>
    `);
  }

  function cacheElements() {
    els.overlay = document.getElementById("auth-overlay");
    els.status = document.getElementById("auth-status");
    els.logout = document.getElementById("auth-logout");
    els.form = document.getElementById("auth-password-form");
    els.password = document.getElementById("auth-password");
  }

  function patchPageCopy() {
    const lead = Array.from(document.querySelectorAll(".lead")).find((item) =>
      item.textContent.includes("公司帳號"),
    );
    if (lead) {
      lead.textContent =
        "請輸入後台密碼後，再上傳 Excel 與圖片資料夾。系統會比對相同機型、規格差異與圖片是否對應，完成後可直接更新或一鍵發布。";
    }

    const authPill = document.getElementById("auth-pill");
    if (authPill) {
      authPill.textContent = state.unlocked ? "已解鎖後台" : "未解鎖";
      authPill.className = state.unlocked ? "pill good" : "pill danger";
    }

    for (const pill of document.querySelectorAll(".pill.good")) {
      if (pill.textContent.trim() === "需要登入") {
        pill.textContent = "需要後台密碼";
      }
    }
  }

  function installFetchRedirect() {
    if (window.__updatePasswordFetchRedirect) return;
    window.__updatePasswordFetchRedirect = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const rawUrl = typeof input === "string" ? input : input?.url || "";
      if (rawUrl.includes("/.netlify/functions/update")) {
        const nextUrl = rawUrl.replace("/.netlify/functions/update", "/.netlify/functions/update-password");
        return originalFetch(nextUrl, init);
      }
      return originalFetch(input, init);
    };
  }

  function setStatus(message, kind = "") {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.className = kind ? `auth-status ${kind}` : "auth-status";
  }

  function readSession() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeSession(value) {
    try {
      if (value) {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Session storage is only a convenience. The in-memory state still works.
    }
  }

  function syncAuth(unlocked) {
    state.unlocked = Boolean(unlocked);
    document.body.classList.toggle("is-authenticated", state.unlocked);
    document.body.classList.toggle("is-auth-locked", !state.unlocked);
    if (els.overlay) els.overlay.hidden = state.unlocked;

    document.dispatchEvent(
      new CustomEvent("update-auth-change", {
        detail: { user: state.unlocked ? { name: "後台管理者", email: "後台已解鎖" } : null },
      }),
    );
    patchPageCopy();

    if (state.unlocked) {
      setStatus("密碼正確，已進入後台。", "good");
    } else {
      setStatus("請輸入後台密碼。");
    }
  }

  function unlockWithPassword(password) {
    if (password !== ADMIN_PASSWORD) {
      throw new Error("後台密碼不正確。");
    }
    writeSession(true);
    syncAuth(true);
  }

  async function getAuthHeader() {
    if (!state.unlocked && !readSession()) {
      throw new Error("請先輸入後台密碼。");
    }
    return { "X-Update-Password": ADMIN_PASSWORD };
  }

  window.updateAuth = {
    getCurrentUser: () => (state.unlocked ? { name: "後台管理者", email: "後台已解鎖" } : null),
    getAuthHeader,
    lock: () => {
      writeSession(false);
      syncAuth(false);
    },
  };

  function boot() {
    injectStyles();
    injectOverlay();
    cacheElements();
    document.body.classList.add("is-auth-locked");
    installFetchRedirect();
    patchPageCopy();

    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        unlockWithPassword(els.password.value);
        els.password.value = "";
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "warn");
        els.password.select();
      }
    });

    els.logout?.addEventListener("click", () => {
      writeSession(false);
      syncAuth(false);
      els.password?.focus();
    });

    syncAuth(readSession());
    window.setTimeout(patchPageCopy, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
