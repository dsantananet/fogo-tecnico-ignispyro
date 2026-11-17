'use strict';

function mapCoordinates(text) {
  return text.trim().split(/\s+/).map(value => {
    const [lon, lat] = value.split(',');
    if (!lon?.trim() || !lat?.trim() || !Number.isFinite(+lon) || !Number.isFinite(+lat) ||
        Math.abs(+lon) > 180 || Math.abs(+lat) > 90) {
      throw Error('Usa coordenadas WGS84 no formato longitude,latitude.');
    }
    return [+lon, +lat];
  });
}

function parseFieldKML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'kml') {
    throw Error('Documento KML inválido.');
  }
  const geometries = [...doc.getElementsByTagNameNS('*', 'Placemark')].flatMap(place => {
    const name = [...place.children].find(node => node.localName === 'name')?.textContent || 'Geometria';
    return [...place.getElementsByTagNameNS('*', 'coordinates')].flatMap(node => {
      const geometry = node.parentElement;
      if (geometry.localName === 'Point' || geometry.localName === 'LineString') {
        return [{name, type: geometry.localName, coordinates: mapCoordinates(node.textContent)}];
      }
      if (geometry.localName === 'LinearRing' && geometry.parentElement.localName === 'outerBoundaryIs') {
        const polygon = geometry.parentElement.parentElement;
        const rings = [...polygon.getElementsByTagNameNS('*', 'innerBoundaryIs')].map(boundary =>
          mapCoordinates(boundary.getElementsByTagNameNS('*', 'coordinates')[0].textContent));
        return [{name, type: 'Polygon', coordinates: mapCoordinates(node.textContent), rings}];
      }
      return [];
    });
  });
  if (!geometries.length) throw Error('Sem pontos, linhas ou polígonos reconhecidos.');
  return geometries;
}

function fieldMapSVG() {
  const geometries = state.geometrias || [];
  if (!geometries.length) return '';
  let west = 180, east = -180, south = 90, north = -90;
  for (const {coordinates} of geometries) {
    for (const [lon, lat] of coordinates) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  const ratio = Math.cos((south + north) * Math.PI / 360);
  const scale = Math.min(580 / Math.max((east - west) * ratio, 0.00001),
    340 / Math.max(north - south, 0.00001));
  const project = ([lon, lat]) => [
    (310 + (lon - (east + west) / 2) * ratio * scale).toFixed(2),
    (190 + ((north + south) / 2 - lat) * scale).toFixed(2)
  ];
  const shapes = geometries.map(({type, coordinates, phase, rings}) => {
    const color = phase === 'Executado' ? '#a93f15' : '#00685e';
    if (type === 'Point') {
      const [x,y] = project(coordinates[0]);
      return `<circle cx="${x}" cy="${y}" r="6" fill="${color}"/>`;
    }
    const path = points => 'M' + points.map(project).join(' L');
    const data = type === 'Polygon' ? [coordinates, ...(rings || [])].map(points => path(points) + ' Z').join(' ') : path(coordinates);
    return `<path d="${data}" stroke="${color}" stroke-width="2" fill-rule="evenodd"
      fill-opacity=".22" fill="${type === 'Polygon' ? color : 'none'}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 380" role="img" aria-label="Cartografia da ação" style="width:100%;background:#eef4f2">${shapes.join('')}</svg>`;
}

function geometryArea(item) {
  if (item.type !== 'Polygon') return '';
  const radians = Math.PI / 180;
  const area = ring => Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + (next[0] - point[0]) * radians *
      (Math.sin(point[1] * radians) + Math.sin(next[1] * radians));
  }, 0)) * 6371008.8 ** 2 / 20000;
  return ` · ${(area(item.coordinates) - (item.rings || []).reduce((sum, ring) => sum + area(ring), 0)).toFixed(2)} ha (aprox.)`;
}

function fieldKML() {
  const coordinates = points => points.map(point => point.join(',')).join(' ');
  const ring = points => {
    const closed = points[0].join() === points.at(-1).join() ? points : [...points, points[0]];
    return '<LinearRing><coordinates>' + coordinates(closed) + '</coordinates></LinearRing>';
  };
  const places = (state.geometrias || []).map(item => {
    const geometry = item.type === 'Polygon' ?
      '<Polygon><outerBoundaryIs>' + ring(item.coordinates) + '</outerBoundaryIs>' +
      (item.rings || []).map(points => '<innerBoundaryIs>' + ring(points) + '</innerBoundaryIs>').join('') + '</Polygon>' :
      '<' + item.type + '><coordinates>' + coordinates(item.coordinates) + '</coordinates></' + item.type + '>';
    return '<Placemark><name>' + esc(item.name) + '</name><description>' +
      esc(item.phase || 'Planeado') + '</description>' + geometry + '</Placemark>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    places.join('') + '</Document></kml>';
}

function initFieldMap() {
  const editor = $('geometryEditor');
  let editing = null;
  const render = () => {
    $('miniMap').innerHTML = fieldMapSVG();
    $('geometryItems').replaceChildren(...(state.geometrias || []).map((item, index) => {
      const button = document.createElement('button');
      button.className = 'secondary small';
      button.textContent = `${item.name} · ${item.phase || 'Planeado'}${geometryArea(item)}`;
      button.onclick = () => {
        editing = index;
        editor.elements.designacao.value = item.name;
        editor.elements.tipo.value = item.type;
        editor.elements.fase.value = item.phase || 'Planeado';
        editor.elements.coordenadas.value = item.coordinates.join('\n');
        editor.hidden = false;
      };
      return button;
    }));
  };
  $('newGeometry').onclick = () => { editing = null; editor.reset(); editor.hidden = false; };
  $('cancelGeometry').onclick = () => { editor.hidden = true; };
  editor.onsubmit = event => {
    event.preventDefault();
    try {
      const coordinates = mapCoordinates(editor.elements.coordenadas.value);
      const type = editor.elements.tipo.value;
      if (type === 'Point' ? coordinates.length !== 1 : coordinates.length < (type === 'Polygon' ? 3 : 2)) {
        throw Error('Número de vértices inválido para esta geometria.');
      }
      const previous = state.geometrias?.[editing];
      const geometry = {
        name: editor.elements.designacao.value.trim(), phase: editor.elements.fase.value,
        type, coordinates, updatedAt: new Date().toISOString()
      };
      if (previous) {
        const {versions = [], ...snapshot} = previous;
        geometry.versions = [...versions, snapshot];
        if (type === 'Polygon' && previous.rings) geometry.rings = previous.rings;
      }
      state.geometrias ||= [];
      if (editing === null) state.geometrias.push(geometry);
      else state.geometrias[editing] = geometry;
      save();
      render();
      editor.hidden = true;
      $('geometryStatus').textContent = 'Geometria guardada.';
    } catch (error) {
      $('geometryStatus').textContent = error.message;
    }
  };
  $('kmlInput').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      let text = await file.text();
      if (/\.kmz$/i.test(file.name)) {
        const files = await unzipFile(file);
        const names = [...files.keys()].filter(name => /\.kml$/i.test(name));
        const entry = names.find(name => name.toLowerCase() === 'doc.kml') || names[0];
        if (!entry) throw Error('KMZ sem ficheiro KML.');
        text = TD.decode(files.get(entry));
      }
      const geometries = parseFieldKML(text);
      state.geometrias = [...(state.geometrias || []), ...geometries];
      save();
      render();
      $('geometryStatus').textContent = `${geometries.length} geometrias importadas.`;
    } catch (error) {
      $('geometryStatus').textContent = error.message;
    }
  };
  $('exportKML').onclick = () => blobDownload(new Blob([fieldKML()], {type:'application/vnd.google-earth.kml+xml'}), 'cartografia.kml');
  $('exportGeoJSON').onclick = () => {
    const close = points => points[0].join() === points.at(-1).join() ? points : [...points, points[0]];
    const features = (state.geometrias || []).map(({name, phase, type, coordinates, rings}) => ({
      type: 'Feature', properties: {nome: name, fase: phase || 'Planeado'},
      geometry: {type, coordinates: type === 'Polygon' ? [coordinates, ...(rings || [])].map(close) :
        type === 'Point' ? coordinates[0] : coordinates}
    }));
    blobDownload(new Blob([JSON.stringify({type:'FeatureCollection',features})], {type:'application/geo+json'}), 'cartografia.geojson');
  };
  render();
}
