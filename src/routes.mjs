// Addresses of the site's pages. The browser and the server both use these, so a link is always built and read the same way.
//   Uzbek (the main language):  /            /o/<steam id>-<name>
//   Russian:                    /ru/         /ru/o/<steam id>-<name>
//   English:                    /en/         /en/o/<steam id>-<name>

export const LANGUAGES = ["uz", "ru", "en"];

// "/en/o/123-name" -> "en", "/ru" -> "ru", anything else -> null
export function routeLanguage(pathname) {
  const m = /^\/(ru|en)(?:\/|$)/.exec(String(pathname || ""));
  return m ? m[1] : null;
}

const languagePrefix = lang => (lang === "ru" || lang === "en" ? "/" + lang : "");

// "Need for Speed™ Heat" -> "need-for-speed-heat"; names with no latin letters give "".
export function gameSlug(name) {
  return String(name || "")
    .replace(/[®™©’'`]/g, "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

export function homePath(lang) { return lang === "ru" || lang === "en" ? "/" + lang + "/" : "/"; }

export function gamePath(id, name, lang = "uz") {
  const slug = gameSlug(name);
  return languagePrefix(lang) + "/o/" + Number(id) + (slug ? "-" + slug : "");
}

// "/en/o/1551360-forza-horizon-5" -> 1551360, "/o/abc" -> null
export function parseGamePath(pathname) {
  const m = /^(?:\/(?:ru|en))?\/o\/(\d{1,10})(?:-[a-z0-9-]*)?\/?$/.exec(String(pathname || ""));
  return m ? Number(m[1]) : null;
}

// "/", "/ru", "/en/" -> "uz" | "ru" | "en"; anything else -> null
export function parseHomePath(pathname) {
  if (pathname === "/") return "uz";
  const m = /^\/(ru|en)\/?$/.exec(String(pathname || ""));
  return m ? m[1] : null;
}
