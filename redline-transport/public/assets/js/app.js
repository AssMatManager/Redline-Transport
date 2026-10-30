// Site public Redline Transport : rendu sans innerHTML sur des données (anti-XSS)
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const h = (t, a = {}, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); return e; };
  const api = async (p) => { const r = await fetch('/api' + p); if (!r.ok) throw new Error(r.status); return r.json(); };
  const paras = (t) => String(t || '').split(/\n{1,}/).filter(x => x.trim()).map(x => h('p', {}, x));
  const lines = (t) => String(t || '').split(/\n/).map(x => x.trim()).filter(Boolean);
  const fmt = (iso, o) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...(o || { dateStyle: 'long', timeStyle: 'short' }) });
  const km = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n || 0) + ' km';
  const monthLabel = (m) => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
  const empty = (t) => h('div', { class: 'empty' }, t);
  const badges = (roles) => h('div', {}, roles.map(r => h('span', { class: 'badge ' + (r.key || '') }, r.label || r)));
  const imgOk = (src) => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });
  const pick = async (list) => { for (const s of list) if (await imgOk(s)) return s; return list[list.length - 1]; };
  const safeUrl = (u) => /^https:\/\//.test(u || '') ? u : null;
  const avatar = (u) => h('img', { src: u || '/assets/images/logo.svg', alt: '', loading: 'lazy', width: 96, height: 96 });

  const NAV = [['/', 'Accueil'], ['/entreprise', "L'entreprise"], ['/chauffeurs', 'Chauffeurs'], ['/actualites', 'Actualités'], ['/objectifs', 'Objectifs'], ['/conduite', 'Conduite'], ['/statistiques', 'Statistiques'], ['/hall-of-fame', 'Hall of Fame'], ['/galerie', 'Galerie'], ['/reglement', 'Règlement']];
  function layout(logo) {
    const here = location.pathname.replace(/\/$/, '') || '/';
    const nav = h('nav', { id: 'nav' }, NAV.map(([u, t]) => h('a', { href: u, class: u === here ? 'on' : '' }, t)));
    document.body.prepend(h('header', { class: 'nav' }, h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: '/' }, h('img', { src: logo, alt: 'Logo Redline Transport' }), h('span', {}, 'REDLINE ', h('b', {}, 'TRANSPORT'))),
      nav, h('button', { class: 'burger', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: (e) => { const o = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, '☰'))));
    document.body.append(h('div', { class: 'glow' }), h('footer', {}, h('div', { class: 'wrap' }, '© ' + new Date().getFullYear() + ' Redline Transport — Entreprise virtuelle Euro Truck Simulator 2')));
    document.querySelectorAll('a[href^="/"]').forEach(a => a.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || a.target || RM) return; e.preventDefault(); document.body.classList.add('leaving'); setTimeout(() => location.href = a.href, 220); }));
  }
  function reveal() {
    const els = document.querySelectorAll('.rv'); if (RM || !('IntersectionObserver' in window)) return els.forEach(e => e.classList.add('in'));
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 }); els.forEach(e => io.observe(e));
  }
  function countUp(el, to, dec = 0) { if (RM) { el.textContent = to.toLocaleString('fr-FR'); return; } const t0 = performance.now(); const f = (t) => { const p = Math.min((t - t0) / 1200, 1); el.textContent = (to * (1 - Math.pow(1 - p, 3))).toLocaleString('fr-FR', { maximumFractionDigits: dec }); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  const section = (title, ...body) => h('section', {}, h('div', { class: 'wrap rv' }, title && h('h2', {}, title), ...body));

  function podium(rows, label = 'km') {
    if (!rows.length) return empty('Aucune donnée kilométrique pour le moment.');
    const by = Object.fromEntries(rows.map(r => [r.rank, r]));
    const cell = (n) => by[n] ? h('div', { class: 'pl p' + n }, avatar(by[n].avatar), h('div', { class: 'n' }, by[n].name), badges(by[n].roles || []), h('div', { class: 'km' }, km(by[n].km)), h('div', { class: 'step' }, n)) : h('div');
    return h('div', { class: 'podium' }, cell(2), cell(1), cell(3));
  }
  function rankTable(rows) {
    if (!rows.length) return empty('Aucune donnée pour cette période.');
    return h('div', { class: 'tbl card' }, h('table', { class: 'rank' }, h('tr', {}, ['#', 'Chauffeur', 'Rôles', 'Kilomètres'].map(x => h('th', {}, x))),
      rows.map(r => h('tr', {}, h('td', {}, r.rank), h('td', {}, avatar(r.avatar), r.name), h('td', {}, badges(r.roles)), h('td', {}, h('b', {}, km(r.km)))))));
  }
  const newsCard = (n) => h('article', { class: 'card' }, n.image && h('img', { class: 'news-img', src: '/uploads/' + encodeURIComponent(n.image), alt: '', loading: 'lazy' }), h('span', { class: 'tag' }, n.category), h('h3', {}, n.title), h('p', { class: 'mut small' }, fmt(n.publish_at, { dateStyle: 'long' })), ...paras(n.body));
  const convoyCard = (c) => h('div', { class: 'card' }, h('span', { class: 'tag' }, '🚚 Convoi'), h('h3', {}, c.title), h('p', { class: 'mut' }, fmt(c.starts_at)), ...paras(c.description));

  const pages = {
    async home(site) {
      const [news, convoys, st, day, gal] = await Promise.all([api('/news?limit=3'), api('/convoys'), api('/stats'), api('/rankings/day'), api('/gallery')]);
      const bg = h('div', { class: 'bg' }); pick(['/assets/images/hero.jpg', '/assets/images/hero.webp', '/assets/images/hero.svg']).then(s => bg.style.backgroundImage = `url(${s})`);
      if (!RM) addEventListener('scroll', () => { if (scrollY < innerHeight) bg.style.transform = `translateY(${scrollY * .25}px)`; }, { passive: true });
      const logo = await pick(['/assets/images/logo.png', '/assets/images/logo.svg']);
      const d = safeUrl(site.discord_url), t = safeUrl(site.tiktok_url);
      const vals = lines(site.values);
      const stat = (v, l, dec) => { const b = h('b', {}, '0'); const c = h('div', { class: 'card stat' }, b, h('span', { class: 'mut' }, l)); new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { countUp(b, v, dec); o.disconnect(); } }).observe(c); return c; };
      return [h('div', { class: 'hero' }, bg, h('div', { class: 'wrap' }, h('img', { class: 'logo', src: logo, alt: '' }), h('h1', {}, 'REDLINE TRANSPORT'), h('p', { class: 'slogan' }, site.slogan),
        h('div', { class: 'btns' }, d && h('a', { class: 'btn', href: d, rel: 'noopener', target: '_blank' }, 'Discord'), t && h('a', { class: 'btn alt', href: t, rel: 'noopener', target: '_blank' }, 'TikTok')))),
      section('Redline Transport', ...paras(site.home_intro || site.company_presentation)),
      vals.length && section('Nos valeurs', h('div', { class: 'grid' }, vals.map(v => h('div', { class: 'card' }, h('h3', {}, v))))),
      section('Actualités récentes', news.length ? h('div', { class: 'grid' }, news.map(newsCard)) : empty('Aucune actualité publiée.')),
      section('Prochains convois', convoys.length ? h('div', { class: 'grid' }, convoys.map(convoyCard)) : empty('Aucun convoi programmé.')),
      section('Statistiques', st.has_data ? h('div', { class: 'grid' }, stat(st.total_km, 'km parcourus (total enregistré)', 0), stat(st.month_km, 'km ce mois-ci', 0), stat(st.drivers, 'chauffeurs', 0)) : h('div', { class: 'grid' }, stat(st.drivers, 'chauffeurs', 0), empty('Statistiques kilométriques bientôt disponibles.'))),
      section('Podium du jour', podium(day.rows.slice(0, 3)), h('p', {}, h('a', { class: 'btn alt sm', href: '/statistiques' }, 'Voir le classement complet'))),
      gal.length > 0 && section('Photos', h('div', { class: 'gal' }, gal.slice(0, 6).map(g => h('figure', {}, h('img', { src: '/uploads/' + encodeURIComponent(g.file), alt: g.caption || '', loading: 'lazy' }))))) ];
    },
    async company(site) { const blocks = [['Histoire', 'company_history'], ['Présentation', 'company_presentation'], ['Vision', 'company_vision'], ['Objectifs', 'company_goals'], ['Valeurs', 'company_values'], ['Organisation', 'company_organization'], ['Manière de travailler', 'company_workflow']].filter(([, k]) => site[k]);
      return [section("L'entreprise"), ...(blocks.length ? blocks.map(([t, k]) => section(t, h('div', { class: 'prose' }, paras(site[k])))) : [section(null, empty('Contenu à renseigner depuis l’administration.'))])]; },
    async drivers() { const m = await api('/members'); return [section('Nos chauffeurs', m.length ? h('div', { class: 'grid' }, m.map(x => h('div', { class: 'card driver' }, avatar(x.avatar), h('h3', {}, x.name), badges(x.roles)))) : empty('Aucun membre synchronisé pour le moment.'))]; },
    async news() { const n = await api('/news'); return [section('Actualités', n.length ? h('div', { class: 'grid' }, n.map(newsCard)) : empty('Aucune actualité publiée.'))]; },
    async goals(site) { return [section('Objectifs', h('div', { class: 'prose' }, site.objectives ? paras(site.objectives) : empty('À renseigner depuis l’administration.'))), section('Valeurs', lines(site.values).length ? h('ul', { class: 'list' }, lines(site.values).map(v => h('li', {}, v))) : empty('À renseigner depuis l’administration.'))]; },
    async conduct(site) { return [section('Style de conduite', h('h3', {}, 'Avant le grade « Voix de la communauté »'), h('ul', { class: 'list' }, lines(site.conduct_before).map(v => h('li', {}, v))), h('h3', { style: 'margin-top:28px' }, 'À partir du grade « Voix de la communauté »'), h('div', { class: 'prose' }, paras(site.conduct_after)))]; },
    async rules(site) { return [section('Règlement', site.rules ? h('div', { class: 'prose' }, paras(site.rules)) : empty('Règlement à publier depuis l’administration.'))]; },
    async stats() {
      const st = await api('/stats'); const box = h('div'); let cur = 'day';
      const load = async (p) => { cur = p; tabs.forEach(t => t.el.classList.toggle('on', t.p === p)); box.replaceChildren(h('p', { class: 'mut' }, 'Chargement…'));
        const r = await api('/rankings/' + p); box.replaceChildren(...(p === 'all' ? [] : [podium(r.rows.slice(0, 3))]), rankTable(r.rows)); };
      const tabs = [['day', 'Journalier'], ['month', 'Mensuel'], ['all', 'Général']].map(([p, t]) => ({ p, el: h('button', { class: 'tab', onclick: () => load(p) }, t) }));
      load('day');
      return [section('Statistiques', st.has_data ? h('div', { class: 'grid' }, [[st.total_km, 'km enregistrés au total'], [st.today_km, "km aujourd'hui"], [st.month_km, 'km ce mois-ci'], [st.drivers, 'chauffeurs']].map(([v, l]) => h('div', { class: 'card stat' }, h('b', {}, v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })), h('span', { class: 'mut' }, l)))) : empty('Aucune donnée kilométrique synchronisée pour le moment.'),
        h('p', { class: 'mut small' }, 'Classements calculés sur les jobs réellement enregistrés (fuseau Europe/Paris).')), section(null, h('div', { class: 'tabs' }, tabs.map(t => t.el)), box)];
    },
    async hall() {
      const hall = await api('/hall'); if (!hall.length) return [section('Hall of Fame', empty('Aucun podium archivé pour le moment.'))];
      const box = h('div'); const sel = h('select', { 'aria-label': 'Mois', onchange: () => show(sel.value) }, hall.map(x => h('option', { value: x.month }, monthLabel(x.month))));
      const show = (m) => { const x = hall.find(y => y.month === m); box.replaceChildren(h('h3', {}, monthLabel(m)), podium(x.podium), h('p', { class: 'mut' }, 'Total du mois : ' + km(x.total_km))); }; show(hall[0].month);
      return [section('Hall of Fame', h('div', { style: 'max-width:300px' }, sel), box)];
    },
    async gallery() {
      const g = await api('/gallery'); const cats = ['tous', ...new Set(g.map(x => x.category))]; const box = h('div', { class: 'gal' });
      const lb = h('div', { id: 'lb', onclick: () => lb.classList.remove('on') }); document.body.append(lb);
      const draw = (c) => { tabs.forEach(t => t.classList.toggle('on', t.dataset.c === c)); box.replaceChildren(...g.filter(x => c === 'tous' || x.category === c).map(x => h('figure', { onclick: () => { lb.replaceChildren(h('div', {}, h('img', { src: '/uploads/' + encodeURIComponent(x.file), alt: x.caption || '' }), h('p', {}, x.caption || ''))); lb.classList.add('on'); } }, h('img', { src: '/uploads/' + encodeURIComponent(x.file), alt: x.caption || '', loading: 'lazy' }), x.caption && h('figcaption', {}, x.caption)))); };
      const tabs = cats.map(c => h('button', { class: 'tab', 'data-c': c, onclick: () => draw(c) }, c)); addEventListener('keydown', e => e.key === 'Escape' && lb.classList.remove('on'));
      if (!g.length) return [section('Galerie', empty('Aucune photo pour le moment.'))]; draw('tous');
      return [section('Galerie', h('div', { class: 'tabs' }, tabs), box)];
    },
  };
  window.RL = { h, api, fmt, paras, lines, empty, pick, RM };
  document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.page; if (!page || !pages[page]) return;
    const main = document.getElementById('app');
    try { const site = await api('/site'); const logo = await pick(['/assets/images/logo.png', '/assets/images/logo.svg']); layout(logo);
      const nodes = (await pages[page](site)).flat().filter(Boolean); main.replaceChildren(...nodes); reveal();
    } catch (e) { main.replaceChildren(section('Erreur', empty('Impossible de charger le contenu. Réessayez plus tard.'))); }
    document.getElementById('loader')?.classList.add('done');
  });
})();
