// =============================================================
// Cláudia Melo Beauty — script do site e da agenda
// =============================================================

// ---- Configurações: troque aqui ---------------------------------
const WHATSAPP = '5528992747881'; // DDI + DDD + número, só dígitos
const INSTAGRAM_URL = 'https://www.instagram.com/claudiamelo/';

// Dados do projeto no Supabase (Project Settings → API).
// Enquanto estiver vazio, a agenda mostra o botão do WhatsApp no lugar.
const SUPABASE_URL = 'https://bpchbhoroxixmwrstftr.supabase.co';      // ex.: 'https://abcdefgh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_siDKA-49gu_IK99aiDYK_Q_GKo9GV3M'; // chave "anon" / "publishable" (é pública, pode ficar aqui)

// Regras da agenda (as mesmas estão no supabase.sql, função agendar)
const SERVICOS = [
  { id: 'design', nome: 'Design personalizado', minutos: 30 },
  { id: 'henna', nome: 'Design com henna', minutos: 60 },
  { id: 'tintura', nome: 'Tintura', minutos: 60 }
];
const INTERVALO = 30; // minutos livres entre um atendimento e outro
const PERIODOS = [['07:30', '10:30'], ['12:30', '18:00']];
const DIAS_A_FRENTE = 7;
const PASSO = 30; // de quanto em quanto tempo os horários começam
// -------------------------------------------------------------------

(() => {
  const TZ = 'America/Sao_Paulo';
  const OFFSET = '-03:00';
  const MIN = 60000;

  const el = id => document.getElementById(id);
  const db = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wppLink = texto => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
  const formatarTelefone = n => {
    const m = n.replace(/^55/, '').match(/^(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
  };

  // Datas sempre no horário de Brasília
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const diaDe = data => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(data));
  const somaDias = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const instante = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00${OFFSET}`).getTime();
  const fmtHora = data => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(data));
  const fmtDia = (ymd, opcoes) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opcoes });

  // ================================================================
  // Site
  // ================================================================
  const iniciarSite = () => {
    const header = el('header');
    const nav = el('nav');
    const burger = el('burger');

    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
      window.addEventListener('scroll', onScroll);
      onScroll();
    }

    if (nav && burger) {
      burger.addEventListener('click', () => {
        nav.classList.toggle('open');
        burger.classList.toggle('open');
      });
      nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          nav.classList.remove('open');
          burger.classList.remove('open');
        });
      });
    }

    // Links de WhatsApp e Instagram
    const abrirEmNovaAba = link => {
      link.target = '_blank';
      link.rel = 'noopener';
    };
    document.querySelectorAll('[data-wpp]').forEach(link => {
      link.href = wppLink(link.dataset.wpp);
      abrirEmNovaAba(link);
    });
    document.querySelectorAll('[data-wpp-label]').forEach(n => (n.textContent = formatarTelefone(WHATSAPP)));
    document.querySelectorAll('[data-insta]').forEach(link => {
      link.href = INSTAGRAM_URL;
      abrirEmNovaAba(link);
    });

    // Animação de entrada ao rolar
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach((n, i) => {
      n.style.transitionDelay = `${(i % 4) * 0.08}s`;
      observer.observe(n);
    });

    // Mantém só uma pergunta aberta por vez
    const faqs = document.querySelectorAll('.faq__list details');
    faqs.forEach(d => d.addEventListener('toggle', () => {
      if (d.open) faqs.forEach(o => o !== d && (o.open = false));
    }));

    const ano = el('year');
    if (ano) ano.textContent = new Date().getFullYear();
  };

  // ================================================================
  // Agenda online (site)
  // ================================================================
  const iniciarAgenda = () => {
    const raiz = el('agenda');
    if (!raiz) return;

    if (!db) {
      raiz.innerHTML = `
        <div class="booking__done">
          <h3>A agenda online está quase pronta ✦</h3>
          <p>Enquanto isso, chame a Cláudia no WhatsApp para ver os horários disponíveis.</p>
          <a class="pill pill--lg" href="${wppLink('Olá, Cláudia! Gostaria de agendar um horário.')}" target="_blank" rel="noopener">Agendar pelo WhatsApp</a>
        </div>`;
      return;
    }

    const boxServicos = el('agServicos');
    const boxDias = el('agDias');
    const boxHorarios = el('agHorarios');
    const form = el('agForm');
    const erro = el('agErro');
    const sucesso = el('agSucesso');
    const estado = { servico: null, dia: null, inicio: null, ocupados: [] };

    const diasDisponiveis = () => {
      const base = hoje();
      const dias = [];
      for (let i = 0; i <= DIAS_A_FRENTE; i++) {
        const ymd = somaDias(base, i);
        if (new Date(`${ymd}T12:00:00Z`).getUTCDay() !== 0) dias.push(ymd);
      }
      return dias;
    };

    const horariosLivres = (ymd, servico) => {
      const dur = servico.minutos * MIN;
      const folga = INTERVALO * MIN;
      const agora = Date.now();
      const livres = [];
      PERIODOS.forEach(([de, ate]) => {
        const fimPeriodo = instante(ymd, ate);
        for (let s = instante(ymd, de); s + dur <= fimPeriodo; s += PASSO * MIN) {
          const e = s + dur;
          const conflito = estado.ocupados.some(o => o.tipo === 'bloqueio'
            ? s < o.fim && o.inicio < e
            : s < o.fim + folga && o.inicio < e + folga);
          if (s > agora && !conflito) livres.push(s);
        }
      });
      return livres;
    };

    const carregarOcupados = async () => {
      const de = hoje();
      const { data, error } = await db.rpc('horarios_ocupados', { p_de: de, p_ate: somaDias(de, DIAS_A_FRENTE) });
      if (error) throw error;
      estado.ocupados = (data || []).map(o => ({ inicio: Date.parse(o.inicio), fim: Date.parse(o.fim), tipo: o.tipo }));
    };

    const renderServicos = () => {
      boxServicos.innerHTML = SERVICOS.map(s => `
        <button type="button" class="opt ${estado.servico?.id === s.id ? 'is-on' : ''}" data-id="${s.id}">
          <strong>${s.nome}</strong><span>${s.minutos < 60 ? `${s.minutos} min` : `${s.minutos / 60}h`}</span>
        </button>`).join('');
    };

    const renderDias = () => {
      if (!estado.servico) {
        boxDias.innerHTML = '<p class="booking__hint">Escolha um serviço primeiro.</p>';
        return;
      }
      boxDias.innerHTML = diasDisponiveis().map(ymd => {
        const cheio = horariosLivres(ymd, estado.servico).length === 0;
        return `
          <button type="button" class="day ${estado.dia === ymd ? 'is-on' : ''}" data-dia="${ymd}" ${cheio ? 'disabled' : ''}>
            <small>${fmtDia(ymd, { weekday: 'short' }).replace('.', '')}</small>
            <strong>${fmtDia(ymd, { day: '2-digit' })}</strong>
            <small>${cheio ? 'lotado' : fmtDia(ymd, { month: 'short' }).replace('.', '')}</small>
          </button>`;
      }).join('');
    };

    const renderHorarios = () => {
      if (!estado.servico || !estado.dia) {
        boxHorarios.innerHTML = '<p class="booking__hint">Escolha o serviço e o dia para ver os horários livres.</p>';
        return;
      }
      const livres = horariosLivres(estado.dia, estado.servico);
      boxHorarios.innerHTML = livres.length
        ? livres.map(s => `<button type="button" class="slot ${estado.inicio === s ? 'is-on' : ''}" data-inicio="${s}">${fmtHora(s)}</button>`).join('')
        : '<p class="booking__hint">Não há horários livres neste dia. Escolha outro, por favor.</p>';
    };

    const renderForm = () => {
      form.hidden = !estado.inicio;
      if (!estado.inicio) return;
      el('agResumo').innerHTML = `<strong>${estado.servico.nome}</strong> · ${fmtDia(estado.dia, { weekday: 'long', day: '2-digit', month: 'long' })} às <strong>${fmtHora(estado.inicio)}</strong>`;
    };

    const render = () => { renderServicos(); renderDias(); renderHorarios(); renderForm(); };

    const escolherServico = id => {
      estado.servico = SERVICOS.find(s => s.id === id) || null;
      if (estado.dia && estado.servico && !horariosLivres(estado.dia, estado.servico).length) estado.dia = null;
      estado.inicio = null;
      render();
    };

    boxServicos.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) escolherServico(b.dataset.id);
    });
    boxDias.addEventListener('click', e => {
      const b = e.target.closest('[data-dia]');
      if (!b) return;
      estado.dia = b.dataset.dia;
      estado.inicio = null;
      render();
    });
    boxHorarios.addEventListener('click', e => {
      const b = e.target.closest('[data-inicio]');
      if (!b) return;
      estado.inicio = Number(b.dataset.inicio);
      erro.textContent = '';
      render();
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Botões "Agendar" dos cartões de serviço chegam como agendar.html?servico=henna
    const servicoDoLink = new URLSearchParams(location.search).get('servico');
    estado.servico = SERVICOS.find(s => s.id === servicoDoLink) || null;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const botao = form.querySelector('button');
      const nome = form.nome.value.trim();
      const whatsapp = form.whatsapp.value.replace(/\D/g, '');
      erro.textContent = '';
      if (whatsapp.length < 10) {
        erro.textContent = 'Informe o seu WhatsApp com DDD.';
        return;
      }
      botao.disabled = true;
      botao.textContent = 'Confirmando...';
      const escolha = { ...estado };
      const { error } = await db.rpc('agendar', {
        p_servico: escolha.servico.id,
        p_inicio: new Date(escolha.inicio).toISOString(),
        p_nome: nome,
        p_whatsapp: whatsapp
      });
      botao.disabled = false;
      botao.textContent = 'Confirmar agendamento';

      if (error) {
        erro.textContent = error.message || 'Não foi possível agendar. Tente novamente.';
        try { await carregarOcupados(); } catch { /* mantém a lista atual */ }
        if (!horariosLivres(escolha.dia, escolha.servico).includes(escolha.inicio)) {
          estado.inicio = null;
          render();
          boxHorarios.insertAdjacentHTML('afterbegin', `<p class="booking__error">${esc(erro.textContent)}</p>`);
        }
        return;
      }

      const quando = `${fmtDia(escolha.dia, { weekday: 'long', day: '2-digit', month: '2-digit' })} às ${fmtHora(escolha.inicio)}`;
      const aviso = `Olá, Cláudia! Acabei de agendar pelo site: ${escolha.servico.nome}, ${quando}. Meu nome é ${nome}.`;
      raiz.querySelectorAll('.booking__step, .booking__form').forEach(n => (n.hidden = true));
      sucesso.hidden = false;
      sucesso.innerHTML = `
        <span class="booking__check">✓</span>
        <h3>Horário confirmado!</h3>
        <p><strong>${escolha.servico.nome}</strong><br>${quando}</p>
        <p>Venha sem maquiagem na região das sobrancelhas. Se precisar desmarcar, avise a Cláudia pelo WhatsApp.</p>
        <div class="booking__done-actions">
          <a class="pill pill--lg" href="${wppLink(aviso)}" target="_blank" rel="noopener">Avisar a Cláudia no WhatsApp</a>
          <button type="button" class="text-link" id="agNovo">Fazer outro agendamento</button>
        </div>`;
      el('agNovo').addEventListener('click', async () => {
        Object.assign(estado, { dia: null, inicio: null });
        form.reset();
        sucesso.hidden = true;
        raiz.querySelectorAll('.booking__step').forEach(n => (n.hidden = false));
        try { await carregarOcupados(); } catch { /* mantém a lista atual */ }
        render();
      });
    });

    boxHorarios.innerHTML = '<p class="booking__hint">Carregando horários...</p>';
    carregarOcupados()
      .then(render)
      .catch(() => {
        renderServicos();
        renderDias();
        boxHorarios.innerHTML = `<p class="booking__error">Não foi possível carregar a agenda agora. <a href="${wppLink('Olá, Cláudia! Gostaria de agendar um horário.')}" target="_blank" rel="noopener">Agende pelo WhatsApp</a>.</p>`;
      });
  };

  // ================================================================
  // Página da Cláudia (admin.html)
  // ================================================================
  const iniciarAdmin = () => {
    const painel = el('painel');
    if (!painel) return;
    if (!db) {
      el('semConfig').hidden = false;
      return;
    }

    const nomes = Object.fromEntries(SERVICOS.map(s => [s.id, s.nome]));
    const rotuloDia = ymd => fmtDia(ymd, { weekday: 'long', day: '2-digit', month: 'long' });
    const inicioDeHoje = () => new Date(`${hoje()}T00:00:00${OFFSET}`).toISOString();
    const linkCliente = fone => `https://wa.me/${fone.startsWith('55') ? fone : `55${fone}`}`;

    const carregarAgendamentos = async () => {
      const lista = el('lista');
      const { data, error } = await db.from('agendamentos')
        .select('id, servico, inicio, fim, nome, whatsapp')
        .eq('status', 'confirmado')
        .gte('inicio', inicioDeHoje())
        .order('inicio');
      if (error) { lista.innerHTML = `<p class="booking__error">${esc(error.message)}</p>`; return; }
      if (!data.length) { lista.innerHTML = '<p class="admin__empty">Nenhum atendimento marcado por enquanto.</p>'; return; }
      const grupos = data.reduce((g, a) => {
        (g[diaDe(a.inicio)] = g[diaDe(a.inicio)] || []).push(a);
        return g;
      }, {});
      lista.innerHTML = Object.keys(grupos).map(dia => `
        <div class="admin__day">
          <h3>${rotuloDia(dia)}</h3>
          ${grupos[dia].map(a => `
            <div class="admin__item">
              <span class="admin__time">${fmtHora(a.inicio)} – ${fmtHora(a.fim)}</span>
              <div>
                <button type="button" class="admin__client-link" data-cliente="${esc(a.whatsapp)}" title="Ver histórico">${esc(a.nome)}</button> <span class="admin__tag">${esc(nomes[a.servico] || a.servico)}</span><br>
                <a href="${linkCliente(a.whatsapp)}" target="_blank" rel="noopener">${formatarTelefone(a.whatsapp)}</a>
              </div>
              <button class="admin__btn" data-cancelar="${a.id}" data-nome="${esc(a.nome)}">Cancelar</button>
            </div>`).join('')}
        </div>`).join('');
    };

    const carregarBloqueios = async () => {
      const box = el('bloqueios');
      const { data, error } = await db.from('bloqueios')
        .select('id, inicio, fim, motivo')
        .gte('fim', new Date().toISOString())
        .order('inicio');
      if (error) { box.innerHTML = `<p class="booking__error">${esc(error.message)}</p>`; return; }
      box.innerHTML = data.length
        ? data.map(b => `
            <div class="admin__item">
              <span class="admin__time">${fmtHora(b.inicio)} – ${fmtHora(b.fim)}</span>
              <div><strong>${rotuloDia(diaDe(b.inicio))}</strong>${b.motivo ? ` · ${esc(b.motivo)}` : ''}</div>
              <button class="admin__btn" data-remover="${b.id}">Remover</button>
            </div>`).join('')
        : '<p class="admin__empty">Nenhum horário bloqueado.</p>';
    };

    // Histórico por cliente (agrupado pelo WhatsApp)
    const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const fmtData = data => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(data));
    const situacao = a => {
      if (a.status === 'cancelado') return ['Cancelado', 'is-cancel'];
      return Date.parse(a.inicio) < Date.now() ? ['Realizado', 'is-done'] : ['Agendado', 'is-next'];
    };

    const carregarClientes = async () => {
      const box = el('clientes');
      const { data, error } = await db.from('agendamentos')
        .select('id, servico, inicio, nome, whatsapp, status')
        .order('inicio', { ascending: false })
        .limit(5000);
      if (error) { box.innerHTML = `<p class="booking__error">${esc(error.message)}</p>`; return; }
      if (!data.length) { box.innerHTML = '<p class="admin__empty">Ainda não há clientes. Elas aparecem aqui depois do primeiro agendamento.</p>'; return; }

      const clientes = new Map();
      data.forEach(a => {
        if (!clientes.has(a.whatsapp)) clientes.set(a.whatsapp, { nome: a.nome, whatsapp: a.whatsapp, itens: [] });
        clientes.get(a.whatsapp).itens.push(a); // o primeiro é o mais recente, então o nome fica o último usado
      });

      box.innerHTML = [...clientes.values()].map(c => {
        const realizados = c.itens.filter(a => situacao(a)[0] === 'Realizado');
        const proximo = c.itens.filter(a => situacao(a)[0] === 'Agendado').at(-1);
        const contagem = realizados.reduce((m, a) => m.set(a.servico, (m.get(a.servico) || 0) + 1), new Map());
        const resumo = [...contagem].map(([s, n]) => `${esc(nomes[s] || s)} <b>×${n}</b>`).join(' · ') || 'Nenhum atendimento realizado ainda';
        return `
          <details class="client" data-fone="${esc(c.whatsapp)}" data-busca="${esc(semAcento(c.nome))} ${esc(c.whatsapp)}">
            <summary>
              <div><strong>${esc(c.nome)}</strong><span>${formatarTelefone(c.whatsapp)}</span></div>
              <div class="client__stats">
                <span><b>${realizados.length}</b> ${realizados.length === 1 ? 'atendimento' : 'atendimentos'}</span>
                <span>${realizados.length ? `Última vez: ${fmtData(realizados[0].inicio)}` : ''}${proximo ? `${realizados.length ? ' · ' : ''}Próximo: ${fmtData(proximo.inicio)}` : ''}</span>
              </div>
            </summary>
            <div class="client__body">
              <p class="client__summary">${resumo}</p>
              <ul class="client__history">
                ${c.itens.map(a => {
                  const [rotulo, classe] = situacao(a);
                  return `<li><span>${fmtData(a.inicio)} · ${fmtHora(a.inicio)}</span><span>${esc(nomes[a.servico] || a.servico)}</span><span class="client__status ${classe}">${rotulo}</span></li>`;
                }).join('')}
              </ul>
              <a href="${linkCliente(c.whatsapp)}" target="_blank" rel="noopener" class="text-link">Chamar no WhatsApp →</a>
            </div>
          </details>`;
      }).join('');
      filtrarClientes();
    };

    const filtrarClientes = () => {
      const termo = semAcento(el('buscaCliente').value.trim());
      const digitos = termo.replace(/\D/g, '');
      el('clientes').querySelectorAll('.client').forEach(c => {
        const busca = c.dataset.busca;
        c.hidden = !!termo && !busca.includes(termo) && !(digitos.length >= 4 && busca.includes(digitos));
      });
    };
    el('buscaCliente').addEventListener('input', filtrarClientes);

    const mostrarPainel = async logado => {
      el('login').hidden = logado;
      painel.hidden = !logado;
      el('sair').hidden = !logado;
      if (logado) await Promise.all([carregarAgendamentos(), carregarBloqueios(), carregarClientes()]);
    };

    el('login').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      el('loginErro').textContent = '';
      const { error } = await db.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
      if (error) { el('loginErro').textContent = 'E-mail ou senha incorretos.'; return; }
      f.reset();
      mostrarPainel(true);
    });

    el('sair').addEventListener('click', async () => {
      await db.auth.signOut();
      mostrarPainel(false);
    });

    el('lista').addEventListener('click', async e => {
      const cliente = e.target.closest('[data-cliente]');
      if (cliente) {
        el('buscaCliente').value = '';
        filtrarClientes();
        const ficha = [...el('clientes').querySelectorAll('.client')].find(c => c.dataset.fone === cliente.dataset.cliente);
        if (ficha) {
          ficha.open = true;
          ficha.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      const b = e.target.closest('[data-cancelar]');
      if (!b || !confirm(`Cancelar o horário de ${b.dataset.nome}? O horário volta a ficar livre no site.`)) return;
      const { error } = await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', b.dataset.cancelar);
      if (error) alert(error.message);
      carregarAgendamentos();
      carregarClientes();
    });

    el('bloqueios').addEventListener('click', async e => {
      const b = e.target.closest('[data-remover]');
      if (!b || !confirm('Remover este bloqueio?')) return;
      const { error } = await db.from('bloqueios').delete().eq('id', b.dataset.remover);
      if (error) alert(error.message);
      carregarBloqueios();
    });

    const formBloqueio = el('bloqueio');
    formBloqueio.dia.min = hoje();
    formBloqueio.inteiro.addEventListener('change', () => {
      formBloqueio.de.disabled = formBloqueio.ate.disabled = formBloqueio.inteiro.checked;
    });
    formBloqueio.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const erro = el('bloqueioErro');
      const [de, ate] = f.inteiro.checked ? ['00:00', '23:59'] : [f.de.value, f.ate.value];
      erro.textContent = '';
      if (!de || !ate || ate <= de) { erro.textContent = 'O horário final precisa ser depois do inicial.'; return; }
      const { error } = await db.from('bloqueios').insert({
        inicio: `${f.dia.value}T${de}:00${OFFSET}`,
        fim: `${f.dia.value}T${ate}:00${OFFSET}`,
        motivo: f.motivo.value.trim() || null
      });
      if (error) { erro.textContent = error.message; return; }
      f.motivo.value = '';
      carregarBloqueios();
    });

    db.auth.getSession().then(({ data }) => mostrarPainel(!!data.session));
  };

  iniciarSite();
  iniciarAgenda();
  iniciarAdmin();
})();
