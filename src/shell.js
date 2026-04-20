// ============================================================
// TAV — Shell glue for redesigned layout
// - Sync class-card clicks to hidden #build-class select
// - Keep rail breadcrumb + stepbar in sync with active tab/class/build
// - "Clear" class button
// - Keyboard shortcuts (B / G / P -- unchanged / also handles Esc on strip popover)
// Loaded AFTER app.js so its init has already run.
// ============================================================
(function () {
  'use strict';

  const $  = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------
  // Class-card → #build-class sync
  // app.js wires .class-pill for creator filtering (state.creatorClass,
  // renderCharCreatorBuilds). Our class-cards ALSO have .class-pill so
  // that still works. We just need to also drive the build planner
  // pipeline (renderBuildSidebar, renderLevelPlan, feat advisor, route)
  // by mirroring the selection into #build-class.
  // ---------------------------------------------------------------
  function wireClassCardSync() {
    const buildClassSel = $('build-class');
    const clearBtn      = $('build-class-clear');
    if (!buildClassSel) return;

    $$('.class-card').forEach(card => {
      card.addEventListener('click', () => {
        const cls = card.dataset.class || '';
        // Visually mark active (app.js already does this for .class-pill,
        // but only among .class-pill elements — we also include .class-card
        // explicitly here in case of CSS specificity).
        $$('.class-card').forEach(c => c.classList.toggle('active', c === card));

        if (buildClassSel.value !== cls) {
          buildClassSel.value = cls;
          buildClassSel.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (clearBtn) clearBtn.hidden = !cls;
        updateStepbar();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        $$('.class-card').forEach(c => c.classList.remove('active'));
        // Also reset the legacy "All" class-pill so creator shows all builds
        const allPill = document.querySelector('.creator-class-filter .class-pill[data-class=""]');
        if (allPill) allPill.click();
        if (buildClassSel.value !== '') {
          buildClassSel.value = '';
          buildClassSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        clearBtn.hidden = true;
        updateStepbar();
      });
    }
  }

  // ---------------------------------------------------------------
  // Creator-build-item → template selected (step 3 active)
  // We observe the creator-card visibility to tick step 3.
  // ---------------------------------------------------------------
  function wireTemplateWatcher() {
    const card = $('creator-card');
    if (!card) return;
    const obs = new MutationObserver(updateStepbar);
    obs.observe(card, { attributes: true, attributeFilter: ['hidden'] });
  }

  // ---------------------------------------------------------------
  // Step bar — reflects: class picked? template picked?
  // ---------------------------------------------------------------
  function updateStepbar() {
    const cls = $('build-class')?.value || '';
    const card = $('creator-card');
    const tplPicked = card && !card.hidden;
    const step = tplPicked ? 3 : (cls ? 2 : 1);

    const eyebrow = $('build-step-eyebrow');
    if (eyebrow) eyebrow.textContent = `Step ${step} of 3`;

    $$('.stepbar .step').forEach(el => {
      const n = parseInt(el.dataset.step, 10);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });
  }

  // ---------------------------------------------------------------
  // Rail breadcrumb — update on tab change
  // ---------------------------------------------------------------
  const TAB_META = {
    build:   { section: 'Plan',      title: 'Build'   },
    gear:    { section: 'Plan',      title: 'Gear'    },
    party:   { section: 'Plan',      title: 'Party'   },
    route:   { section: 'Reference', title: 'Route'   },
    search:  { section: 'Reference', title: 'Search'  },
    tavsync: { section: 'Mod',       title: 'TavSync' },
  };
  function updateBreadcrumb() {
    const activeBtn = document.querySelector('.tab-btn.active');
    const tab = activeBtn?.dataset.tab || 'build';
    const meta = TAB_META[tab] || TAB_META.build;
    const secEl = $('crumb-section');
    const titEl = $('crumb-title');
    if (secEl) secEl.textContent = meta.section;
    if (titEl) titEl.textContent = meta.title;

    // Mark rail item aria-current
    $$('.tab-btn.nav-item').forEach(btn => {
      btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'true' : 'false');
    });
  }

  function wireTabBreadcrumb() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // app.js already called switchTab; defer to let it finish
        setTimeout(updateBreadcrumb, 0);
      });
    });
    updateBreadcrumb();
  }

  // ---------------------------------------------------------------
  // Keyboard shortcuts: B / G / P jump tabs (complementing '/' → Search)
  // ---------------------------------------------------------------
  function wireKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map = { b: 'build', g: 'gear', p: 'party', r: 'route' };
      if (map[k]) {
        const btn = document.querySelector(`.tab-btn[data-tab="${map[k]}"]`);
        if (btn) { e.preventDefault(); btn.click(); }
      }
      if (e.key === 'Escape') {
        const pop = $('strip-popover');
        if (pop && !pop.hidden) {
          pop.hidden = true;
          $$('.party-slot').forEach(b => b.classList.remove('party-slot--active'));
        }
      }
    });
  }

  // ---------------------------------------------------------------
  // Sync class-card active state from #build-class value (for startup
  // restore or party-driven changes).
  // ---------------------------------------------------------------
  function wireClassEcho() {
    const sel = $('build-class');
    if (!sel) return;
    const echo = () => {
      const cls = sel.value;
      $$('.class-card').forEach(c => c.classList.toggle('active', c.dataset.class === cls));
      const clearBtn = $('build-class-clear');
      if (clearBtn) clearBtn.hidden = !cls;
      updateStepbar();
    };
    sel.addEventListener('change', echo);
    // run once at startup in case a class was pre-filled
    echo();
  }

  // ---------------------------------------------------------------
  // Init after app.js has run
  // ---------------------------------------------------------------
  function init() {
    wireClassCardSync();
    wireClassEcho();
    wireTemplateWatcher();
    wireTabBreadcrumb();
    wireKeyboard();
    updateStepbar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
