'use strict';

const ICNF_MANUAL = 'fogo_tecnico_icnf_manual_v1';
const directoryCategory = value => value === 'operacional' ? 'Operacional de queima' : 'Técnico de fogo controlado';
const directorySearch = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().trim().replace(/\s*[/–-]\s*/g, '-');

function initDirectory() {
  let official = [];
  let edition = '';
  const category = $('icnfCategory');
  const query = $('icnfQuery');
  const results = $('icnfResults');
  const notice = $('icnfStatus');
  const manualForm = $('icnfManual');
  const manual = () => JSON.parse(localStorage.getItem(ICNF_MANUAL) || '[]');
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Lisbon'}).format(new Date());

  function addToAction(record) {
    const match = state.tecnicos.find(person => directorySearch(person.cred ?? '') === directorySearch(record.cred) &&
      (person.categoria || 'tecnico') === record.categoria);
    if (match) {
      if (!match.nome) match.nome = record.nome;
      if (directorySearch(match.nome) !== directorySearch(record.nome)) {
        notice.textContent = 'O número já está na equipa com um nome diferente. Confirma o registo.';
        return;
      }
      Object.assign(match, {categoria: record.categoria, verificacao: record.verificacao,
        fonte: record.fonte, validade: record.validade, edicao: record.edicao});
    } else {
      state.tecnicos.push({...record, funcao: ''});
    }
    save();
    renderLists();
    notice.textContent = `${record.nome} · ${record.verificacao} · selecionado para a equipa.`;
  }

  function render() {
    const search = directorySearch(query.value);
    results.replaceChildren();
    notice.textContent = category.value === 'operacional' ?
      'Registos locais de operacionais. Lista oficial por confirmar.' :
      edition ? `Lista ICNF de ${edition}. Pesquisa por nome ou número.` : 'A consultar a lista local do ICNF.';
    if (!search) return;
    const available = [...official, ...manual()].filter(record => record.categoria === category.value);
    const matches = available.filter(record => [record.nome, record.cred]
      .some(value => directorySearch(value).includes(search)));
    if (!matches.length) notice.textContent = 'Sem correspondência. Podes adicionar um registo por verificar.';
    for (const item of matches.slice(0, 30)) {
      const verificacao = !item.fonte ? 'Por verificar' :
        item.validade !== 'Vitalícia' && item.validade < today() ? 'Prazo da lista expirado' : 'Consta da lista ICNF';
      const button = document.createElement('button');
      button.className = 'secondary small';
      button.textContent = `${item.cred} · ${item.nome} · ${verificacao}${item.validade ? ' · ' + item.validade : ''}`;
      button.onclick = () => addToAction({...item, verificacao});
      results.append(button);
    }
    if (matches.length > 30) notice.textContent = 'Mostrados 30 resultados. Refina a pesquisa.';
  }

  category.onchange = render;
  query.oninput = render;
  manualForm.onsubmit = event => {
    event.preventDefault();
    const {cred, nome} = Object.fromEntries(new FormData(manualForm));
    const record = {cred: cred.trim(), nome: nome.trim(), categoria: category.value, verificacao:'Por verificar'};
    if (!record.cred || !record.nome) return;
    try {
      const entries = manual();
      if ([...official, ...entries].some(item => item.categoria === record.categoria &&
          directorySearch(item.cred) === directorySearch(record.cred))) {
        throw Error('Já existe um registo com este número e categoria. Pesquisa para o selecionar.');
      }
      localStorage.setItem(ICNF_MANUAL, JSON.stringify([...entries, record]));
      manualForm.reset();
      query.value = record.cred;
      render();
      addToAction(record);
    } catch (error) {
      notice.textContent = error.message;
    }
  };
  fetch('./icnf-tecnicos.json').then(response => {
    if (!response.ok) throw Error('Lista ICNF indisponível.');
    return response.json();
  }).then(data => {
    edition = data.edicao;
    official = data.registos.map(item => ({...item, categoria: 'tecnico', fonte:data.fonte, edicao:edition}));
    render();
  }).catch(error => { notice.textContent = error.message; });
  render();
}
