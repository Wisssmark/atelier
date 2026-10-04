/* Atelier — front-end logic: data binding, animations, gallery, forms. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = (p) => fetch(p).then(r => r.json());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  initNav();
  initReveal();
  loadSettings();
  loadStats();
  loadPortfolio();
  loadGallery();
  loadJournal();
  initLightbox();
  initContact();
});

/* ---------- Nav + scroll progress ---------- */
function initNav() {
  const nav = $('#nav'), toggle = $('#navToggle'), links = $('.nav-links');
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
    const h = document.documentElement;
    const p = h.scrollTop / (h.scrollHeight - h.clientHeight);
    $('#scrollProgress').style.width = (p * 100) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  $$('.nav-links a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

/* ---------- Reveal on scroll ---------- */
function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  $$('.reveal').forEach(el => io.observe(el));
  window._reveal = io;
}
function observeReveal(el) { el.classList.add('js-reveal'); window._reveal?.observe(el); }

/* ---------- Settings binding ---------- */
async function loadSettings() {
  let s = {};
  try { s = await api('/api/settings'); } catch (e) {}
  if (s.accent) document.documentElement.style.setProperty('--coral', s.accent);

  $$('[data-bind]').forEach(el => {
    const key = el.dataset.bind;
    if (s[key] == null) return;
    if (el.dataset.href === 'mailto') { el.textContent = s[key]; el.href = 'mailto:' + s[key]; }
    else el.textContent = s[key];
  });
  if (s.brand) document.title = `${s.brand} — ${s.tagline || 'Creative Studio'}`;
  if (s.hero_cta_label) $('#heroCta').textContent = s.hero_cta_label;
  if (s.hero_cta_href) $('#heroCta').setAttribute('href', s.hero_cta_href);

  const social = $('#footerSocial');
  const map = [['Instagram', s.social_instagram], ['Behance', s.social_behance], ['LinkedIn', s.social_linkedin], ['Dribbble', s.social_dribbble]];
  social.innerHTML = map.filter(([, u]) => u).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('');
}

/* ---------- Animated stats ---------- */
async function loadStats() {
  const grid = $('#statsGrid');
  let stats = [];
  try { stats = await api('/api/stats'); } catch (e) {}
  grid.innerHTML = stats.map(s => `
    <div class="stat js-reveal">
      <div class="stat-num" data-target="${s.value}" data-suffix="${esc(s.suffix)}">0</div>
      <div class="stat-label">${esc(s.label)}</div>
    </div>`).join('');
  $$('.stat', grid).forEach(observeReveal);

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.4 });
  $$('.stat-num', grid).forEach(el => io.observe(el));
}
function countUp(el) {
  const target = +el.dataset.target, suffix = el.dataset.suffix || '';
  const dur = 1600, start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.innerHTML = Math.round(target * eased).toLocaleString() + (p === 1 ? `<span class="suffix">${esc(suffix)}</span>` : '');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Portfolio ---------- */
let ALL_PROJECTS = [];
async function loadPortfolio() {
  try { ALL_PROJECTS = await api('/api/projects'); } catch (e) { ALL_PROJECTS = []; }
  const cats = ['All', ...new Set(ALL_PROJECTS.map(p => p.category).filter(Boolean))];
  $('#filters').innerHTML = cats.map((c, i) => `<button class="${i === 0 ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#filters button').forEach(b => b.addEventListener('click', () => {
    $$('#filters button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderProjects(b.dataset.cat);
  }));
  renderProjects('All');
}
function renderProjects(cat) {
  const grid = $('#portfolioGrid');
  const items = cat === 'All' ? ALL_PROJECTS : ALL_PROJECTS.filter(p => p.category === cat);
  grid.innerHTML = items.map(p => `
    <article class="card js-reveal ${p.featured ? 'featured' : ''}">
      <img src="${esc(p.cover_image || '/assets/placeholders/p1.svg')}" alt="${esc(p.title)}" loading="lazy" />
      <div class="card-overlay">
        <span class="card-cat">${esc(p.category)}</span>
        <h3 class="card-title">${esc(p.title)}</h3>
        <p class="card-desc">${esc(p.description)}</p>
      </div>
    </article>`).join('') || '<p style="color:var(--muted)">No projects yet.</p>';
  $$('.card', grid).forEach((el, i) => {
    observeReveal(el);
    el.addEventListener('click', () => {
      const p = items[i];
      if (p.url && p.url !== '#') window.open(p.url, '_blank');
      else openLightbox(`<img src="${esc(p.cover_image)}" alt="${esc(p.title)}">`);
    });
  });
}

/* ---------- Gallery ---------- */
async function loadGallery() {
  const grid = $('#galleryGrid');
  let items = [];
  try { items = await api('/api/gallery'); } catch (e) {}
  grid.innerHTML = items.map(g => {
    const img = g.type === 'video' ? (g.poster || '/assets/placeholders/v1.svg') : g.src;
    return `<figure class="g-item js-reveal" data-type="${g.type}" data-src="${esc(g.src)}" data-poster="${esc(g.poster)}">
      ${g.type === 'video' ? '<span class="g-badge">Video</span><span class="g-play"></span>' : ''}
      <img src="${esc(img)}" alt="${esc(g.title)}" loading="lazy" />
      ${g.caption ? `<figcaption class="g-cap">${esc(g.caption)}</figcaption>` : ''}
    </figure>`;
  }).join('');
  $$('.g-item', grid).forEach(el => {
    observeReveal(el);
    el.addEventListener('click', () => {
      if (el.dataset.type === 'video') {
        const src = el.dataset.src;
        openLightbox(src
          ? `<video src="${esc(src)}" controls autoplay playsinline></video>`
          : `<img src="${esc(el.dataset.poster || '/assets/placeholders/v1.svg')}" alt="">`);
      } else {
        openLightbox(`<img src="${esc(el.querySelector('img').src)}" alt="">`);
      }
    });
  });
}

/* ---------- Journal ---------- */
async function loadJournal() {
  const grid = $('#journalGrid');
  let posts = [];
  try { posts = await api('/api/posts'); } catch (e) {}
  if (!posts.length) { grid.innerHTML = '<p style="color:var(--muted)">No posts published yet.</p>'; return; }
  grid.innerHTML = posts.slice(0, 6).map(p => {
    const date = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const tag = (p.tags || '').split(',')[0].trim();
    return `<a class="post-card js-reveal" href="/blog/${esc(p.slug)}">
      <div class="thumb"><img src="${esc(p.cover_image || '/assets/placeholders/b1.svg')}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="post-body">
        <div class="post-meta">${tag ? `<span class="post-tag">${esc(tag)}</span>·` : ''}<span>${date}</span></div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt)}</p>
        <span class="read">Read article →</span>
      </div>
    </a>`;
  }).join('');
  $$('.post-card', grid).forEach(observeReveal);
}

/* ---------- Lightbox ---------- */
function initLightbox() {
  $('#lightboxClose').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
}
function openLightbox(html) {
  $('#lightboxContent').innerHTML = html;
  $('#lightbox').classList.add('open');
  $('#lightbox').setAttribute('aria-hidden', 'false');
}
function closeLightbox() {
  $('#lightbox').classList.remove('open');
  $('#lightboxContent').innerHTML = '';
}

/* ---------- Contact ---------- */
function initContact() {
  const form = $('#contactForm'), status = $('#formStatus');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'form-status';
    status.textContent = 'Sending…';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Something went wrong.');
      status.className = 'form-status ok';
      status.textContent = 'Thank you — we\'ll be in touch shortly.';
      form.reset();
    } catch (err) {
      status.className = 'form-status err';
      status.textContent = err.message;
    }
  });
}
