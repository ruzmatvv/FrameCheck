// The top of a game's window: screenshots, trailer, short description. It is loaded after the window opens
// (from /api/game, which the server keeps for a few minutes), so the check result itself never waits for it.
function createGameMedia(ctx) {
  const {tr, E, $, api} = ctx;
  const cache = new Map(), pending = new Map();
  const slot = id => '<div class="game-media is-loading" data-media="' + id + '" aria-busy="true"><div class="skeleton media-hero"></div><div class="skeleton media-line"></div><div class="skeleton media-line short"></div></div>';

  function html(info) {
    const shots = info.screenshots || [], movie = (info.movies || [])[0];
    const first = shots[0] ? '<img src="' + E(shots[0].thumb) + '" alt="" loading="lazy" decoding="async">' : "";
    const parts = [];
    if (movie) parts.push('<button type="button" class="media-trailer" data-trailer aria-label="' + E(tr("Treylerni ko‘rish")) + '"><img src="' + E(movie.thumb) + '" alt="" loading="lazy" decoding="async"><span class="media-play" aria-hidden="true"></span></button>');
    else if (first) parts.push('<button type="button" class="media-trailer" data-shot="0" aria-label="' + E(tr("Rasmni kattalashtirish")) + '">' + first + '</button>');
    if (shots.length) parts.push('<div class="media-strip" role="list">' + shots.map((s, i) => '<button type="button" role="listitem" data-shot="' + i + '" aria-label="' + E(tr("Skrinshot {0}", i + 1)) + '"><img src="' + E(s.thumb) + '" alt="" loading="lazy" decoding="async"></button>').join("") + '</div>');
    if (info.short_description) parts.push('<p class="media-text">' + E(info.short_description) + '</p>');
    const facts = [info.developers?.length ? tr("Ishlab chiqaruvchi: {0}", info.developers.join(", ")) : "", info.metacritic ? "Metacritic: " + info.metacritic : ""].filter(Boolean);
    if (facts.length) parts.push('<p class="hint media-facts">' + E(facts.join(" · ")) + '</p>');
    return parts.join("");
  }

  function lightbox(info, index) {
    const shots = info.screenshots;
    let i = index;
    const box = document.createElement("dialog"); // its own dialog, so it sits above the game window and fills the whole screen
    box.addEventListener("close", () => box.remove());
    box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", tr("Skrinshotlar"));
    const draw = () => { box.innerHTML = '<img src="' + E(shots[i].full) + '" alt=""><button type="button" class="lb-prev" aria-label="' + E(tr("Oldingisi")) + '">‹</button><button type="button" class="lb-next" aria-label="' + E(tr("Keyingisi")) + '">›</button><button type="button" class="lb-close" aria-label="' + E(tr("Yopish")) + '">×</button>'; };
    draw();
    box.addEventListener("click", e => {
      if (e.target.closest(".lb-prev")) { i = (i + shots.length - 1) % shots.length; draw(); }
      else if (e.target.closest(".lb-next")) { i = (i + 1) % shots.length; draw(); }
      else box.close();
    });
    document.body.append(box); box.showModal();
    box.querySelector(".lb-close").focus();
  }

  function playTrailer(root, info) {
    const m = info.movies[0], video = document.createElement("video");
    video.controls = true; video.autoplay = true; video.playsInline = true; video.preload = "metadata"; video.poster = m.thumb;
    for (const [type, src] of [["video/webm", m.webm], ["video/mp4", m.mp4]]) if (src) { const s = document.createElement("source"); s.src = src; s.type = type; video.append(s); }
    root.querySelector(".media-trailer").replaceWith(video);
  }

  async function fetchInfo(id) {
    if (cache.has(id)) return cache.get(id);
    if (!pending.has(id)) pending.set(id, api("game", {id}).then(info => { cache.set(id, info); return info; }).finally(() => pending.delete(id)));
    return pending.get(id);
  }

  // Fill the placeholder of game `id`, if that game's window is still the one on screen.
  async function fill(id) {
    const root = $('.game-media[data-media="' + id + '"]');
    if (!root) return;
    try {
      const info = await fetchInfo(id);
      const now = $('.game-media[data-media="' + id + '"]');
      if (!now) return;
      const content = html(info);
      if (!content) { now.remove(); return; }
      now.classList.remove("is-loading"); now.removeAttribute("aria-busy"); now.innerHTML = content;
      now.addEventListener("click", e => {
        if (e.target.closest("[data-trailer]")) playTrailer(now, info);
        else { const b = e.target.closest("[data-shot]"); if (b && info.screenshots?.length) lightbox(info, Number(b.dataset.shot)); }
      });
    } catch { $('.game-media[data-media="' + id + '"]')?.remove(); }
  }
  return {slot, fill};
}
