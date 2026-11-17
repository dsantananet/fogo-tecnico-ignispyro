(() => {
  const bridge = globalThis.Capacitor;
  const control = document.getElementById('androidUpdate');
  const android = bridge?.getPlatform() === 'android';
  const windows = location.origin === 'http://127.0.0.1:49774';
  if (!android && !windows) return;

  const releases = android ? bridge.Plugins.ReleaseUpdates : null;
  const repo = 'dsantananet/fogo-tecnico-ignispyro';
  const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;
  const versionLabel = document.querySelector('.app-version');
  const button = document.getElementById('updateButton');
  const feedback = document.getElementById('updateStatus');
  let available;
  let nextCheck = 0;
  function compareVersions(candidate, installed) {
    const next = versionPattern.exec(candidate);
    const current = versionPattern.exec(installed);
    if (!next || !current) return false;
    for (let index = 1; index <= 3; index++) {
      const difference = Number(next[index]) - Number(current[index]);
      if (difference !== 0) return difference > 0;
    }
    return false;
  }

  async function checkForUpdate(manual = false) {
    if (button.disabled || (!manual && Date.now() < nextCheck)) return;
    button.disabled = true;
    try {
      const version = releases ? (await releases.version()).version : versionLabel.textContent.trim();
      versionLabel.textContent = 'v' + version.replace(/^v/, '');
      const response = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('GitHub indisponível');
      const release = await response.json();
      const tag = release.tag_name;
      const filename = android ? 'Fogo-Tecnico-IgnisPyro-' + tag + '.apk' :
        'Fogo-Tecnico-IgnisPyro-Windows-' + tag + '.exe';
      const url = 'https://github.com/' + repo + '/releases/download/' + tag + '/' + filename;
      available = compareVersions(tag, version) && release.assets?.some(asset =>
        asset.name === filename && asset.browser_download_url === url
      ) ? {tag, url} : undefined;
      nextCheck = Date.now() + 60 * 60 * 1000;
      feedback.textContent = available ? 'Nova versão disponível: ' + available.tag :
        manual ? 'Tens a versão mais recente.' : '';
      button.textContent = available ? 'Descarregar ' + available.tag : 'Verificar atualizações';
    } catch {
      nextCheck = Date.now() + 5 * 60 * 1000;
      if (manual) feedback.textContent = 'Não foi possível verificar. Tenta novamente com ligação à Internet.';
    } finally {
      button.disabled = false;
    }
  }

  control.hidden = false;
  button.addEventListener('click', async () => {
    if (!available) return checkForUpdate(true);
    try {
      if (releases) await releases.download({ tag: available.tag });
      else window.location.assign(available.url);
    } catch {
      feedback.textContent = 'Não foi possível abrir o download.';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
  checkForUpdate();
})();
