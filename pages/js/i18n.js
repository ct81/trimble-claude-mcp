/**
 * i18n.js - one-file translation script for any web app (no dependencies)
 *
 * Features: auto-detect language, language switcher, saved choice, RTL support,
 * placeholders {name}, plurals, fallback language, dynamic content, Intl formatting.
 *
 * HTML attributes:
 *   data-i18n="key"               -> element text
 *   data-i18n-html="key"          -> element innerHTML (trusted strings only)
 *   data-i18n-placeholder="key"   -> placeholder
 *   data-i18n-title="key"         -> title
 *   data-i18n-aria-label="key"    -> aria-label
 *   data-i18n-params='{"name":"Ann"}'  -> values for {name}
 *   <select data-lang-switcher></select>  -> auto-filled language picker
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
    languages: { en: "English", es: "Español", fr: "Français", ar: "العربية", hi: "हिन्दी" },
    translations: {
      en: {
        title: "JSON Exporter",
        welcome: "Welcome, {name}!",
        upload: "Upload JSON",
        paste: "Paste JSON here",
        export_csv: "Export CSV",
        export_excel: "Export Excel",
        items: { one: "{count} item", other: "{count} items" },
      },
      es: {
        title: "Exportador JSON",
        welcome: "¡Bienvenido, {name}!",
        upload: "Subir JSON",
        paste: "Pega el JSON aquí",
        export_csv: "Exportar CSV",
        export_excel: "Exportar Excel",
        items: { one: "{count} elemento", other: "{count} elementos" },
      },
      fr: {
        title: "Exportateur JSON",
        welcome: "Bienvenue, {name} !",
        upload: "Téléverser un JSON",
        paste: "Collez le JSON ici",
        export_csv: "Exporter en CSV",
        export_excel: "Exporter en Excel",
        items: { one: "{count} élément", other: "{count} éléments" },
      },
      ar: {
        title: "مصدّر JSON",
        welcome: "مرحبًا، {name}!",
        upload: "رفع JSON",
        paste: "الصق JSON هنا",
        export_csv: "تصدير CSV",
        export_excel: "تصدير Excel",
        items: { zero: "لا عناصر", one: "عنصر واحد", two: "عنصران", few: "{count} عناصر", many: "{count} عنصرًا", other: "{count} عنصر" },
      },
      hi: {
        title: "JSON एक्सपोर्टर",
        welcome: "स्वागत है, {name}!",
        upload: "JSON अपलोड करें",
        paste: "JSON यहाँ पेस्ट करें",
        export_csv: "CSV निर्यात करें",
        export_excel: "Excel निर्यात करें",
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
    const q = (attr) => scope.querySelectorAll ? scope.querySelectorAll(`[${attr}]`) : [];
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

  function buildSwitchers() {
    document.querySelectorAll("select[data-lang-switcher]").forEach((sel) => {
      if (sel.options.length) return;
      Object.entries(config.languages).forEach(([code, name]) => sel.add(new Option(name, code)));
      sel.addEventListener("change", () => setLang(sel.value));
    });
  }

  // Auto-translate content added later (dynamic UI)
  function observe() {
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && translateElement(n)));
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ======== 3. PUBLIC API ========
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

<select data-lang-switcher></select>

<h1 data-i18n="title"></h1>
<p data-i18n="welcome" data-i18n-params='{"name":"Ann"}'></p>
<textarea data-i18n-placeholder="paste"></textarea>
<button data-i18n="export_csv"></button>

// In JavaScript:
i18n.t("welcome", { name: "Ann" });   // "Welcome, Ann!"
i18n.t("items", { count: 3 });        // "3 items"
i18n.setLang("es");
i18n.number(1234567.89);              // formatted for current language
i18n.onChange(lang => console.log("Language is now", lang));
*/