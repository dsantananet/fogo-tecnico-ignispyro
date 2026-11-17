(() => {
  const bridge = globalThis.Capacitor;
  const control = document.getElementById('androidUpdate');
  if (bridge?.getPlatform() !== 'android') return;

  const releases = androidPlugin('ReleaseUpdates', ['version', 'download']);
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
      const { version } = await releases.version();
      versionLabel.textContent = 'v' + version;
      const response = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('GitHub indisponível');
      const release = await response.json();
      const tag = release.tag_name;
      const apk = 'Fogo-Tecnico-IgnisPyro-' + tag + '.apk';
      const url = 'https://github.com/' + repo + '/releases/download/' + tag + '/' + apk;
      available = compareVersions(tag, version) && release.assets?.some(asset =>
        asset.name === apk && asset.browser_download_url === url
      ) ? tag : undefined;
      nextCheck = Date.now() + 60 * 60 * 1000;
      feedback.textContent = available ? 'Nova versão disponível: ' + available :
        manual ? 'Tens a versão mais recente.' : '';
      button.textContent = available ? 'Descarregar ' + available : 'Verificar atualizações';
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
      await releases.download({ tag: available });
    } catch {
      feedback.textContent = 'Não foi possível abrir o download.';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
  checkForUpdate();
})();
