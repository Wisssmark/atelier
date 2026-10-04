/* Atelier Admin — SPA dashboard + CMS. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const API = '/api/admin';
async function req(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(API + path, opt);
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
const get = (p) => req('GET', p);
const post = (p, b) => req('POST', p, b);
const put = (p, b) => req('PUT', p, b);
const del = (p) => req('DELETE', p);

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast show ${kind}`;
  clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast', 2600);
}

async function uploadFile(file) {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch(API + '/upload', { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Upload failed');
  return j.url;
}
// media input with upload button; input has class .js-media
function wireMedia(scope) {
  $$('.media-field', scope).forEach(mf => {
    const input = $('input', mf), prev = $('.media-prev', mf), btn = $('button', mf), file = $('input[type=file]', mf);
    const sync = () => { if (prev) prev.src = input.value || '/assets/favicon.svg'; };
    input.addEventListener('input', sync); sync();
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      btn.textContent = '…';
      try { input.value = await uploadFile(file.files[0]); sync(); toast('Uploaded'); }
      catch (e) { toast(e.message, 'err'); }
      btn.textContent = 'Upload';
    });
  });
}
const mediaField = (name, val, label, accept = 'image/*,video/*') => `
  <div class="f"><label>${label}</label>
    <div class="media-field">
      <img class="media-prev" src="${esc(val) || '/assets/favicon.svg'}" alt="">
      <input name="${name}" value="${esc(val)}" placeholder="/uploads/… or paste a URL">
      <button type="button" class="btn btn-sm">Upload</button>
      <input type="file" accept="${accept}" hidden>
    </div>
  </div>`;

/* -------------------------------- Auth ---------------------------------- */
async function boot() {
  try { await get('/me'); showApp(); }
  catch { showLogin(); }
}
function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; navigate('dashboard'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try { await post('/login', data); $('#loginErr').textContent = ''; showApp(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { try { await post('/logout'); } catch {} showLogin(); });

$('#sideNav').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#sideNav button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  navigate(b.dataset.view);
});

/* ------------------------------- Router --------------------------------- */
function navigate(view) {
  $('#content').innerHTML = '<div class="spin">Loading…</div>';
  (VIEWS[view] || VIEWS.dashboard)();
}

const VIEWS = {};

/* ------------------------------ Dashboard ------------------------------- */
VIEWS.dashboard = async () => {
  const [posts, projects, gallery, messages] = await Promise.all([
    get('/posts'), get('/projects'), get('/gallery'), get('/messages')
  ]);
  const published = posts.filter(p => p.status === 'published').length;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Overview</h1><p>Welcome back. Here's your studio at a glance.</p></div></div>
    <div class="grid-cards">
      <div class="kpi"><div class="n">${published}</div><div class="l">Published posts</div></div>
      <div class="kpi"><div class="n">${posts.length - published}</div><div class="l">Drafts</div></div>
      <div class="kpi"><div class="n">${projects.length}</div><div class="l">Portfolio projects</div></div>
      <div class="kpi"><div class="n">${gallery.length}</div><div class="l">Gallery items</div></div>
      <div class="kpi"><div class="n">${messages.length}</div><div class="l">Messages</div></div>
    </div>
    <div class="view-head" style="margin-top:36px"><div><h1 style="font-size:22px">Recent messages</h1></div></div>
    <div class="list">${messages.slice(0, 4).map(m => `
      <div class="row"><div class="main"><strong>${esc(m.name)} · ${esc(m.email)}</strong>
      <small>${esc(m.message).slice(0, 90)}</small></div></div>`).join('') || '<p class="empty">No messages yet.</p>'}</div>`;
};

/* -------------------------------- Posts --------------------------------- */
VIEWS.posts = async () => {
  const posts = await get('/posts');
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Journal / Blog</h1><p>Write and publish articles with the rich-text editor.</p></div>
      <button class="btn btn-primary" id="newPost">+ New post</button></div>
    <div class="list">${posts.map(p => `
      <div class="row">
        <img class="thumb" src="${esc(p.cover_image) || '/assets/favicon.svg'}" alt="">
        <div class="main"><strong>${esc(p.title)}</strong>
          <small>${new Date(p.updated_at || p.created_at).toLocaleDateString()} · ${esc(p.tags || 'no tags')}</small></div>
        <span class="badge ${p.status}">${p.status}</span>
        <div class="acts">
          <button class="btn btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">Delete</button>
        </div>
      </div>`).join('') || '<p class="empty">No posts yet — create your first article.</p>'}</div>`;
  $('#newPost').onclick = () => postForm();
  $$('[data-edit]').forEach(b => b.onclick = async () => postForm(await get('/posts/' + b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this post?')) return;
    await del('/posts/' + b.dataset.del); toast('Post deleted'); VIEWS.posts();
  });
};

function postForm(p = {}) {
  const isEdit = !!p.id;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>${isEdit ? 'Edit' : 'New'} post</h1></div>
      <button class="btn" id="backBtn">← Back</button></div>
    <form class="form" id="postForm">
      <div class="f"><label>Title</label><input name="title" value="${esc(p.title)}" required></div>
      <div class="form-row">
        <div class="f"><label>Slug (URL)</label><input name="slug" value="${esc(p.slug)}" placeholder="auto from title">
          <div class="hint">Leave blank to auto-generate.</div></div>
        <div class="f"><label>Tags (comma separated)</label><input name="tags" value="${esc(p.tags)}" placeholder="branding, process"></div>
      </div>
      <div class="f"><label>Excerpt</label><textarea name="excerpt">${esc(p.excerpt)}</textarea></div>
      ${mediaField('cover_image', p.cover_image, 'Cover image', 'image/*')}
      <div class="f"><label>Content</label>
        <div class="editor-toolbar" id="tb">
          <button type="button" data-cmd="formatBlock" data-val="h2" title="Heading">H</button>
          <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
          <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
          <button type="button" data-cmd="insertUnorderedList" title="List">•</button>
          <button type="button" data-cmd="formatBlock" data-val="blockquote" title="Quote">❝</button>
          <button type="button" data-cmd="createLink" title="Link">🔗</button>
          <button type="button" id="imgBtn" title="Insert image">🖼</button>
          <button type="button" data-cmd="formatBlock" data-val="p" title="Paragraph">¶</button>
        </div>
        <div class="editor" id="editor" contenteditable="true" data-placeholder="Start writing…">${p.content || ''}</div>
        <input type="file" id="editorImg" accept="image/*" hidden>
      </div>
      <div class="form-row">
        <div class="f"><label>Author</label><input name="author" value="${esc(p.author || 'Studio')}"></div>
        <div class="f"><label>Status</label>
          <select name="status">
            <option value="draft" ${p.status !== 'published' ? 'selected' : ''}>Draft</option>
            <option value="published" ${p.status === 'published' ? 'selected' : ''}>Published</option>
          </select></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" id="cancelBtn">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save changes' : 'Create post'}</button>
      </div>
    </form>`;
  wireMedia($('#postForm'));
  const editor = $('#editor');
  $('#tb').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]'); if (!b) return;
    editor.focus();
    if (b.dataset.cmd === 'createLink') { const u = prompt('Link URL:'); if (u) document.execCommand('createLink', false, u); }
    else document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
  });
  $('#imgBtn').onclick = () => $('#editorImg').click();
  $('#editorImg').onchange = async () => {
    if (!$('#editorImg').files[0]) return;
    try { const url = await uploadFile($('#editorImg').files[0]); editor.focus(); document.execCommand('insertHTML', false, `<img src="${url}" alt="">`); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#backBtn').onclick = $('#cancelBtn').onclick = () => VIEWS.posts();
  $('#postForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    data.content = editor.innerHTML;
    try {
      if (isEdit) await put('/posts/' + p.id, data); else await post('/posts', data);
      toast('Saved'); VIEWS.posts();
    } catch (err) { toast(err.message, 'err'); }
  };
}

/* ------------------------------- Projects ------------------------------- */
VIEWS.projects = async () => {
  const items = await get('/projects');
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Portfolio</h1><p>Your interactive project grid.</p></div>
      <button class="btn btn-primary" id="new">+ New project</button></div>
    <div class="list">${items.map(p => `
      <div class="row">
        <img class="thumb" src="${esc(p.cover_image) || '/assets/favicon.svg'}" alt="">
        <div class="main"><strong>${esc(p.title)} ${p.featured ? '★' : ''}</strong><small>${esc(p.category)}</small></div>
        <div class="acts"><button class="btn btn-sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">Delete</button></div>
      </div>`).join('') || '<p class="empty">No projects yet.</p>'}</div>`;
  $('#new').onclick = () => projectForm();
  $$('[data-edit]').forEach(b => b.onclick = () => projectForm(items.find(x => x.id == b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete project?')) return; await del('/projects/' + b.dataset.del); toast('Deleted'); VIEWS.projects();
  });
};
function projectForm(p = {}) {
  const isEdit = !!p.id;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>${isEdit ? 'Edit' : 'New'} project</h1></div><button class="btn" id="back">← Back</button></div>
    <form class="form" id="f">
      <div class="form-row">
        <div class="f"><label>Title</label><input name="title" value="${esc(p.title)}" required></div>
        <div class="f"><label>Category</label><input name="category" value="${esc(p.category || 'Work')}" placeholder="Branding, Motion, Web…"></div>
      </div>
      <div class="f"><label>Description</label><textarea name="description">${esc(p.description)}</textarea></div>
      ${mediaField('cover_image', p.cover_image, 'Cover image')}
      <div class="form-row">
        <div class="f"><label>Link (optional)</label><input name="url" value="${esc(p.url)}" placeholder="https:// or leave blank"></div>
        <div class="f"><label>Sort order</label><input name="sort_order" type="number" value="${p.sort_order || 0}"></div>
      </div>
      <div class="f"><label><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Featured (larger tile)</label></div>
      <div class="form-actions"><button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${isEdit ? 'Save' : 'Create'}</button></div>
    </form>`;
  wireMedia($('#f'));
  $('#back').onclick = $('#cancel').onclick = () => VIEWS.projects();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    data.featured = e.target.featured.checked;
    try { isEdit ? await put('/projects/' + p.id, data) : await post('/projects', data); toast('Saved'); VIEWS.projects(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

/* -------------------------------- Gallery ------------------------------- */
VIEWS.gallery = async () => {
  const items = await get('/gallery');
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Gallery</h1><p>Pictures &amp; video for your content hub.</p></div>
      <button class="btn btn-primary" id="new">+ New item</button></div>
    <div class="list">${items.map(g => `
      <div class="row">
        <img class="thumb" src="${esc(g.type === 'video' ? g.poster : g.src) || '/assets/favicon.svg'}" alt="">
        <div class="main"><strong>${esc(g.title || '(untitled)')}</strong><small>${g.type} · ${esc(g.caption)}</small></div>
        <span class="badge ${g.type === 'video' ? 'published' : ''}">${g.type}</span>
        <div class="acts"><button class="btn btn-sm" data-edit="${g.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${g.id}">Delete</button></div>
      </div>`).join('') || '<p class="empty">No gallery items yet.</p>'}</div>`;
  $('#new').onclick = () => galleryForm();
  $$('[data-edit]').forEach(b => b.onclick = () => galleryForm(items.find(x => x.id == b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete item?')) return; await del('/gallery/' + b.dataset.del); toast('Deleted'); VIEWS.gallery();
  });
};
function galleryForm(g = {}) {
  const isEdit = !!g.id;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>${isEdit ? 'Edit' : 'New'} gallery item</h1></div><button class="btn" id="back">← Back</button></div>
    <form class="form" id="f">
      <div class="form-row">
        <div class="f"><label>Type</label><select name="type" id="gtype">
          <option value="image" ${g.type !== 'video' ? 'selected' : ''}>Image</option>
          <option value="video" ${g.type === 'video' ? 'selected' : ''}>Video</option></select></div>
        <div class="f"><label>Title</label><input name="title" value="${esc(g.title)}"></div>
      </div>
      ${mediaField('src', g.src, 'Media file (image, or video MP4)')}
      ${mediaField('poster', g.poster, 'Poster image (for videos)', 'image/*')}
      <div class="form-row">
        <div class="f"><label>Caption</label><input name="caption" value="${esc(g.caption)}"></div>
        <div class="f"><label>Sort order</label><input name="sort_order" type="number" value="${g.sort_order || 0}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${isEdit ? 'Save' : 'Create'}</button></div>
    </form>`;
  wireMedia($('#f'));
  $('#back').onclick = $('#cancel').onclick = () => VIEWS.gallery();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { isEdit ? await put('/gallery/' + g.id, data) : await post('/gallery', data); toast('Saved'); VIEWS.gallery(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

/* --------------------------------- Stats -------------------------------- */
VIEWS.stats = async () => {
  const items = await get('/stats');
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Statistics</h1><p>The animated counters on your homepage.</p></div>
      <button class="btn btn-primary" id="new">+ New stat</button></div>
    <div class="list">${items.map(s => `
      <div class="row"><div class="main"><strong>${esc(s.value)}${esc(s.suffix)}</strong><small>${esc(s.label)}</small></div>
        <div class="acts"><button class="btn btn-sm" data-edit="${s.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${s.id}">Delete</button></div></div>`).join('') || '<p class="empty">No stats.</p>'}</div>`;
  $('#new').onclick = () => statForm();
  $$('[data-edit]').forEach(b => b.onclick = () => statForm(items.find(x => x.id == b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => { await del('/stats/' + b.dataset.del); toast('Deleted'); VIEWS.stats(); });
};
function statForm(s = {}) {
  const isEdit = !!s.id;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>${isEdit ? 'Edit' : 'New'} stat</h1></div><button class="btn" id="back">← Back</button></div>
    <form class="form" id="f">
      <div class="form-row">
        <div class="f"><label>Value (number)</label><input name="value" type="number" value="${s.value || 0}" required></div>
        <div class="f"><label>Suffix</label><input name="suffix" value="${esc(s.suffix)}" placeholder="+ , %, k"></div>
      </div>
      <div class="form-row">
        <div class="f"><label>Label</label><input name="label" value="${esc(s.label)}" required></div>
        <div class="f"><label>Sort order</label><input name="sort_order" type="number" value="${s.sort_order || 0}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${isEdit ? 'Save' : 'Create'}</button></div>
    </form>`;
  $('#back').onclick = $('#cancel').onclick = () => VIEWS.stats();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { isEdit ? await put('/stats/' + s.id, data) : await post('/stats', data); toast('Saved'); VIEWS.stats(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

/* ------------------------------- Messages ------------------------------- */
VIEWS.messages = async () => {
  const items = await get('/messages');
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Messages</h1><p>Submissions from your contact form.</p></div></div>
    <div class="list">${items.map(m => `
      <div class="row"><div class="main">
        <strong>${esc(m.name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></strong>
        <small><b>${esc(m.subject || 'No subject')}</b> — ${esc(m.message)}</small>
        <small style="color:var(--faint)">${new Date(m.created_at).toLocaleString()}</small></div>
        <div class="acts"><button class="btn btn-sm btn-danger" data-del="${m.id}">Delete</button></div>
      </div>`).join('') || '<p class="empty">No messages yet.</p>'}</div>`;
  $$('[data-del]').forEach(b => b.onclick = async () => { await del('/messages/' + b.dataset.del); toast('Deleted'); VIEWS.messages(); });
};

/* ------------------------------- Settings ------------------------------- */
VIEWS.settings = async () => {
  const s = await get('/settings');
  const f = (name, label, ph = '') => `<div class="f"><label>${label}</label><input name="${name}" value="${esc(s[name])}" placeholder="${ph}"></div>`;
  const ta = (name, label) => `<div class="f"><label>${label}</label><textarea name="${name}">${esc(s[name])}</textarea></div>`;
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Site Settings</h1><p>Rebrand the whole template — no code needed.</p></div></div>
    <form class="form" id="f">
      <div class="form-row">${f('brand', 'Brand name', 'ATELIER')}${f('tagline', 'Tagline')}</div>
      ${f('hero_title', 'Hero title')}
      ${ta('hero_subtitle', 'Hero subtitle')}
      <div class="form-row">${f('hero_cta_label', 'Hero button label')}${f('hero_cta_href', 'Hero button link', '#portfolio')}</div>
      ${f('about_title', 'About title')}
      ${ta('about_body', 'About body')}
      <div class="form-row">${f('contact_email', 'Contact email')}${f('contact_location', 'Location')}</div>
      <div class="form-row">${f('social_instagram', 'Instagram URL')}${f('social_behance', 'Behance URL')}</div>
      <div class="form-row">${f('social_linkedin', 'LinkedIn URL')}${f('social_dribbble', 'Dribbble URL')}</div>
      <div class="f"><label>Accent color</label>
        <input name="accent" type="color" value="${esc(s.accent || '#ff6f5e')}" style="width:80px;height:44px;padding:4px">
        <div class="hint">The coral highlight used across the site.</div></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { await put('/settings', data); toast('Settings saved'); } catch (err) { toast(err.message, 'err'); }
  };
};

/* -------------------------------- Account ------------------------------- */
VIEWS.account = async () => {
  $('#content').innerHTML = `
    <div class="view-head"><div><h1>Account</h1><p>Change your admin password.</p></div></div>
    <form class="form" id="f" style="max-width:480px">
      <div class="f"><label>Current password</label><input name="current" type="password" required></div>
      <div class="f"><label>New password</label><input name="next" type="password" required>
        <div class="hint">At least 6 characters.</div></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Update password</button></div>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try { await post('/change-password', data); toast('Password updated'); e.target.reset(); }
    catch (err) { toast(err.message, 'err'); }
  };
};

boot();
