(function () {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/index/index.html';
  const form = document.getElementById('loginForm');
  const error = document.getElementById('loginError');

  VC.config().then(cfg => {
    if (!cfg.authRequired || cfg.authenticated) location.replace(target);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Connexion impossible');
      location.replace(target);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
})();
