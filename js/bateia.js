/* VIP ANALYSIS — módulo Mineração · Bateia (lado da VIP).
   A Bateia roda inteira, com sua própria interface, dentro da aba "Mineração · Bateia".
   A VIP envia a área de interesse e recebe de volta um resumo estruturado para o relatório. */
'use strict';

(function () {
  const VA = window.VA;
  const BT = VA.bateia = { frame: null, pronta: false, pendente: null, ultimo: null, ouvintes: [], estado: 'parada' };

  BT.garantir = function () {
    if (BT.frame) return BT.frame;
    const host = document.getElementById('bateiaHost');
    const f = document.createElement('iframe');
    f.src = 'bateia/bateia.html';
    f.title = 'Bateia — prospecção mineral';
    f.setAttribute('allow', 'clipboard-write');
    host.appendChild(f);
    BT.frame = f;
    return f;
  };

  window.addEventListener('message', ev => {
    if (!BT.frame || ev.source !== BT.frame.contentWindow) return;
    const m = ev.data || {};
    if (m.tipo === 'bateia:pronta') {
      BT.pronta = true; BT._avisar('pronta');
      if (BT.pendente) { const p = BT.pendente; BT.pendente = null; BT._enviar(p); }
    } else if (m.tipo === 'bateia:inicio') { BT.estado = 'analisando'; BT._avisar('inicio'); }
    else if (m.tipo === 'bateia:resultado') {
      BT.estado = 'concluida'; BT.ultimo = m.resumo; BT._avisar('resultado', m.resumo);
      if (BT._resolver) { BT._resolver(m.resumo); BT._resolver = null; }
    } else if (m.tipo === 'bateia:erro') { BT.estado = 'erro'; BT._avisar('erro', m.erro); }
  });

  BT.aoMudar = fn => BT.ouvintes.push(fn);
  /** troca o arquivo da Bateia (ex.: versão mais nova carregada pelo operador) */
  BT.trocarFonte = function (url) { BT.garantir(); BT.pronta = false; BT.ultimo = null; BT.frame.src = url; };
  BT._avisar = (tipo, dado) => BT.ouvintes.forEach(fn => { try { fn(tipo, dado); } catch (e) { } });
  BT._enviar = msg => { BT.frame.contentWindow.postMessage(msg, '*'); };

  /** Envia a área de interesse para a Bateia; resolve com o resumo (ou null após o tempo-limite). */
  BT.analisar = function (aoi, raioKm, nome, limiteMs = 240000) {
    BT.garantir();
    const c = VA.geo.centro(aoi);
    let poligono = null;
    const g = aoi.geometry;
    if (/Polygon/.test(g.type)) {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      const maior = polys.map(p => ({ p, a: turf.area(turf.polygon(p)) })).sort((a, b) => b.a - a.a)[0].p;
      poligono = VA.geo.simplificarAte({ type: 'Polygon', coordinates: maior }, 400).coordinates[0].map(([lon, lat]) => [lat, lon]);
    }
    const msg = { tipo: 'vip:analisar', lat: c[1], lon: c[0], raioKm, poligono, nome };
    BT.estado = 'enviada';
    return new Promise(resolve => {
      BT._resolver = resolve;
      setTimeout(() => { if (BT._resolver === resolve) { BT._resolver = null; resolve(null); } }, limiteMs);
      if (BT.pronta) BT._enviar(msg); else BT.pendente = msg;
    });
  };
})();
