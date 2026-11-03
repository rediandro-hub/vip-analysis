/* VIP ANALYSIS — aba do relatório (relatorio.html?id=R…).
   Ao abrir, procura o relatório guardado neste navegador; se ainda não existe, avisa a tela principal (quem abriu
   a aba) e mostra o progresso que ela envia, fonte a fonte. Quando o relatório fica pronto, ocupa esta aba inteira. */
'use strict';

(function () {
  const id = new URLSearchParams(location.search).get('id') || '';
  const $ = s => document.getElementById(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROT = { dentro: 'Dentro', proximo: 'Entorno', fora: 'Fora', info: 'Info', falha: 'Falha', sem_base: 'Sem base' };
  let recebeu = false, terminou = false, tAviso = null;

  /* aba de slides (id S…): mesmos passos, outros textos */
  if (/^S/.test(id)) {
    document.title = 'Apresentação · VIP ANALYSIS';
    document.querySelector('header h1').textContent = 'Apresentação da análise';
    $('titulo').textContent = 'Montando a apresentação';
    $('texto').textContent = 'Preparando os slides a partir da análise concluída…';
  }

  $('voltar').onclick = () => {
    if (window.opener && !window.opener.closed) { window.close(); if (!window.closed) window.opener.focus(); }
    else location.href = 'index.html';
  };

  function mostrar(html) {
    if (terminou) return;
    terminou = true; clearInterval(tAviso);
    document.open(); document.write(html); document.close();
  }
  function erro(txt) {
    terminou = true; clearInterval(tAviso);
    $('titulo').textContent = 'Não foi possível gerar o relatório';
    $('texto').innerHTML = `<span class="erro">${esc(txt)}</span>`;
    $('prog').hidden = true;
  }

  /* relatório já guardado neste navegador (aba recarregada ou aberta pelo histórico) */
  function lerGuardado() {
    return new Promise(ok => {
      try {
        const r = indexedDB.open('vip-analysis', 1);
        r.onupgradeneeded = () => { ['estudos', 'relatorios'].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); }); };
        r.onerror = () => ok(null);
        r.onsuccess = () => {
          try {
            const q = r.result.transaction('relatorios', 'readonly').objectStore('relatorios').get(id);
            q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null);
          } catch (e) { ok(null); }
        };
      } catch (e) { ok(null); }
    });
  }

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || typeof d !== 'object' || d.id !== id || terminou) return;
    if (window.opener && e.source !== window.opener) return;
    recebeu = true;
    if (d.nome) { $('nome').textContent = d.nome; document.title = (/^S/.test(id) ? 'Apresentação · ' : 'Relatório · ') + d.nome + ' · VIP ANALYSIS'; }
    if (d.tipo === 'vip:rel:progresso') {
      $('titulo').textContent = 'Consultando as fontes oficiais';
      $('acoesEspera').innerHTML = '';
      if (d.total) {
        $('prog').classList.remove('indef');
        $('barra').style.width = Math.max(3, 100 * d.feitos / d.total) + '%';
        $('texto').textContent = `${d.feitos} de ${d.total} fontes responderam${d.linha ? ' · ' + d.linha.nome : ''}`;
      } else $('texto').textContent = 'Preparando a consulta…';
      if (d.linha) {
        const div = document.createElement('div');
        div.innerHTML = `<b class="s-${esc(d.linha.status)}">${esc(ROT[d.linha.status] || d.linha.status)}</b><span><b style="width:auto;text-transform:none;letter-spacing:0;font-size:12px">${esc(d.linha.nome)}</b> — ${esc(d.linha.resumo || '')}</span>`;
        $('vivo').prepend(div);
      }
    } else if (d.tipo === 'vip:rel:espera') {
      $('titulo').textContent = 'Quase pronto';
      $('texto').textContent = d.texto || 'Aguardando…';
      $('prog').classList.add('indef'); $('barra').style.width = '';
      if (!$('semBateia')) $('acoesEspera').innerHTML = '<button id="semBateia">Gerar agora, sem a Bateia</button>';
      $('semBateia').onclick = () => { if (window.opener) window.opener.postMessage({ tipo: 'vip:rel:semBateia', id }, '*'); $('acoesEspera').innerHTML = ''; $('texto').textContent = 'Montando o relatório…'; };
    } else if (d.tipo === 'vip:rel:etapa') {
      $('titulo').textContent = d.titulo || 'Montando…';
      $('texto').textContent = d.texto || '';
      if (d.total) { $('prog').classList.remove('indef'); $('barra').style.width = Math.max(5, 100 * d.feitos / d.total) + '%'; }
      else { $('prog').classList.add('indef'); $('barra').style.width = ''; }
    } else if (d.tipo === 'vip:rel:html') mostrar(d.html);
    else if (d.tipo === 'vip:rel:erro') erro(d.texto || 'erro desconhecido');
  });

  (async () => {
    if (!/^[RS]\d+$/.test(id)) return erro('Relatório não identificado. Gere o relatório pela tela principal da VIP ANALYSIS.');
    const g = await lerGuardado();
    if (g && g.html) return mostrar(g.html);
    if (!window.opener || window.opener.closed) return erro('Este relatório não está guardado neste navegador e a tela principal foi fechada. Abra a VIP ANALYSIS e clique em “Gerar relatório” de novo.');
    const avisar = () => { try { window.opener.postMessage({ tipo: 'vip:rel:pronto', id }, '*'); } catch (e) { } };
    avisar();
    let n = 0;
    tAviso = setInterval(() => {
      if (recebeu || terminou) return clearInterval(tAviso);
      if (!window.opener || window.opener.closed) return erro('A tela principal foi fechada antes de terminar.');
      if (++n > 20) return erro('A tela principal não respondeu. Volte a ela e clique em “Gerar relatório” de novo.');
      avisar();
    }, 600);
  })();
})();
