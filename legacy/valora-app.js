/* Valora — shared app logic */
(function () {
  'use strict';

  var LOADING_STEPS = [
    'Extracting listing details…',
    'Calculating investment metrics…',
    'Estimating rental income…',
    'Assessing local market conditions…',
    'Generating investment report…'
  ];

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function formatMoney(n) {
    if (n >= 1000000) return '£' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '£' + Math.round(n / 1000) + 'k';
    return '£' + n.toLocaleString();
  }

  function scoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 65) return 'mid';
    return 'low';
  }

  function tagClass(tag) {
    var t = tag.toLowerCase();
    if (t.indexOf('demo') >= 0 || t.indexOf('rebuild') >= 0) return 'demo';
    if (t.indexOf('undervalued') >= 0 || t.indexOf('bmv') >= 0) return 'chain';
    if (t.indexOf('chain') >= 0) return 'chain';
    if (t.indexOf('regen') >= 0) return 'regen';
    if (t.indexOf('hmo') >= 0) return 'demo';
    return 'freehold';
  }

  function showToast(title, sub) {
    var container = $('#valora-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'valora-toast-container';
      container.className = 'valora-toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'valora-toast';
    toast.innerHTML =
      '<span>✦</span>' +
      '<div><div style="font-weight:700">' + title + '</div>' +
      (sub ? '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px">' + sub + '</div>' : '') +
      '</div>' +
      '<button class="valora-toast-close" aria-label="Close">×</button>';
    toast.querySelector('.valora-toast-close').onclick = function () { toast.remove(); };
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 5000);
  }

  function showLoading(callback) {
    var overlay = $('#valora-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'valora-loading';
      overlay.className = 'valora-loading';
      overlay.innerHTML =
        '<div class="valora-loading-spinner"></div>' +
        '<h3>Analysing property…</h3>' +
        '<p>Valora AI is building your investment report</p>' +
        '<div class="valora-loading-steps">' +
        LOADING_STEPS.map(function (s, i) {
          return '<div class="valora-loading-step" data-step="' + i + '"><span class="dot"></span>' + s + '</div>';
        }).join('') +
        '</div>';
      document.body.appendChild(overlay);
    }
    overlay.classList.add('open');
    var steps = $$('.valora-loading-step', overlay);
    var step = 0;
    function advance() {
      steps.forEach(function (el, i) {
        el.classList.remove('active', 'done');
        if (i < step) el.classList.add('done');
        if (i === step) el.classList.add('active');
      });
      step++;
      if (step <= LOADING_STEPS.length) {
        setTimeout(advance, 550);
      } else {
        setTimeout(function () {
          overlay.classList.remove('open');
          if (callback) callback();
        }, 400);
      }
    }
    advance();
  }

  function createModal() {
    if ($('#valora-analysis-modal')) return;
    var html =
      '<div id="valora-analysis-modal" class="valora-modal-overlay" role="dialog" aria-modal="true">' +
        '<div class="valora-modal">' +
          '<div class="valora-modal-head">' +
            '<h2>⬡ New Property Analysis</h2>' +
            '<p>Paste any Rightmove, Zoopla, or OnTheMarket listing URL</p>' +
          '</div>' +
          '<div class="valora-modal-body">' +
            '<label for="valora-url-input">Listing URL</label>' +
            '<input id="valora-url-input" type="url" placeholder="https://www.rightmove.co.uk/properties/…">' +
          '</div>' +
          '<div class="valora-modal-foot">' +
            '<button type="button" class="valora-btn-cancel" data-action="cancel">Cancel</button>' +
            '<button type="button" class="valora-btn-primary" data-action="analyse">Analyse Property</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    var modal = $('#valora-analysis-modal');
    var input = $('#valora-url-input');

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeAnalysisModal();
    });
    $('[data-action="cancel"]', modal).onclick = closeAnalysisModal;

    $('[data-action="analyse"]', modal).onclick = function () {
      var url = (input.value || '').trim();
      if (!url) {
        input.focus();
        input.style.borderColor = 'var(--red, #DC2626)';
        setTimeout(function () { input.style.borderColor = ''; }, 1500);
        return;
      }
      closeAnalysisModal();
      runAnalysis(url);
    };

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('[data-action="analyse"]', modal).click();
    });
  }

  function openAnalysisModal() {
    createModal();
    var modal = $('#valora-analysis-modal');
    var input = $('#valora-url-input');
    modal.classList.add('open');
    if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 100); }
  }

  function closeAnalysisModal() {
    var modal = $('#valora-analysis-modal');
    if (modal) modal.classList.remove('open');
  }

  function runAnalysis(url) {
    showLoading(function () {
      var property;
      var known = Object.keys(VALORA_DATA.properties).find(function (id) {
        return url.toLowerCase().indexOf(id.replace(/-/g, '')) >= 0;
      });
      if (known) {
        property = VALORA_DATA.properties[known];
      } else {
        property = VALORA_DATA.generateFromUrl(url);
        VALORA_DATA.saveCustom(property);
      }
      window.location.href = 'valora-analyse.html?id=' + encodeURIComponent(property.id);
    });
  }

  function renderScoreRing(score, color) {
    var ring = $('#report-score-ring');
    if (!ring) return;
    var r = 36;
    var c = 2 * Math.PI * r;
    var offset = c - (score / 100) * c;
    ring.innerHTML =
      '<svg class="score-ring-svg" width="88" height="88" viewBox="0 0 88 88">' +
      '<circle class="score-ring-bg" cx="44" cy="44" r="' + r + '"/>' +
      '<circle class="score-ring-fill" cx="44" cy="44" r="' + r + '" stroke="' + color + '" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" data-target="' + offset + '"/>' +
      '</svg>';
    setTimeout(function () {
      var fill = ring.querySelector('.score-ring-fill');
      if (fill) fill.style.strokeDashoffset = offset;
    }, 200);
  }

  function renderPropertyReport(p) {
    var report = $('#analyse-report');
    var entry = $('#analyse-entry');
    var topbar = $('#analyse-topbar');
    if (!report) return;

    if (entry) entry.classList.add('valora-hidden');
    if (topbar) topbar.classList.remove('valora-hidden');
    report.classList.remove('valora-hidden');

    var sc = scoreClass(p.score);
    var gradeColor = sc === 'high' ? 'var(--green)' : sc === 'mid' ? 'var(--amber)' : 'var(--red)';

    var setText = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    var setHTML = function (id, html) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    setText('report-title', p.name);
    setText('report-address', p.address + ' · Analysis generated today');
    setText('report-breadcrumb-current', p.name);
    setText('report-score', p.score);
    setText('report-grade', p.grade);
    setText('report-mc-land', p.metrics.land);
    setText('report-mc-build', p.metrics.build);
    setText('report-mc-total', p.metrics.total);
    setText('report-mc-return', p.metrics.return);
    setText('report-mc-return-label', p.metrics.returnLabel);
    setText('report-uv-title', p.undervalued.title);
    setText('report-uv-desc', p.undervalued.desc);
    setText('report-uv-badge', p.undervalued.badge);
    setText('report-rent-cons', '£' + p.rental.conservative.toLocaleString());
    setText('report-rent-exp', '£' + p.rental.expected.toLocaleString());
    setText('report-rent-opt', '£' + p.rental.optimistic.toLocaleString());
    setText('report-gross-yield', p.rental.grossYield);
    setText('report-net-yield', p.rental.netYield);

    var scoreEl = $('#report-score');
    if (scoreEl) scoreEl.style.color = gradeColor;
    var gradeEl = $('#report-grade');
    if (gradeEl) gradeEl.style.color = gradeColor;

    renderScoreRing(p.score, gradeColor);

    if (p.facts && p.facts.length >= 4) {
      for (var i = 0; i < 4; i++) {
        setText('report-fact-val-' + i, p.facts[i].value);
        setText('report-fact-label-' + i, p.facts[i].label);
      }
    }

    var tagsEl = $('#report-tags');
    if (tagsEl) {
      tagsEl.innerHTML = p.tags.map(function (t) {
        return '<span class="ptag ' + tagClass(t) + '">' + t + '</span>';
      }).join('');
    }

    var risksEl = $('#report-risks');
    if (risksEl) {
      var icons = { ok: '✓', warn: '⚠', risk: '✕', info: 'ℹ' };
      risksEl.innerHTML = p.risks.map(function (r) {
        return '<span class="rtag ' + r.type + '">' + (icons[r.type] || '•') + ' ' + r.text + '</span>';
      }).join('');
    }

    var devPanel = $('#report-dev-panel');
    if (devPanel) {
      if (p.isDevelopment) devPanel.classList.remove('valora-hidden');
      else devPanel.classList.add('valora-hidden');
    }

    var refurbPanel = $('#report-refurb-panel');
    if (refurbPanel) {
      if (p.isDevelopment) refurbPanel.classList.remove('valora-hidden');
      else refurbPanel.classList.add('valora-hidden');
    }

    var imgs = $$('.prop-img', report);
    if (imgs[0]) imgs[0].textContent = p.emoji || '🏠';

    document.title = 'Valora — ' + p.name;
  }

  function initAnalysePage() {
    var id = getParam('id');
    var entry = $('#analyse-entry');
    var report = $('#analyse-report');

    if (id) {
      var property = VALORA_DATA.getProperty(id);
      if (property) {
        renderPropertyReport(property);
        return;
      }
    }

    if (report) report.classList.add('valora-hidden');
    if (entry) entry.classList.remove('valora-hidden');
    var topbar = $('#analyse-topbar');
    if (topbar) topbar.classList.add('valora-hidden');

    var form = $('#analyse-url-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('#analyse-url-input');
        var url = (input && input.value || '').trim();
        if (!url) return;
        runAnalysis(url);
      });
    }

    var recentEl = $('#analyse-recent-list');
    if (recentEl) {
      try {
        var recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
        if (recent.length) {
          recentEl.innerHTML = recent.slice(0, 5).map(function (r) {
            return '<div class="analyse-recent-item" data-id="' + r.id + '">' +
              '<span>' + r.name + '</span>' +
              '<span class="score">' + r.score + '/100</span></div>';
          }).join('');
          $$('.analyse-recent-item', recentEl).forEach(function (el) {
            el.onclick = function () {
              window.location.href = 'valora-analyse.html?id=' + encodeURIComponent(el.dataset.id);
            };
          });
        } else {
          recentEl.parentElement.classList.add('valora-hidden');
        }
      } catch (e) {
        recentEl.parentElement.classList.add('valora-hidden');
      }
    }

    var demoGrid = $('#demo-props-grid');
    if (demoGrid) {
      var demos = [
        { id: 'victoria-lofts', name: 'Victoria Lofts, Manchester', meta: 'BTL · 9.2% yield', score: 88 },
        { id: 'sheffield-plot', name: 'Sheffield Corner Plot', meta: 'Demo & Rebuild · 24% GDV', score: 91 },
        { id: 'leeds-hmo', name: 'Leeds 6-Bed HMO', meta: 'HMO · 10.8% yield', score: 83 },
        { id: 'quayside', name: 'Quayside Portfolio', meta: 'BTL · 11.1% yield', score: 95 }
      ];
      demoGrid.innerHTML = demos.map(function (d) {
        return '<div class="demo-prop-card" data-id="' + d.id + '">' +
          '<div class="dp-name">' + d.name + '</div>' +
          '<div class="dp-meta">' + d.meta + '</div>' +
          '<div class="dp-score">Score ' + d.score + '/100</div></div>';
      }).join('');
      $$('.demo-prop-card', demoGrid).forEach(function (card) {
        card.onclick = function () {
          window.location.href = 'valora-analyse.html?id=' + card.dataset.id;
        };
      });
    }
  }

  function initDiscoverPage() {
    $$('.deal-card').forEach(function (card, i) {
      var ids = ['victoria-lofts', 'garratt-lane', 'quayside', 'sheffield-plot', 'leeds-hmo', 'nottingham-brrr'];
      var id = ids[i] || 'sheffield-plot';
      card.dataset.propertyId = id;
      card.onclick = function (e) {
        if (e.target.closest('.deal-save')) return;
        window.location.href = 'valora-analyse.html?id=' + id;
      };
      var btn = card.querySelector('.deal-btn');
      if (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          window.location.href = 'valora-analyse.html?id=' + id;
        };
      }
    });

    $$('.deal-save').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        btn.classList.toggle('saved');
        btn.textContent = btn.classList.contains('saved') ? '♥' : '♡';
        showToast(btn.classList.contains('saved') ? 'Deal saved to watchlist' : 'Removed from watchlist');
      });
    });

    var sendBtn = $('.ai-send');
    var textarea = $('.ai-textarea');
    if (sendBtn && textarea) {
      sendBtn.onclick = function () {
        var q = textarea.value.trim();
        if (!q) return;
        var banner = $('#ai-response-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'ai-response-banner';
          banner.className = 'ai-response-banner';
          var page = $('.page');
          if (page) page.insertBefore(banner, page.firstChild);
        }
        banner.classList.add('show');
        banner.innerHTML = '<strong>✦ AI matched your brief</strong> — Found 6 properties matching your criteria. Results sorted by investment score.';
        showToast('Search complete', '6 deals matched your brief');
      };
    }

    $$('.ai-chip').forEach(function (chip) {
      chip.onclick = function () {
        if (textarea) textarea.value = chip.textContent;
        if (sendBtn) sendBtn.click();
      };
    });

    $$('.filter-chip').forEach(function (chip) {
      if (chip.classList.contains('filter-clear')) return;
      chip.onclick = function () {
        if (chip.textContent.indexOf('Advanced') >= 0) {
          showToast('Advanced filters', 'Filter panel coming in Pro plan');
          return;
        }
        chip.classList.toggle('active');
      };
    });

    var clearBtn = $('.filter-clear');
    if (clearBtn) {
      clearBtn.onclick = function () {
        $$('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
        showToast('Filters cleared');
      };
    }

    var loadMore = $('.load-more-btn');
    if (loadMore) {
      loadMore.onclick = function () {
        showToast('Loading more deals…', 'Scanning 1,396 additional listings');
      };
    }

    var listView = $('.discover-list-view');
    var mapView = $('#discover-map-view');
    var vtBtns = $$('.vt-btn');
    if (vtBtns.length >= 2 && mapView) {
      vtBtns[0].onclick = function () {
        vtBtns[0].className = 'vt-btn active';
        vtBtns[1].className = 'vt-btn inactive';
        if (listView) listView.classList.remove('hidden');
        mapView.classList.remove('active');
      };
      vtBtns[1].onclick = function () {
        vtBtns[1].className = 'vt-btn active';
        vtBtns[0].className = 'vt-btn inactive';
        if (listView) listView.classList.add('hidden');
        mapView.classList.add('active');
      };
    }

    $$('.map-deal-pin').forEach(function (pin) {
      pin.onclick = function () {
        window.location.href = 'valora-analyse.html?id=' + pin.dataset.id;
      };
    });
  }

  function initDashboardPage() {
    var greeting = $('#dashboard-greeting');
    if (greeting) {
      var h = new Date().getHours();
      var t = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      greeting.textContent = t + ', Alex';
    }

    var searchInput = $('.topbar-search input');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          window.location.href = 'valora-discover.html?q=' + encodeURIComponent(searchInput.value.trim());
        }
      });
    }

    $$('.alert-item, .data-table tbody tr').forEach(function (el, i) {
      var ids = ['sheffield-plot', 'victoria-lofts', 'leeds-hmo', 'sheffield-plot', 'garratt-lane', 'quayside', 'nottingham-brrr'];
      var id = ids[i] || 'sheffield-plot';
      el.onclick = function () {
        window.location.href = 'valora-analyse.html?id=' + id;
      };
    });
  }

  function initPortfolioPage() {
    var addRow = $('.add-property-row');
    if (addRow) addRow.onclick = openAnalysisModal;

    var addBtn = $('.btn-sm.btn-primary');
    if (addBtn && addBtn.textContent.indexOf('Add Property') >= 0) {
      addBtn.onclick = function (e) { e.preventDefault(); openAnalysisModal(); };
    }

    $$('.tab').forEach(function (tab) {
      tab.onclick = function () {
        $$('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var filter = tab.textContent.trim().toLowerCase();
        $$('.prop-table tbody tr').forEach(function (row) {
          if (filter === 'all properties' || filter === 'watchlist') {
            row.style.display = filter === 'watchlist' ? 'none' : '';
            return;
          }
          var strat = (row.querySelector('.stag') || {}).textContent || '';
          var show = false;
          if (filter.indexOf('buy') >= 0 && strat.indexOf('Buy') >= 0) show = true;
          if (filter.indexOf('development') >= 0 && strat.indexOf('Demo') >= 0) show = true;
          if (filter.indexOf('hmo') >= 0 && strat.indexOf('HMO') >= 0) show = true;
          if (filter.indexOf('flip') >= 0 && strat.indexOf('Flip') >= 0) show = true;
          row.style.display = show ? '' : 'none';
        });
      };
    });

    $$('.prop-table tbody tr').forEach(function (row, i) {
      var ids = ['sheffield-plot', 'garratt-lane', 'leeds-hmo', 'victoria-lofts', 'quayside', 'nottingham-brrr', 'nottingham-brrr'];
      row.onclick = function (e) {
        if (e.target.closest('.row-btn')) {
          e.stopPropagation();
          if (e.target.textContent.indexOf('Edit') >= 0) {
            showToast('Edit property', 'Portfolio editing coming soon');
            return;
          }
        }
        window.location.href = 'valora-analyse.html?id=' + (ids[i] || 'sheffield-plot');
      };
    });
  }

  function initAreaIntelPage() {
    var searchInput = $('.search-box input');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          showToast('Area report updated', 'Showing data for ' + searchInput.value.trim());
        }
      });
    }
  }

  function initSettingsPage() {
    $$('.settings-nav-item').forEach(function (btn) {
      btn.onclick = function () {
        $$('.settings-nav-item').forEach(function (b) { b.classList.remove('active'); });
        $$('.settings-section').forEach(function (s) { s.classList.remove('active'); });
        btn.classList.add('active');
        var section = $('#section-' + btn.dataset.section);
        if (section) section.classList.add('active');
      };
    });

    $$('.toggle').forEach(function (toggle) {
      toggle.onclick = function () {
        toggle.classList.toggle('on');
        showToast(toggle.classList.contains('on') ? 'Setting enabled' : 'Setting disabled');
      };
    });

    $$('.plan-card').forEach(function (card) {
      card.onclick = function () {
        if (card.classList.contains('current')) return;
        $$('.plan-card').forEach(function (c) { c.classList.remove('current'); });
        card.classList.add('current');
        showToast('Plan selected', (card.querySelector('.plan-name') || {}).textContent + ' — billing coming soon');
      };
    });

    var hash = (window.location.hash || '').replace('#', '');
    if (hash) {
      var btn = $('[data-section="' + hash + '"]');
      if (btn) btn.click();
    }
  }

  function initNotifications() {
    var btn = $('#notif-btn');
    var dropdown = $('#notif-dropdown');
    if (!btn || !dropdown) return;

    btn.onclick = function (e) {
      e.stopPropagation();
      var open = dropdown.classList.toggle('open');
      btn.classList.toggle('active', open);
    };

    document.addEventListener('click', function () {
      dropdown.classList.remove('open');
      btn.classList.remove('active');
    });

    dropdown.addEventListener('click', function (e) { e.stopPropagation(); });

    $$('.notif-item', dropdown).forEach(function (item, i) {
      var ids = ['sheffield-plot', 'victoria-lofts', 'leeds-hmo'];
      item.onclick = function () {
        window.location.href = 'valora-analyse.html?id=' + (ids[i] || 'sheffield-plot');
      };
    });
  }

  function initGlobal() {
    createModal();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAnalysisModal();
    });

    document.body.classList.add('valora-app-ready');

  $$('.sb-new').forEach(function (btn) {
      btn.onclick = function () {
        if (window.location.pathname.indexOf('analyse') >= 0) {
          window.location.href = 'valora-analyse.html';
        } else {
          openAnalysisModal();
        }
      };
    });

    var menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.setAttribute('aria-label', 'Open menu');

    var backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';

    var sidebar = $('.sidebar');
    var topbar = $('.topbar');
    if (sidebar && topbar) {
      topbar.insertBefore(menuBtn, topbar.firstChild);
      document.body.appendChild(backdrop);

      function toggleMenu(open) {
        sidebar.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
      }
      menuBtn.onclick = function () { toggleMenu(!sidebar.classList.contains('open')); };
      backdrop.onclick = function () { toggleMenu(false); };
      $$('.sb-item', sidebar).forEach(function (link) {
        link.addEventListener('click', function () { toggleMenu(false); });
      });
    }

    if (!document.getElementById('valora-toast-container')) {
      var c = document.createElement('div');
      c.id = 'valora-toast-container';
      c.className = 'valora-toast-container';
      document.body.appendChild(c);
    }

    initNotifications();
  }

  function init() {
    initGlobal();
    var page = document.body.dataset.page;
    if (page === 'analyse') initAnalysePage();
    else if (page === 'discover') initDiscoverPage();
    else if (page === 'dashboard') initDashboardPage();
    else if (page === 'portfolio') initPortfolioPage();
    else if (page === 'area-intel') initAreaIntelPage();
    else if (page === 'settings') initSettingsPage();

    var q = getParam('q');
    if (q && page === 'discover') {
      var textarea = $('.ai-textarea');
      if (textarea) textarea.value = decodeURIComponent(q);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ValoraApp = {
    openAnalysisModal: openAnalysisModal,
    runAnalysis: runAnalysis,
    showToast: showToast
  };
})();
