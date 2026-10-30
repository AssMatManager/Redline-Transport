(() => {
  const h = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [n, v] of Object.entries(a)) { if (v == null || v === false) continue; n === 'class' ? e.className = v : n.startsWith('on') ? e.addEventListener(n.slice(2), v) : e.setAttribute(n, v); } for (const c of k.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); return e; };
  const token = new URLSearchParams(location.search).get('t'); const app = document.getElementById('app');
  const paras = (t) => String(t || '').split(/\n+/).filter(x => x.trim()).map(x => h('p', {}, x));
  const hd = { 'X-Invite-Token': token || '' };
  const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], APPS = ['Trucky', 'TruckBooks', 'TruckersMP', 'Aucune de ces applications'];
  (async () => {
    const r = await fetch('/api/recruit/info', { headers: hd }); if (!r.ok) return app.replaceChildren(h('h1', {}, 'Lien invalide'), h('p', { class: 'mut' }, 'Ce lien est invalide, expiré ou déjà utilisé.'));
    const info = await r.json(); const idem = crypto.randomUUID(); const err = h('div', { class: 'err', role: 'alert' });
    const f = {}; const inp = (id, type = 'text', extra = {}) => (f[id] = h('input', { id, type, ...extra }));
    const dayInputs = DAYS.map(d => ({ d, el: h('input', { placeholder: 'Ex. 20h–23h ou « indisponible »', maxlength: 100, 'aria-label': d }) }));
    const appBoxes = APPS.map(a => ({ a, el: h('input', { type: 'checkbox' }) }));
    const mode = h('select', { id: 'mode' }, h('option', { value: '' }, 'Choisir…'), ['solo', 'multijoueur', 'les deux'].map(v => h('option', { value: v }, v[0].toUpperCase() + v.slice(1))));
    const mot = h('textarea', { id: 'mot', maxlength: 3000, required: true }), extra = h('textarea', { id: 'extra', maxlength: 3000 });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Envoyer ma candidature');
    const form = h('form', { class: 'card', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      const body = { idem_key: idem, discord_name: f.discord.value, truckbooks_name: f.tb.value, age: f.age.value, ets2_duration: f.dur.value, ets2_mode: mode.value, apps: appBoxes.filter(x => x.el.checked).map(x => x.a), availability: Object.fromEntries(dayInputs.map(x => [x.d, x.el.value])), motivation: mot.value, extra: extra.value };
      try { const res = await fetch('/api/recruit/apply', { method: 'POST', headers: { ...hd, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json();
        if (!res.ok) { err.textContent = j.error || 'Erreur'; btn.disabled = false; return; }
        app.replaceChildren(h('h1', {}, 'Candidature envoyée ✔'), h('p', {}, 'Merci ! Nous étudions votre candidature et reviendrons vers vous sur Discord.'));
      } catch { err.textContent = 'Connexion impossible, réessayez.'; btn.disabled = false; } } },
      h('label', { for: 'discord' }, 'Pseudo Discord *'), inp('discord', 'text', { required: true, maxlength: 64, autocomplete: 'off' }),
      h('label', { for: 'tb' }, 'Pseudo TruckBooks (facultatif)'), inp('tb', 'text', { maxlength: 64 }),
      h('label', { for: 'age' }, 'Âge *'), inp('age', 'number', { min: 8, max: 99, required: true, inputmode: 'numeric' }),
      h('label', { for: 'dur' }, 'Depuis combien de temps jouez-vous à ETS2 ? *'), inp('dur', 'text', { maxlength: 120, placeholder: 'Ex. 2 ans' }),
      h('label', { for: 'mode' }, 'Principalement en… *'), mode,
      h('label', {}, 'Applications utilisées'), appBoxes.map(x => h('label', { class: 'chk' }, x.el, x.a)),
      h('label', {}, 'Disponibilités sur la semaine'), h('div', { class: 'days' }, dayInputs.map(x => h('div', {}, h('span', {}, x.d), x.el))),
      h('label', { for: 'mot' }, 'Pourquoi souhaitez-vous rejoindre Redline Transport ? *'), mot,
      h('label', { for: 'extra' }, 'Informations complémentaires (facultatif)'), extra, h('div', { class: 'btns' }, btn), err);
    app.replaceChildren(h('h1', {}, 'Recrutement'), h('p', { class: 'mut' }, info.slogan),
      info.presentation && h('div', { class: 'prose' }, h('h2', {}, 'Redline Transport'), paras(info.presentation)),
      info.workflow && h('div', { class: 'prose' }, h('h2', {}, 'Fonctionnement'), paras(info.workflow)),
      h('h2', {}, 'Conditions'), h('ul', { class: 'list' }, h('li', {}, 'Âge minimum : ' + info.min_age + ' ans'), (info.conditions || []).map(c => h('li', {}, c))),
      info.steps && h('div', { class: 'prose' }, h('h2', {}, 'Étapes du recrutement'), paras(info.steps)),
      info.rules && h('details', { class: 'card', style: 'margin:20px 0' }, h('summary', {}, 'Lire le règlement'), paras(info.rules)),
      h('h2', {}, 'Candidature'), form);
  })();
})();
