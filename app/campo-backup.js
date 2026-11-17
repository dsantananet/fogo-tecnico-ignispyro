'use strict';

async function encodeAttachments(actions) {
  const ids = [...new Set(actions.map(action => action.campoId).filter(Boolean))];
  const groups = await Promise.all(ids.map(id => IgnisPyroCampoStorage.listarAnexos(id)));
  return Promise.all(groups.flat().map(async ({ficheiro, ...metadata}) => {
    const {data} = await readImage(ficheiro);
    return {...metadata, base64: data.slice(data.indexOf(',') + 1)};
  }));
}

function restoreAttachments(entries, ids) {
  return IgnisPyroCampoStorage.importarAnexos(entries.map(({base64, ...metadata}) => {
    if (!ids.has(metadata.acaoId) || typeof metadata.mime !== 'string' ||
        !['fotografia','mapa'].includes(metadata.tipo) || typeof base64 !== 'string' ||
        !/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(metadata.mime)) {
      throw Error('Anexo inválido na cópia.');
    }
    const binary = Uint8Array.from(atob(base64), letter => letter.charCodeAt(0));
    return {...metadata, id: crypto.randomUUID(), acaoId: ids.get(metadata.acaoId),
      ficheiro: new Blob([binary], {type: metadata.mime})};
  }));
}

function validateAction(action) {
  if (!action || !Array.isArray(action.parcelas) || !Array.isArray(action.meteo) ||
      !Array.isArray(action.tecnicos) || !Array.isArray(action.meios) ||
      typeof action.data !== 'string') {
    throw Error('Formato de ação inválido.');
  }
}

function actionFileName() {
  return (state.ocorrencia || state.nome || 'acao').replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0,100);
}

function initFieldBackups() {
  $('exportPackage').onclick = async () => {
    try {
      const action = state;
      const anexos = await encodeAttachments([action]);
      const files = new Map([
        ['acao.json', JSON.stringify({format:'fogo-tecnico-acao-v2', action, anexos:[]}, null, 2)],
        ['registo.xlsx', new Uint8Array(await createBlankExcel().arrayBuffer())],
        ['meteorologia.csv', csv(rowsMeteo())]
      ]);
      if (action.tipo === 'fogo_controlado') {
        const poq = await docPrint(true);
        if (!poq) throw Error('Não foi possível gerar o POQ.');
        files.set('POQ.html', poq);
      }
      if (state.geometrias?.length) files.set('cartografia.kml', fieldKML());
      const manifest = anexos.map(({base64, ...metadata}, index) => {
        const name = 'anexos/' + (index + 1) + '-' + metadata.nome.replace(/[^\p{L}\p{N}_.-]+/gu, '_');
        files.set(name, Uint8Array.from(atob(base64), letter => letter.charCodeAt(0)));
        return {...metadata, ficheiro:name};
      });
      files.set('anexos.json', JSON.stringify(manifest, null, 2));
      await blobDownload(zipWrite(files, 'application/zip'), 'fogo_' + actionFileName() + '.zip');
    } catch (error) {
      status(error.message);
    }
  };
  $('exportJSON').onclick = async () => {
    try {
      const anexos = await encodeAttachments([state]);
      const json = JSON.stringify({format:'fogo-tecnico-acao-v2', action:state, anexos});
      await blobDownload(new Blob([json], {type:'application/json'}), `fogo_${actionFileName()}_copia.json`);
    } catch (error) {
      status(error.message);
    }
  };
  $('importJSON').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const modern = data.format === 'fogo-tecnico-acao-v2';
      const action = {...initial(), ...(modern ? data.action : data)};
      validateAction(action);
      if (!confirm('Abrir a cópia como ação atual? Guarda primeiro quaisquer alterações não arquivadas.')) return;
      const oldId = action.campoId;
      action.campoId = crypto.randomUUID();
      if (modern) await restoreAttachments(data.anexos, new Map([[oldId,action.campoId]]));
      localStorage.setItem('fogo_acao_v2', JSON.stringify(action));
      location.reload();
    } catch (error) {
      status(error.message);
    }
  };
  $('exportHistory').onclick = async () => {
    try {
      const actions = getHistory();
      const anexos = await encodeAttachments(actions);
      const json = JSON.stringify({format:'fogo-tecnico-history-v2', actions, anexos});
      await blobDownload(new Blob([json],{type:'application/json'}), 'fogo_tecnico_historico_privado.json');
    } catch (error) {
      alert(error.message);
    }
  };
  const importHistory = async text => {
    try {
      const data = JSON.parse(text.replace(/^\uFEFF/, ''));
      const modern = data.format === 'fogo-tecnico-history-v2';
      if ((!modern && data.format !== 'fogo-tecnico-history-v1') || !Array.isArray(data.actions)) throw Error('Formato de histórico inválido.');
      const actions = data.actions.map(action => ({...initial(), ...action}));
      actions.forEach(validateAction);
      const history = getHistory();
      const refs = new Set(history.map(action => action.importRef).filter(Boolean));
      const added = actions.filter(action => {
        if (!action.importRef) return true;
        if (refs.has(action.importRef)) return false;
        refs.add(action.importRef);
        return true;
      });
      if (!added.length) return alert('As ações deste ficheiro já estão no histórico.');
      if (!confirm(`Juntar ${added.length} ações ao histórico local?`)) return;
      const ids = new Map();
      for (const action of added) {
        if (!action.campoId) continue;
        if (!ids.has(action.campoId)) ids.set(action.campoId, crypto.randomUUID());
        action.campoId = ids.get(action.campoId);
      }
      if (modern) await restoreAttachments(data.anexos.filter(item => ids.has(item.acaoId)), ids);
      setHistory([...getHistory(), ...added]);
    } catch (error) {
      alert(error.message);
    }
  };
  $('importHistory').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    try {
      if (file) await importHistory(await file.text());
    } catch (error) { alert(error.message); }
  };
  if (androidFiles?.openHistory) {
    $('historyFileLabel').hidden = true;
    const picker = $('openAndroidHistory');
    picker.hidden = false;
    picker.onclick = async () => {
      try {
        const {text} = await androidFiles.openHistory();
        if (text) await importHistory(text);
      } catch (error) { alert(error.message); }
    };
  }
}

window.addEventListener('DOMContentLoaded', initFieldBackups);
