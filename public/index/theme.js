(function(){
  const KEY = 'vc-theme';
  const btn = document.getElementById('themeBtn') || document.querySelector('.theme-toggle');
  const img = document.getElementById('theme-icon') || (btn && btn.querySelector('img'));
  const sunSrc = (btn && btn.getAttribute('data-sun')) || '../assets/sun-icon.svg';
  const moonSrc = (btn && btn.getAttribute('data-moon')) || '../assets/moon-icon.svg';

  function ensureButtonClass(el){
    if(!el) return;
    el.classList.add('vc-theme-btn');
    el.setAttribute('type','button');
    el.setAttribute('aria-label', el.getAttribute('aria-label') || 'Changer de thème');
  }

  function setIconSize(i){
    if(!i) return;
    i.width = i.width || 18;
    i.height = i.height || 18;
    i.style.width = '18px';
    i.style.height = '18px';
    i.style.display = 'block';
    i.style.pointerEvents = 'none';
  }

  function applyTheme(t){
    if(t === 'dark'){
      document.documentElement.setAttribute('data-theme','dark');
      if(img) img.src = moonSrc;
      if(btn) btn.setAttribute('aria-pressed','true');
    } else {
      document.documentElement.removeAttribute('data-theme');
      if(img) img.src = sunSrc;
      if(btn) btn.setAttribute('aria-pressed','false');
    }
    ensureButtonClass(btn);
    setIconSize(img);
  }

  function toggle(){
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if(isDark){
      applyTheme('light');
      localStorage.setItem(KEY,'light');
    } else {
      applyTheme('dark');
      localStorage.setItem(KEY,'dark');
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    ensureButtonClass(btn);
    setIconSize(img);

    const stored = localStorage.getItem(KEY);
    if(stored === 'dark' || stored === 'light'){
      applyTheme(stored);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
    if(btn) btn.addEventListener('click', toggle);
    if(btn) btn.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        toggle();
      }
    });
  });
})();