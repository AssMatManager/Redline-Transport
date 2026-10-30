document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault(); const e = document.getElementById('e'); e.textContent = '';
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'redline' }, body: JSON.stringify({ username: u.value, password: p.value }) });
  const j = await r.json().catch(() => ({})); if (r.ok) location.href = '/admin/dashboard'; else e.textContent = j.error || 'Erreur';
});
