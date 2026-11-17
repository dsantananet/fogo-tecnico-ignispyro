'use strict';

const DRIVE_CONNECTION = 'fogo_drive_connection_v1';
const DRIVE_REMOVED = 'fogo_drive_removed_v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FIELDS = 'id,appProperties';
const DRIVE_HASH = /^[0-9a-f]{64}$/;
let refreshDriveHistory;

const readDriveSetting = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
const writeDriveSetting = (key, value) => localStorage.setItem(key, JSON.stringify(value));

function driveJson(data) {
  return JSON.stringify(data, (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key,value[key]]));
  });
}

async function driveHash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
}

function handleHistoryChange(before, after, fromDrive) {
  if (fromDrive || !localStorage.getItem(DRIVE_CONNECTION)) return;
  const current = new Set(after.map(action => action.drive?.revision).filter(Boolean));
  const removals = readDriveSetting(DRIVE_REMOVED, {});
  for (const {drive} of before) {
    if (drive && !current.has(drive.revision)) removals[drive.revision] = drive.key;
  }
  writeDriveSetting(DRIVE_REMOVED, removals);
  refreshDriveHistory?.();
}

function makeDriveTransport(token, http) {
  async function request(method, url, data, headers = {}) {
    const response = await http.request({
      method, url, data, headers:{...headers, Authorization:'Bearer '+token},
      connectTimeout:12000, readTimeout:30000
    });
    if (response.status < 200 || response.status >= 300) {
      throw Error('O Google Drive respondeu com o código ' + response.status + '.');
    }
    return response;
  }
  return {
    async account() {
      const {data} = await request('GET', DRIVE_API+'/about?fields=user(permissionId,emailAddress)');
      if (!data?.user?.permissionId) throw Error('Não foi possível identificar a conta Google.');
      return data.user;
    },
    async list() {
      const result = new Map();
      let pageToken;
      do {
        const query = new URLSearchParams({
          spaces:'appDataFolder', fields:'nextPageToken,files('+DRIVE_FIELDS+')', pageSize:'1000',
          q:"appProperties has { key='ft' and value='1' }"
        });
        if (pageToken) query.set('pageToken', pageToken);
        const {data} = await request('GET', DRIVE_API+'/files?'+query);
        for (const {id,appProperties} of data.files || []) {
          const {r,k,p,h,d} = appProperties || {};
          if (DRIVE_HASH.test(r) && DRIVE_HASH.test(k) && DRIVE_HASH.test(h) &&
              (!p || DRIVE_HASH.test(p))) {
            result.set(r, {id, revision:r, key:k, parent:p || '', hash:h, deleted:d === '1'});
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
      return result;
    },
    async upload(record, content) {
      const endpoint = DRIVE_UPLOAD+'/files?uploadType=resumable&fields='+encodeURIComponent(DRIVE_FIELDS);
      const size = new TextEncoder().encode(content).length;
      const metadata = {
        name:record.revision+'.json', parents:['appDataFolder'], mimeType:'application/json',
        appProperties:{ft:'1',r:record.revision,k:record.key,h:record.hash,d:record.deleted?'1':'0',
          ...(record.parent ? {p:record.parent} : {})}
      };
      const session = await request('POST', endpoint, JSON.stringify(metadata),
        {'Content-Type':'application/json','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(size)});
      const location = new URL(session.headers?.location || session.headers?.Location || '');
      if (location.origin !== 'https://www.googleapis.com' ||
          !location.pathname.startsWith('/upload/drive/v3/files')) {
        throw Error('O Drive devolveu um destino de carregamento inesperado.');
      }
      const {data} = await request('PUT', location.href, content, {'Content-Type':'application/json'});
      return {...record,id:data.id};
    },
    async read(record) {
      const {data} = await request('GET', DRIVE_API+'/files/'+encodeURIComponent(record.id)+'?alt=media');
      const content = driveJson(typeof data === 'string' ? JSON.parse(data) : data);
      if (await driveHash(content) !== record.hash) throw Error('A cópia do Drive falhou a verificação de integridade.');
      return JSON.parse(content);
    }
  };
}

function driveHeads(records) {
  const parents = new Set([...records.values()].map(record => record.parent).filter(Boolean));
  return [...records.values()].filter(record => !record.deleted && !parents.has(record.revision));
}

async function reconcileDriveHistory(transport, account) {
  const history = getHistory();
  if (history.some(action => !action.campoId)) {
    for (const action of history) action.campoId ||= crypto.randomUUID();
    setHistory(history, true);
  }
  const original = localStorage.getItem(HIST_KEY);
  const removals = readDriveSetting(DRIVE_REMOVED, {});
  const records = await transport.list();
  const local = new Map();
  async function add(key, parent, content, deleted) {
    const hash = await driveHash(content);
    const revision = await driveHash(JSON.stringify([key,parent,hash,deleted]));
    if (!records.has(revision)) {
      records.set(revision, await transport.upload({key,parent,hash,revision,deleted}, content));
    }
    return records.get(revision);
  }
  for (const [parent, key] of Object.entries(removals)) {
    await add(key,parent,'{}',true);
  }
  for (const originalAction of history) {
    const {drive, ...action} = originalAction;
    if (drive && drive.account !== account) throw Error('Este histórico está ligado a outra conta Google.');
    const id = action.campoId ||= crypto.randomUUID();
    const key = drive?.key || await driveHash(action.importRef || id);
    const anexos = (await encodeAttachments([action])).map(({acaoId, id, ...item}) => item);
    const sortedAttachments = anexos.map(driveJson).sort().map(item => JSON.parse(item));
    const {campoId, ...portable} = {...initial(), ...action};
    const content = driveJson({action:portable,anexos:sortedAttachments});
    const hash = await driveHash(content);
    const record = drive?.hash === hash && records.has(drive.revision) ?
      records.get(drive.revision) : await add(key,drive?.revision || '',content,false);
    local.set(record.revision, {...action,drive:{key,revision:record.revision,hash,account}});
  }
  const merged = [];
  const attachments = [];
  const copies = new Map();
  for (const record of driveHeads(records)) {
    if (local.has(record.revision)) {
      merged.push(local.get(record.revision));
      continue;
    }
    const payload = await transport.read(record);
    validateAction(payload.action);
    if (!Array.isArray(payload.anexos)) throw Error('Cópia do Drive inválida.');
    const id = crypto.randomUUID();
    copies.set(id, id);
    attachments.push(...payload.anexos.map(item => ({...item,acaoId:id})));
    merged.push({...initial(),...payload.action,campoId:id,
      drive:{key:record.key,revision:record.revision,hash:record.hash,account}});
  }
  if (attachments.length) await restoreAttachments(attachments,copies);
  // Preserve changes made while the network requests were running.
  if (localStorage.getItem(HIST_KEY) !== original) return false;
  merged.sort((a,b) => a.data.localeCompare(b.data) || (a.drive.revision < b.drive.revision ? -1 : 1));
  setHistory(merged, true);
  const remaining = readDriveSetting(DRIVE_REMOVED, {});
  for (const key of Object.keys(removals)) delete remaining[key];
  writeDriveSetting(DRIVE_REMOVED, remaining);
  return true;
}

window.addEventListener('DOMContentLoaded', () => {
  const plugins = window.Capacitor?.Plugins;
  if (!plugins?.DriveAuthorization || !plugins?.CapacitorHttp || !$('drivePanel')) return;
  $('drivePanel').hidden = false;
  let running = false;
  let scheduled;
  let nextCheck = 0;
  const feedback = $('driveStatus');
  const current = () => readDriveSetting(DRIVE_CONNECTION, null);
  function controls() {
    $('driveConnect').hidden = !!current();
    $('driveSyncNow').hidden = !current();
    $('driveDisconnect').hidden = !current();
    for (const id of ['driveConnect','driveSyncNow','driveDisconnect']) $(id).disabled = running;
  }
  async function sync(interactive = false, manual = false) {
    if (running || (!interactive && !current()) || (!manual && Date.now() < nextCheck)) return;
    running = true;
    controls();
    feedback.textContent = 'A consultar o histórico no Google Drive…';
    try {
      const {accessToken} = await plugins.DriveAuthorization.authorize({interactive});
      const transport = makeDriveTransport(accessToken, plugins.CapacitorHttp);
      const account = await transport.account();
      if (current() && current().id !== account.permissionId) {
        throw Error('Seleciona a mesma conta Google que ligaste neste equipamento.');
      }
      if (!current()) {
        if (getHistory().some(action => action.drive && action.drive.account !== account.permissionId)) {
          throw Error('Este histórico pertence a outra conta Google.');
        }
        if (!confirm('Sincronizar o histórico arquivado com '+(account.emailAddress || 'a conta Google selecionada')+'?')) {
          feedback.textContent = 'Ligação cancelada.';
          return;
        }
        writeDriveSetting(DRIVE_CONNECTION,{id:account.permissionId, email:account.emailAddress || ''});
      }
      if (await reconcileDriveHistory(transport,account.permissionId)) {
        nextCheck = Date.now() + 30000;
        feedback.textContent = 'Histórico sincronizado · '+new Date().toLocaleTimeString('pt-PT');
      } else {
        nextCheck = 0;
        refreshDriveHistory();
      }
    } catch (error) {
      nextCheck = Date.now() + 15000;
      feedback.textContent = error.message;
    } finally {
      running = false;
      controls();
    }
  }
  refreshDriveHistory = () => {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => sync(false,true), 1500);
  };
  $('driveConnect').onclick = () => sync(true,true);
  $('driveSyncNow').onclick = () => sync(true,true);
  $('driveDisconnect').onclick = () => {
    localStorage.removeItem(DRIVE_CONNECTION);
    feedback.textContent = 'Google Drive desligado neste equipamento.';
    controls();
  };
  controls();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('online', () => sync());
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
  sync();
});
