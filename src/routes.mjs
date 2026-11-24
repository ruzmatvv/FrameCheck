// Addresses of single game pages: /o/<steam id> or /o/<steam id>-<name in latin letters>.
// The browser and the server both use these, so a link is always built and read the same way.

// "Need for Speed™ Heat" -> "need-for-speed-heat"; names with no latin letters give "".
export function gameSlug(name) {
  return String(name || "")
    .replace(/[®™©’'`]/g, "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

export function gamePath(id, name) {
  const slug = gameSlug(name);
  return "/o/" + Number(id) + (slug ? "-" + slug : "");
}

// "/o/1551360-forza-horizon-5" -> 1551360, "/o/abc" -> null
export function parseGamePath(pathname) {
  const m = /^\/o\/(\d{1,10})(?:-[a-z0-9-]*)?\/?$/.exec(String(pathname || ""));
  return m ? Number(m[1]) : null;
}
