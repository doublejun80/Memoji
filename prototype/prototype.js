(() => {
  const body = document.body;
  const left = document.getElementById('toggleLeft');
  const right = document.getElementById('toggleRight');
  const theme = document.getElementById('themeToggle');
  const overlay = document.getElementById('commandOverlay');
  const openCommand = document.getElementById('openCommand');
  const commandInput = document.getElementById('commandInput');

  left?.addEventListener('click', () => {
    body.classList.toggle('hide-left');
    left.classList.toggle('active', !body.classList.contains('hide-left'));
  });
  right?.addEventListener('click', () => {
    body.classList.toggle('hide-right');
    right.classList.toggle('active', !body.classList.contains('hide-right'));
  });
  theme?.addEventListener('click', () => {
    const app = document.getElementById('app');
    app.dataset.theme = app.dataset.theme === 'dark' ? '' : 'dark';
  });

  function showCommand() {
    overlay.classList.add('open');
    setTimeout(() => commandInput?.focus(), 0);
  }
  function hideCommand() {
    overlay.classList.remove('open');
    commandInput && (commandInput.value = '');
  }
  openCommand?.addEventListener('click', showCommand);
  overlay?.addEventListener('mousedown', e => {
    if (e.target === overlay) hideCommand();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      showCommand();
    }
    if (e.key === 'Escape') hideCommand();
  });

  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('[data-panel]').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      document.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active');
    });
  });

  const leftViews = {
    today: [
      ['📝','구매AX Sprint1 개발회의','3'],
      ['☑','오늘 할 일','5'],
      ['📌','주간 보고 초안',''],
      ['💡','AI 아이디어 메모','']
    ],
    daily: [
      ['📄','8월 14일 데일리 노트',''],
      ['📄','8월 13일 회의 정리',''],
      ['📄','8월 12일 개발 검토','']
    ],
    project: [
      ['📁','구매AX 본사업','12'],
      ['📄','  Sprint1 화면설계',''],
      ['📄','  Deal Support Agent',''],
      ['📁','Memoji 2.0 GA','8']
    ],
    tasks: [
      ['☐','미팅 자료 준비','8/20'],
      ['☐','LiteRT-LM 회귀 테스트','8/21'],
      ['☑','PR #1 코드 검토','완료']
    ],
    calendar: [
      ['▦','14:00 Sprint1 개발회의','오늘'],
      ['▦','10:00 SK에코플랜트 미팅','8/20'],
      ['▦','VDI 성능 테스트','8/21']
    ],
    knowledge: [
      ['◇','프로젝트','4'],
      ['◇','회의','18'],
      ['◇','의사결정','12'],
      ['◇','업체·협력사','27']
    ]
  };
  document.querySelectorAll('[data-left-view]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-left-view]').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      const rows = leftViews[button.dataset.leftView] || leftViews.today;
      const content = document.getElementById('leftContent');
      content.innerHTML = `
        <div class="section-title"><span>${button.textContent.trim()}</span><span class="mini-actions"><button>+</button><button>⋯</button></span></div>
        <div class="tree">${rows.map((r,i)=>`<div class="tree-row ${i===0?'selected':''}"><span>${r[0]}</span><span class="grow">${r[1]}</span><span class="count">${r[2]}</span></div>`).join('')}</div>
      `;
    });
  });
})();
