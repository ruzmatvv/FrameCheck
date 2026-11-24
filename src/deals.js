// Shows which of the user's saved games are on sale in Steam Uzbekistan right now.
function createDeals(ctx) {
  const {tr, E, $} = ctx;
  const live = id => {
    const v = ctx.prices.offer(id);
    return v && v.type === "paid" && v.discount > 0 && !(v.until && v.until * 1000 <= Date.now()) ? v : null;
  };
  const list = () => ctx.saved().map(id => ({id, offer: live(id)})).filter(x => x.offer).sort((a, b) => b.offer.discount - a.offer.discount);
  let announced = false;

  // Ask Steam for the saved games' prices even when their cards are not on screen.
  const load = () => ctx.prices.load(ctx.saved());

  function update() {
    const deals = list(), count = $("#savedCount"), strip = $("#deal-strip");
    if (count) { count.classList.toggle("has-deal", deals.length > 0); count.title = deals.length ? tr("{0} ta o‘yin chegirmada", deals.length) : ""; }
    if (strip) {
      strip.hidden = !(ctx.view() === "saved" && deals.length);
      if (!strip.hidden) {
        strip.innerHTML = '<h3>' + E(tr("Saqlanganlaringdan chegirmadagilari")) + '</h3><ul>' + deals.map(({id, offer}) => {
          const g = ctx.game(id);
          return g ? '<li><button class="link-btn" data-open="' + id + '">' + E(g.name) + '</button><span class="price-discount">−' + offer.discount + '%</span><strong>' + E(offer.price) + '</strong>'
            + (offer.original ? '<del>' + E(offer.original) + '</del>' : '')
            + (offer.until ? '<small>' + E(tr("{0} gacha", new Date(offer.until * 1000).toLocaleDateString(ctx.locale()))) + '</small>' : '') + '</li>' : '';
        }).join("") + '</ul>';
      }
    }
    // Tell the user once per visit, after fresh prices have arrived.
    if (!announced && deals.length && ctx.fresh(deals.map(d => d.id))) {
      announced = true;
      ctx.notify(tr("Saqlanganlaringdan {0} tasi chegirmada: {1}", deals.length, ctx.game(deals[0].id).name + " −" + deals[0].offer.discount + "%"));
    }
  }
  ctx.prices.onChange(update);
  return {update, load};
}
