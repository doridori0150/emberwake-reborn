/* 대화창: 초상화 + 이름 + 대사를 한 줄씩 넘기고, 끝에 선택지를 보여 준다. 게임(app.js)과 도구의 미리보기(editor.js)가 함께 쓴다.
   규칙은 모른다: 무엇을 고를 수 있는지(can)와 고른 뒤의 처리(onChoose)는 부르는 쪽이 준다. 스타일은 한 번만 끼워 넣는다. */
(function (g) {
  'use strict';
  const ER = (g.ER = g.ER || {}),
    D = ER.data,
    esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const CSS =
    '.erdlg{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:linear-gradient(transparent 35%,rgba(0,0,0,.72));padding:0 16px max(18px,env(safe-area-inset-bottom));font-family:inherit}' +
    '.erdlg .wrap{width:min(860px,100%);display:flex;align-items:flex-end;gap:14px}.erdlg .wrap.right{flex-direction:row-reverse}' +
    '.erdlg .pt{flex:0 0 auto;width:clamp(96px,22vw,190px);aspect-ratio:3/4;border-radius:12px;border:2px solid #c9a35a;background:#10161a center/cover no-repeat;box-shadow:0 8px 24px rgba(0,0,0,.6);overflow:hidden;display:flex;align-items:flex-end;justify-content:center}.erdlg .pt canvas{width:100%;height:100%}.erdlg .pt.none{visibility:hidden;width:0;border:0}' +
    '.erdlg .box{flex:1;min-width:0;background:rgba(18,24,28,.97);border:1px solid #c9a35a;border-radius:12px;padding:14px 18px 12px;color:#e9e4d8;box-shadow:0 8px 24px rgba(0,0,0,.6)}' +
    '.erdlg .who{color:#f0a545;font-weight:700;margin-bottom:6px}.erdlg .txt{font-size:1.06rem;line-height:1.65;min-height:3.3em;white-space:pre-wrap;word-break:keep-all}' +
    '.erdlg .foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:#9aa3a6;font-size:.84rem}.erdlg .next{background:transparent;border:1px solid #2e383f;border-radius:8px;color:#e9e4d8;padding:5px 14px;cursor:pointer;font:inherit}.erdlg .next:hover{border-color:#f0a545}' +
    '.erdlg .ch{display:flex;flex-direction:column;gap:6px;margin-top:10px}.erdlg .ch button{text-align:left;background:#1f262b;border:1px solid #2e383f;border-radius:8px;color:#e9e4d8;padding:8px 12px;cursor:pointer;font:inherit}.erdlg .ch button:hover:not(:disabled){border-color:#f0a545}.erdlg .ch button:disabled{opacity:.45;cursor:default}.erdlg .ch .fx{color:#8ecf72;font-size:.86rem;margin-left:8px}.erdlg .ch .need{color:#f3c77e;font-size:.86rem;margin-left:8px}.erdlg .ch kbd{opacity:.6;margin-right:6px;font-size:.8em;border:1px solid currentColor;border-radius:4px;padding:0 5px}' +
    '@media (max-width:560px){.erdlg .pt{width:84px}.erdlg .txt{font-size:1rem}}';
  function portrait(box, id) {
    // 초상화: 올린 그림(src)이 있으면 그것, 없으면 대원 스프라이트의 상반신
    const p = D.PORTRAITS[id];
    box.className = 'pt' + (p ? '' : ' none');
    box.innerHTML = '';
    box.style.backgroundImage = '';
    if (!p) return;
    if (p.src) {
      box.style.backgroundImage = 'url("' + p.src + '")';
      return;
    }
    const a = ER.gfx?.asset(p.asset);
    if (!a) return;
    const cv = document.createElement('canvas');
    cv.width = 180;
    cv.height = 240;
    box.append(cv);
    const an = a.anims?.idle,
      fr = a.kind === 'actor' ? (an?.dirs?.down || [])[0] : an?.frames?.[0];
    if (fr != null) ER.gfx.sprite(cv.getContext('2d'), p.asset, fr, 90, 330, 300, a.kind !== 'actor' && !a.facesLeft, p.tint || null);
  }
  /* open(ev, { can(choice)→bool, onChoose(index)→void, vars:{hero}, onClose() }) */
  function open(ev, o = {}) {
    close();
    if (!document.getElementById('erdlg-css')) {
      const st = document.createElement('style');
      st.id = 'erdlg-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    const root = document.createElement('div');
    root.className = 'erdlg';
    root.id = 'erdlg';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="wrap"><div class="pt none"></div><div class="box"><div class="who"></div><div class="txt"></div><div class="ch"></div><div class="foot"><span class="cnt"></span><button class="next" type="button">다음 <kbd>Enter</kbd></button></div></div></div>';
    document.body.append(root);
    const pages = (ev.pages || []).slice(),
      choices = ev.choices || [],
      fill = s => String(s || '').replace(/\{hero\}/g, o.vars?.hero || '대원');
    let i = 0,
      reply = null,
      picked = -1;
    const $ = s => root.querySelector(s),
      done = () => {
        close();
        if (o.onChoose) o.onChoose(picked);
        if (o.onClose) o.onClose();
      };
    function show() {
      const last = pages[pages.length - 1] || {},
        pg = reply ? { speaker: last.speaker, portrait: last.portrait, side: last.side, text: reply } : pages[i] || { text: '' };
      $('.wrap').className = 'wrap' + (pg.side === 'right' ? ' right' : '');
      portrait($('.pt'), pg.portrait);
      $('.who').textContent = fill(pg.speaker);
      $('.who').hidden = !pg.speaker;
      $('.txt').textContent = fill(pg.text);
      const atEnd = !reply && i >= pages.length - 1,
        ask = atEnd && choices.length > 0;
      $('.cnt').textContent = (ev.name || '') + (pages.length > 1 && !reply ? '  ' + (i + 1) + '/' + pages.length : '');
      $('.next').hidden = ask;
      $('.next').firstChild.textContent = reply || atEnd ? '닫기 ' : '다음 ';
      const ch = $('.ch');
      ch.innerHTML = '';
      if (ask)
        choices.forEach((c, k) => {
          const ok = o.can ? o.can(c) : true,
            b = document.createElement('button');
          b.type = 'button';
          b.disabled = !ok;
          const need = ER.events.requireText(c.require),
            fx = ER.events.effectText(c.effects);
          b.innerHTML =
            '<kbd>' +
            (k + 1) +
            '</kbd>' +
            esc(fill(c.label)) +
            (need ? '<span class="need">필요: ' + esc(need) + '</span>' : '') +
            (fx ? '<span class="fx">' + esc(fx) + '</span>' : '');
          b.onclick = () => {
            picked = k;
            if (c.reply) {
              reply = c.reply;
              show();
            } else done();
          };
          ch.append(b);
        });
      (ask ? ch.querySelector('button:not(:disabled)') : $('.next'))?.focus();
    }
    const advance = () => {
      if (reply) return done();
      if (i < pages.length - 1) {
        i++;
        return show();
      }
      if (!choices.length) return done();
    };
    $('.next').onclick = advance;
    root.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement?.closest('.ch')) return;
        e.preventDefault();
        advance();
      } else if (/^[1-9]$/.test(e.key)) {
        const b = root.querySelectorAll('.ch button')[+e.key - 1];
        if (b && !b.disabled) b.click();
      }
    });
    show();
    return root;
  }
  function close() {
    document.getElementById('erdlg')?.remove();
  }
  ER.dialog = { open, close, isOpen: () => !!document.getElementById('erdlg') };
})(typeof globalThis !== 'undefined' ? globalThis : this);
