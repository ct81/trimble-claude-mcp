/**
 * i18n.js - one-file translation script for any web app (no dependencies)
 *
 * Features: auto-detect language, language switcher with SVG flags (works on
 * Windows), 100% width, saved choice, RTL support, placeholders {name}, plurals,
 * fallback language, dynamic content, Intl formatting.
 *
 * HTML attributes:
 *   data-i18n="key"               -> element text
 *   data-i18n-html="key"          -> element innerHTML (trusted strings only)
 *   data-i18n-placeholder="key"   -> placeholder
 *   data-i18n-title="key"         -> title
 *   data-i18n-aria-label="key"    -> aria-label
 *   data-i18n-params='{"name":"Ann"}'  -> values for {name}
 *   <select data-lang-switcher></select>  -> replaced by a flag dropdown
 */
(function (global) {
  "use strict";

  // ======== 1. YOUR TRANSLATIONS (edit here or load from JSON files) ========
  const config = {
    defaultLang: "en",
    storageKey: "app.lang",
    rtl: ["ar", "he", "fa", "ur"],
    // Optional: load from files instead, e.g. "lang/{lang}.json"
    urlPattern: null,
    languages: {
      en: "English",
      es: "Español",
      fr: "Français",
      hi: "हिन्दी",
    },
    // Inline SVG flags (no emoji, no external files). Add one per language.
    flags: {
      en: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="3"/><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/></svg>',
      es: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#C60B1E"/><rect y="5" width="30" height="10" fill="#FFC400"/></svg>',
      fr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="10" height="20" fill="#0055A4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#EF4135"/></svg>',
      hi: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="6.67" fill="#FF9933"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#138808"/><circle cx="15" cy="10" r="2.5" fill="none" stroke="#000080" stroke-width=".5"/><circle cx="15" cy="10" r=".5" fill="#000080"/></svg>',
    },
    translations: {
      en: {
        title: "JSON Exporter",
        welcome: "Welcome, {name}!",
        palette_brand_description: "Built to Adapt, Connect Like Nerves & Designed to Thrive",
        items: { one: "{count} item", other: "{count} items" },
      },
      es: {
        title: "Exportador JSON",
        welcome: "¡Bienvenido, {name}!",
        palette_brand_description: "Creado para adaptarse, conectar como los nervios y diseñado para prosperar",
        items: { one: "{count} elemento", other: "{count} elementos" },
      },
      fr: {
        title: "Exportateur JSON",
        welcome: "Bienvenue, {name} !",
        palette_brand_description: "Conçu pour s’adapter, se connecter comme des nerfs et pensé pour prospérer",
        items: { one: "{count} élément", other: "{count} éléments" },
      },
      hi: {
        title: "JSON एक्सपोर्टर",
        welcome: "स्वागत है, {name}!",
        palette_brand_description: "अनुकूलन के लिए निर्मित, तंत्रिकाओं की तरह जुड़ने वाला और फलने-फूलने के लिए डिज़ाइन किया गया",
        items: { one: "{count} आइटम", other: "{count} आइटम" },
      },
    },
  };

  // ======== 2. CORE ========
  let current = config.defaultLang;
  const listeners = [];

  const base = (code) => String(code || "").toLowerCase().split("-")[0];

  function lookup(lang, key) {
    const dict = config.translations[lang];
    if (!dict) return undefined;
    // supports nested keys: "menu.file.open"
    return key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  }

  function format(str, params) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) =>
      params && params[k] !== undefined ? params[k] : m
    );
  }

  /** Translate a key. t("welcome", {name:"Ann"})  |  t("items", {count: 3}) */
  function t(key, params) {
    let val = lookup(current, key);
    if (val === undefined) val = lookup(config.defaultLang, key); // fallback
    if (val === undefined) return key; // visible missing key
    if (val && typeof val === "object") {
      const count = params && params.count;
      const rule = count !== undefined ? new Intl.PluralRules(current).select(count) : "other";
      val = val[rule] ?? val.other ?? Object.values(val)[0];
    }
    return format(val, params);
  }

  function translateElement(root) {
    const scope = root || document;
    const q = (attr) => (scope.querySelectorAll ? scope.querySelectorAll(`[${attr}]`) : []);
    const params = (el) => {
      try { return JSON.parse(el.getAttribute("data-i18n-params") || "{}"); } catch { return {}; }
    };

    q("data-i18n").forEach((el) => (el.textContent = t(el.getAttribute("data-i18n"), params(el))));
    q("data-i18n-html").forEach((el) => (el.innerHTML = t(el.getAttribute("data-i18n-html"), params(el))));
    ["placeholder", "title", "aria-label"].forEach((attr) =>
      q(`data-i18n-${attr}`).forEach((el) =>
        el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`), params(el)))
      )
    );
  }

  async function loadLang(lang) {
    if (config.translations[lang] || !config.urlPattern) return;
    try {
      const res = await fetch(config.urlPattern.replace("{lang}", lang));
      config.translations[lang] = await res.json();
    } catch (e) { console.warn("i18n: could not load", lang, e); }
  }

  /** Switch language */
  async function setLang(lang, { save = true } = {}) {
    lang = config.translations[lang] || config.languages[lang] ? lang : base(lang);
    if (!config.translations[lang] && !config.urlPattern) lang = config.defaultLang;
    await loadLang(lang);

    current = lang;
    if (save) { try { localStorage.setItem(config.storageKey, lang); } catch {} }

    const html = document.documentElement;
    html.lang = lang;
    html.dir = config.rtl.includes(base(lang)) ? "rtl" : "ltr";

    translateElement(document);
    document.querySelectorAll("[data-lang-switcher]").forEach((s) => (s.value = lang));
    document.querySelectorAll(".i18n-dd").forEach((d) => d._refresh && d._refresh());
    listeners.forEach((fn) => fn(lang));
  }

  function detectLang() {
    try {
      const saved = localStorage.getItem(config.storageKey);
      if (saved) return saved;
    } catch {}
    const langs = navigator.languages || [navigator.language];
    for (const l of langs) {
      if (config.translations[l]) return l;
      if (config.translations[base(l)]) return base(l);
    }
    return config.defaultLang;
  }

  // ======== 3. LANGUAGE DROPDOWN (SVG flags, 100% width) ========
  function flagImg(code) {
    const svg = config.flags[code];
    if (!svg) return "";
    return '<img class="i18n-flag" alt="" src="data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '">';
  }

  function injectStyles() {
    if (document.getElementById("i18n-styles")) return;
    const style = document.createElement("style");
    style.id = "i18n-styles";
    style.textContent = `
      .i18n-dd{position:relative;width:100%;box-sizing:border-box;font:inherit}
      .i18n-dd-btn{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:8px 10px;font:inherit;color:inherit;background:transparent;border:1px solid rgba(128,128,128,.5);border-radius:8px;cursor:pointer;text-align:start}
      .i18n-caret{margin-inline-start:auto;opacity:.6;font-size:.8em}
      .i18n-dd-list{position:absolute;inset-inline:0;top:calc(100% + 4px);z-index:9999;margin:0;padding:4px;list-style:none;background:Canvas;color:CanvasText;border:1px solid rgba(128,128,128,.5);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
      .i18n-dd-list[hidden]{display:none}
      .i18n-dd-list li{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer}
      .i18n-dd-list li:hover,.i18n-dd-list li[aria-selected="true"]{background:rgba(128,128,128,.2)}
      .i18n-flag{width:22px;height:15px;object-fit:cover;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.15);flex:none}
    `;
    document.head.appendChild(style);
  }

  function buildSwitchers() {
    injectStyles();
    document.querySelectorAll("select[data-lang-switcher]").forEach((sel) => {
      if (sel.dataset.i18nBuilt) return;
      sel.dataset.i18nBuilt = "1";

      // keep the native <select> as hidden state holder
      if (!sel.options.length) {
        Object.entries(config.languages).forEach(([code, name]) => sel.add(new Option(name, code)));
      }
      sel.addEventListener("change", () => setLang(sel.value));
      sel.style.display = "none";

      const dd = document.createElement("div");
      dd.className = "i18n-dd";
      dd.innerHTML =
        '<button type="button" class="i18n-dd-btn" aria-haspopup="listbox" aria-expanded="false"></button>' +
        '<ul class="i18n-dd-list" role="listbox" hidden></ul>';
      sel.insertAdjacentElement("afterend", dd);

      const btn = dd.querySelector(".i18n-dd-btn");
      const list = dd.querySelector(".i18n-dd-list");

      Array.from(sel.options).forEach((opt) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.dataset.code = opt.value;
        li.innerHTML = flagImg(opt.value) + "<span></span>";
        li.querySelector("span").textContent = opt.text;
        li.addEventListener("click", () => {
          sel.value = opt.value;
          setLang(opt.value);
          close();
        });
        list.appendChild(li);
      });

      function close() {
        list.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
      btn.addEventListener("click", () => {
        list.hidden = !list.hidden;
        btn.setAttribute("aria-expanded", String(!list.hidden));
      });
      document.addEventListener("click", (e) => { if (!dd.contains(e.target)) close(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

      dd._refresh = () => {
        const name = config.languages[current] || current;
        btn.innerHTML = flagImg(current) + "<span></span><span class='i18n-caret'>▼</span>";
        btn.querySelector("span").textContent = name;
        list.querySelectorAll("li").forEach((li) =>
          li.setAttribute("aria-selected", String(li.dataset.code === current))
        );
      };
      dd._refresh();
    });
  }

  // Auto-translate content added later (dynamic UI)
  function observe() {
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && translateElement(n)));
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ======== 4. PUBLIC API ========
  global.i18n = {
    t,
    setLang,
    getLang: () => current,
    onChange: (fn) => listeners.push(fn),
    addTranslations: (lang, dict) => {
      config.translations[lang] = { ...(config.translations[lang] || {}), ...dict };
    },
    // Intl helpers that follow the current language
    number: (n, opts) => new Intl.NumberFormat(current, opts).format(n),
    date: (d, opts) => new Intl.DateTimeFormat(current, opts).format(new Date(d)),
    config,
  };

  function start() {
    buildSwitchers();
    observe();
    setLang(detectLang(), { save: false });
  }
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", start)
    : start();
})(window);

/* ---------------- USAGE ----------------

<script src="i18n.js"></script>

<select data-lang-switcher></select>   // becomes a full-width flag dropdown

<h1 data-i18n="title"></h1>
<p data-i18n="welcome" data-i18n-params='{"name":"Ann"}'></p>
<p data-i18n="palette_brand_description"></p>

// To add a language: add it to config.languages, config.flags (SVG) and
// config.translations.

// In JavaScript:
i18n.t("welcome", { name: "Ann" });   // "Welcome, Ann!"
i18n.t("items", { count: 3 });        // "3 items"
i18n.setLang("es");
i18n.number(1234567.89);              // formatted for current language
i18n.onChange(lang => console.log("Language is now", lang));
*/