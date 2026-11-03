/* Ponte VIP ANALYSIS ↔ Bateia (lado da Bateia).
   Só age quando a Bateia está dentro da VIP ANALYSIS (iframe). Não altera nenhuma função de análise:
   recebe a área de interesse, dispara a análise normal da Bateia e devolve um resumo estruturado. */
(function () {
  'use strict';
  if (window.parent === window) return;
  var B = window.B;
  if (!B || !B.app) return;
  document.documentElement.classList.add('vip-embed');
  var css = document.createElement('style');
  // a linha de dicas some dentro da VIP; a grade passa a ter 2 linhas para o mapa ocupar toda a altura
  css.textContent = '.vip-embed .hint-row{display:none}.vip-embed .app{grid-template-rows:auto minmax(0,1fr)}';
  document.head.appendChild(css);

  function enviar(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) { /* sem pai */ } }

  // dentro da VIP a análise automática de abertura é dispensada: a área vem da VIP
  var pularInicial = true;
  var runPointOriginal = B.app.runPoint;
  B.app.runPoint = function () {
    if (pularInicial) { pularInicial = false; return; }
    return runPointOriginal.apply(this, arguments);
  };
  var runOriginal = B.app.run;
  B.app.run = async function () {
    enviar({ tipo: 'bateia:inicio' });
    var r = await runOriginal.apply(this, arguments);
    try { enviar({ tipo: 'bateia:resultado', resumo: resumo() }); }
    catch (e) { enviar({ tipo: 'bateia:erro', erro: String(e && e.message || e) }); }
    return r;
  };
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { pularInicial = false; enviar({ tipo: 'bateia:pronta', versao: B.VERSION }); }, 0);
  });

  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var m = ev.data || {};
    if (m.tipo !== 'vip:analisar') return;
    pularInicial = false;
    var feats = m.poligono && m.poligono.length > 2 ? [{ type: 'Polygon', coords: m.poligono, name: m.nome || 'Área VIP ANALYSIS' }] : [];
    var aoi = B.makeAOI({ lat: m.lat, lon: m.lon, raioKm: m.raioKm || 2, features: feats, nome: m.nome || null });
    var q = B.$('#q'); if (q) q.value = aoi.lat.toFixed(6) + ', ' + aoi.lon.toFixed(6);
    B.app.run(aoi, m.nome || 'Área da VIP ANALYSIS');
  });

  function resumo() {
    var S = B.state, D = S.D || {}, R = S.R || {}, a = S.aoi || {};
    var fin = function (v) { return v != null && isFinite(v) ? v : null; };
    return {
      aoi: { lat: a.lat, lon: a.lon, tipo: a.tipo, raioKm: a.raioKm, areaKm2: a.areaKm2, nome: a.nome },
      fontes: B.PROVIDERS.map(function (p) { return { id: p.id, nome: p.nome, fonte: p.fonte, status: S.status[p.id] || 'off', erro: S.errors[p.id] || null }; }),
      substancias: (D.subs || []).slice(0, 20).map(function (s) { return { nome: s.nome, total: s.total, sgb: s.sgb, anm: s.anm, mrds: s.mrds, bateia: s.bateia, dist: fin(s.dist), status: s.status }; }),
      modelos: (D.models || []).slice(0, 8).map(function (r) {
        return { id: r.m.id, nome: r.m.nome, ajuste: r.ajust, conf: r.conf, classe: B.classePot(r.ajust), minerios: r.m.minerios,
          favoraveis: r.ev.filter(function (x) { return x.s != null && x.s >= 0.6; }).map(function (x) { return B.EV_LABEL[x.tipo]; }) };
      }),
      geologia: R.lito ? {
        pontual: (R.lito.pontual || []).slice(0, 3).map(function (u) { return { escala: u.escala, sigla: u.sigla, nome: u.nome, litotipos: u.litotipos }; }),
        dominante: R.lito.area && R.lito.area[0] ? { sigla: R.lito.area[0].sigla, nome: R.lito.area[0].nome, frac: R.lito.area[0].frac } : null
      } : null,
      geoquimica: D.geochem ? D.geochem.ranking.filter(function (x) { return x.anomAOI > 0; }).slice(0, 8).map(function (x) { return { elemento: x.e, nome: x.nome, razao: x.razao, max: x.aoiMax, unidade: x.unit }; }) : [],
      evidencias: S.ledgerAll().slice(0, 150).map(function (i) { return { tipo: i.tipo, tema: i.tema, texto: i.texto, fonte: i.fonte }; }),
      quando: new Date().toISOString()
    };
  }
})();
