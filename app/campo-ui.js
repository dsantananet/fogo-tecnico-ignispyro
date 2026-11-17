'use strict';

function fieldActionId() {
  if (!state.campoId) {
    state.campoId = crypto.randomUUID();
    save();
  }
  return state.campoId;
}

async function fieldPosition() {
  const geo = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Geolocation;
  if (geo) {
    try {
      const permission = await geo.requestPermissions({permissions:['location']});
      if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') return null;
      const position = await geo.getCurrentPosition({enableHighAccuracy: true, timeout: 12000, maximumAge: 0});
      return position.coords;
    } catch {
      return null;
    }
  }
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({coords}) => resolve(coords), () => resolve(null),
      {enableHighAccuracy: true, timeout: 12000, maximumAge: 0}
    );
  });
}

function photoCaption(item) {
  const gps = item.latitude == null || item.longitude == null ? 'Sem GPS' :
    `${item.latitude}, ${item.longitude}`;
  return [item.referencia || item.id, item.descricao, item.parcelaId, item.autor,
    localDate(item.capturadoEm), gps].filter(Boolean).join(' · ');
}

async function renderAttachments() {
  const items = state.campoId ? await IgnisPyroCampoStorage.listarAnexos(state.campoId) : [];
  const gallery = $('galeria');
  for (const image of gallery.querySelectorAll('img')) URL.revokeObjectURL(image.src);
  gallery.replaceChildren();
  for (const item of items.filter(item => item.tipo === 'fotografia')) {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `<img alt="${esc(item.nome)}"><p>${esc(photoCaption(item))}</p>
      <button class="secondary small">Editar metadados</button>`;
    entry.querySelector('img').src = URL.createObjectURL(item.ficheiro);
    entry.querySelector('button').onclick = () => editPhoto(item);
    gallery.append(entry);
  }
}

function editPhoto(item) {
  const editor = $('photoEditor');
  const fields = ['referencia','descricao','parcelaId','autor','capturadoEm','latitude','longitude'];
  for (const key of fields) editor.elements[key].value = item[key] ?? '';
  editor.onsubmit = async event => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(editor));
      const date = new Date(values.capturadoEm);
      if (!Number.isFinite(date.getTime())) throw Error('Data/hora inválida. Usa o formato ISO apresentado.');
      const coordinates = [values.latitude, values.longitude].map(value => value.trim() === '' ? null : Number(value));
      if ((coordinates[0] === null) !== (coordinates[1] === null) ||
          coordinates.some((value, index) => value !== null &&
            (!Number.isFinite(value) || Math.abs(value) > (index ? 180 : 90)))) {
        throw Error('Introduz latitude e longitude decimais válidas.');
      }
      await IgnisPyroCampoStorage.atualizarAnexo({
        ...item, ...values, capturadoEm: date.toISOString(),
        latitude: coordinates[0], longitude: coordinates[1]
      });
      editor.hidden = true;
      await renderAttachments();
    } catch (error) {
      $('fieldStatus').textContent = error.message;
    }
  };
  editor.hidden = false;
  editor.elements.referencia.focus();
}

async function addFieldImages(input, tipo, capture = false) {
  const files = [...input.files];
  input.value = '';
  if (!files.length) return;
  const acaoId = fieldActionId();
  const parcelaId = $('photoParcel').value;
  try {
    const position = capture && $('photoGPS').checked ? await fieldPosition() : null;
    for (const ficheiro of files) {
      if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(ficheiro.type)) {
        throw Error('Formato de imagem não suportado.');
      }
      await IgnisPyroCampoStorage.guardarAnexo({
        acaoId, parcelaId, tipo, ficheiro,
        capturadoEm: capture ? new Date().toISOString() : undefined,
        latitude: position?.latitude ?? null, longitude: position?.longitude ?? null
      });
    }
    await renderAttachments();
    $('fieldStatus').textContent = capture && $('photoGPS').checked && !position ?
      'Fotografia guardada. GPS indisponível.' : 'Anexo guardado.';
  } catch (error) {
    $('fieldStatus').textContent = error.message;
    await renderAttachments();
  }
}

async function loadPOQAttachments() {
  const items = state.campoId ? await IgnisPyroCampoStorage.listarAnexos(state.campoId) : [];
  const dataImage = item => readImage(item.ficheiro);
  photos = await Promise.all(items.filter(item => item.tipo === 'fotografia')
    .map(async item => ({...(await dataImage(item)), name: photoCaption(item)})));
  const map = items.filter(item => item.tipo === 'mapa').at(-1);
  mapPhoto = map ? await dataImage(map) : null;
}

function initFieldPhotos() {
  const select = $('photoParcel');
  document.querySelector('[data-tab=poq]').addEventListener('click', () => {
    select.replaceChildren(new Option('Toda a ação', ''));
    for (const parcel of state.parcelas) {
      const ref = parcel.id || parcel.nome;
      if (ref) select.add(new Option(parcel.nome || ref, ref));
    }
  });
  $('fotos').onchange = event => addFieldImages(event.target, 'fotografia', true);
  $('fotoGaleria').onchange = event => addFieldImages(event.target, 'fotografia');
  $('mapa').onchange = event => addFieldImages(event.target, 'mapa');
  $('photoCancel').onclick = () => { $('photoEditor').hidden = true; };
  renderAttachments().catch(error => { $('fieldStatus').textContent = error.message; });
}
