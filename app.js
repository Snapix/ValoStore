(() => {
  'use strict';

  const state = { query: '' };
  let apps = [];
  let liveApps = [];
  let liveController = null;
  let liveRequest = 0;
  let liveTimer = 0;
  let catalogueFailed = false;

  const $ = selector => document.querySelector(selector);
  const page = $('.page');
  const search = $('#search');
  const results = $('#results');
  const resultList = $('#resultList');

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const sourceOrder = { WinGet: 0, 'F-Droid': 1, Flathub: 2 };
  const platformName = { windows: 'Windows', android: 'Android', linux: 'Linux' };
  const sourcePlatform = { WinGet: 'Windows', 'F-Droid': 'Android', Flathub: 'Linux' };

  function norm(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function scoreApp(app, query) {
    const q = norm(query);
    if (!q) return 0;
    const name = norm(app.name);
    const id = norm(app.appId);
    const developer = norm(app.developer);

    if (q.length === 1) return (name.startsWith(q) || id.startsWith(q)) ? 1000 : 0;

    let score = 0;
    if (name === q) score += 5000;
    else if (name.startsWith(q)) score += 3000;
    else if (name.includes(q)) score += 1800;

    if (id === q) score += 2400;
    else if (id.startsWith(q)) score += 1500;
    else if (id.includes(q)) score += 700;

    if (developer.startsWith(q)) score += 900;

    const haystack = norm([
      app.name, app.appId, app.summary, app.description, app.developer,
      app.source, ...(app.categories || []), ...(app.keywords || [])
    ].join(' '));

    for (const term of q.split(' ').filter(Boolean)) {
      if (name.split(' ').some(part => part.startsWith(term))) score += 450;
      else if (haystack.includes(term)) score += 80;
      else return 0;
    }
    return score;
  }

  function groupedResults(query) {
    const q = query.trim();
    if (!q) return [];

    const groups = new Map();
    for (const app of [...apps, ...liveApps]) {
      const score = scoreApp(app, q);
      if (!score) continue;

      const key = norm(app.name) || norm(app.appId);
      if (!groups.has(key)) {
        groups.set(key, { name: app.name || app.appId, score: 0, records: [] });
      }

      const group = groups.get(key);
      group.score = Math.max(group.score, score);
      const recordKey = app.id || (String(app.source || '') + '|' + String(app.appId || ''));
      if (!group.records.some(item => (item.id || (String(item.source || '') + '|' + String(item.appId || ''))) === recordKey)) {
        group.records.push(app);
      }
    }

    return [...groups.values()]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 40);
  }

  function fallbackIcon(name) {
    return '<span class="icon-fallback">' + esc((name || '?').slice(0, 1).toUpperCase()) + '</span>';
  }

  function iconFor(app) {
    return app && app.icon
      ? '<img loading="lazy" src="' + esc(app.icon) + '" alt="" referrerpolicy="no-referrer">'
      : fallbackIcon(app && app.name);
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll('img').forEach(image => {
      image.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'icon-fallback';
        fallback.textContent = (image.closest('.detail-icon')?.parentElement?.querySelector('h3')?.textContent || image.closest('.result')?.querySelector('.name')?.textContent || '?').slice(0, 1).toUpperCase();
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function sourceLabel(app) {
    const url = app.upstream || '#';
    const platform = sourcePlatform[app.source] || platformName[app.platform] || app.platform || '';
    return '<a class="source" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
      '<i aria-hidden="true"></i><span>' + esc(app.source || 'Catalogue') + '</span>' +
      '<span class="platform">' + esc(platform) + '</span></a>';
  }

  function detailMarkup(group, records) {
    const primary = records[0];
    const top = '<div class="detail-top"><div class="detail-icon">' + iconFor(primary) + '</div>' +
      '<div class="detail-title"><h3>' + esc(group.name) + '</h3><p>' +
      esc(primary.summary || primary.description || 'Software from upstream catalogues.') +
      '</p></div></div>';

    const cards = records.map(app => {
      const command = app.install && app.install.command;
      const open = app.upstream || (app.install && app.install.url) || '#';
      const install = command
        ? '<code class="install">' + esc(command) + '</code>'
        : '<span class="install none">Open the upstream catalogue to install.</span>';
      const platform = sourcePlatform[app.source] || platformName[app.platform] || app.platform || '';
      const website = app.homepage
        ? '<a class="action" href="' + esc(app.homepage) + '" target="_blank" rel="noopener noreferrer">Website ↗</a>'
        : '';

      return '<div class="detail-source"><strong>' + esc(app.source || 'Catalogue') + '</strong>' +
        '<small>' + esc(platform) + ' · ' + esc(app.appId || 'Package ID unavailable') + '</small>' +
        install + '<div class="detail-actions"><a class="action" href="' + esc(open) +
        '" target="_blank" rel="noopener noreferrer">Open ' + esc(app.source || 'catalogue') + ' ↗</a>' +
        website + '</div></div>';
    }).join('');

    return top + '<div class="detail-sources">' + cards + '</div>';
  }

  function openGroup(group, row) {
    const panel = row.querySelector('.result-detail');
    const wasOpen = panel.classList.contains('open');

    document.querySelectorAll('.result-detail.open').forEach(item => {
      item.classList.remove('open');
      item.innerHTML = '';
    });

    if (wasOpen) return;

    const records = [...group.records].sort((a, b) =>
      (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9)
    );

    panel.innerHTML = detailMarkup(group, records);
    panel.classList.add('open');
    bindImageFallbacks(panel);
  }

  function render() {
    const query = state.query.trim();
    const hasQuery = Boolean(query);
    page.classList.toggle('has-query', hasQuery);

    if (!hasQuery) {
      results.classList.remove('visible');
      resultList.innerHTML = '';
      $('#resultCount').textContent = '';
      $('#resultTitle').textContent = 'Software';
      return;
    }

    const groups = groupedResults(query);
    results.classList.add('visible');

    if (!groups.length) {
      $('#resultTitle').textContent = catalogueFailed ? 'Catalogue unavailable' : 'No software found';
      $('#resultCount').textContent = '';
      resultList.innerHTML = catalogueFailed
        ? '<div class="empty"><strong>Catalogue could not be loaded</strong>Please retry in a moment.</div>'
        : '<div class="empty"><strong>No matching software</strong>Try an app name, package ID, or developer.</div>';
      return;
    }

    $('#resultTitle').textContent = 'Software';
    $('#resultCount').textContent = groups.length + ' match' + (groups.length === 1 ? '' : 'es');

    resultList.innerHTML = groups.map((group, index) => {
      const records = [...group.records].sort((a, b) =>
        (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9)
      );
      const primary = records[0];
      const ids = records.map(app => app.appId).filter(Boolean).join(' · ');

      return '<article class="result" tabindex="0" role="button" aria-expanded="false" data-group="' + index + '">' +
        '<div class="icon">' + iconFor(primary) + '</div>' +
        '<div class="result-copy"><div class="name">' + esc(group.name) + '</div>' +
        '<div class="summary">' + esc(primary.summary || primary.description || 'Software available through upstream catalogues.') + '</div>' +
        (ids ? '<div class="ids">' + esc(ids) + '</div>' : '') + '</div>' +
        '<div class="sources">' + records.map(sourceLabel).join('') + '</div>' +
        '<div class="result-detail"></div></article>';
    }).join('');

    bindImageFallbacks(resultList);

    resultList.querySelectorAll('.result').forEach((row, index) => {
      row.addEventListener('click', event => {
        if (event.target.closest('a')) return;
        openGroup(groups[index], row);
        row.setAttribute('aria-expanded', String(row.querySelector('.result-detail').classList.contains('open')));
      });
      row.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a')) {
          event.preventDefault();
          openGroup(groups[index], row);
          row.setAttribute('aria-expanded', String(row.querySelector('.result-detail').classList.contains('open')));
        }
      });
    });
  }

  async function boot() {
    try {
      const response = await fetch('./data/search-index.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Catalogue request failed: ' + response.status);
      const data = await response.json();
      apps = Array.isArray(data.apps) ? data.apps : [];
      catalogueFailed = false;
    } catch (error) {
      apps = [];
      catalogueFailed = true;
    }
    render();
  }

  async function fetchLive(query) {
    const q = query.trim();
    const request = ++liveRequest;

    if (liveController) liveController.abort();
    liveController = new AbortController();

    if (q.length < 2) {
      liveApps = [];
      render();
      return;
    }

    try {
      const response = await fetch('./api/search?q=' + encodeURIComponent(q), {
        signal: liveController.signal,
        cache: 'no-store'
      });
      if (!response.ok) return;

      const data = await response.json();
      if (request !== liveRequest || state.query.trim() !== q) return;

      liveApps = Array.isArray(data.results) ? data.results : [];
      render();
    } catch (error) {
      if (error.name !== 'AbortError') liveApps = [];
    }
  }

  search.addEventListener('input', event => {
    state.query = event.target.value;
    liveApps = [];
    render();
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => fetchLive(state.query), 220);
  });

  document.addEventListener('keydown', event => {
    if (event.key === '/' && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape') {
      liveRequest++;
      if (liveController) liveController.abort();
      liveApps = [];
      search.value = '';
      state.query = '';
      render();
      search.blur();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  });

  boot();
})();