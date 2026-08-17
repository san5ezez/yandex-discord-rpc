(() => {
  'use strict';

  // Селекторы намеренно избыточны: Яндекс периодически меняет CSS-классы.
  const SELECTORS = {
    title: [
      '[data-testid="track-title"]', '[data-test-id="track-title"]',
      '.player-controls__track-title', '.player-controls__title',
      '.d-track__title', '[class*="track-title"]', '[class*="trackTitle"]'
    ],
    artist: [
      '[data-testid="track-artists"]', '[data-test-id="track-artists"]',
      '.player-controls__track-artists', '.player-controls__artists',
      '.d-track__artists', '[class*="track-artists"]', '[class*="trackArtists"]'
    ],
    cover: [
      '.player-controls__track-cover img', '.player-controls__cover img',
      '.d-track__cover img', '[class*="track-cover"] img',
      'img[alt*="облож"]', 'img[alt*="cover"]'
    ],
    audio: ['audio']
  };

  function currentTrackLink() {
    return [...document.querySelectorAll('a[href*="/track/"]')]
      .find((node) => node.closest('[class*="PlayerBar"], [aria-label="Плеер"]'))
      || document.querySelector('a[href*="/track/"]');
  }

  function currentArtistLinks(trackLink) {
    const container = trackLink?.closest('[class*="Meta_root"], [class*="PlayerBar"]')
      || trackLink?.parentElement?.parentElement?.parentElement?.parentElement;
    return [...(container || document).querySelectorAll('a[href*="/artist/"]')];
  }

  const text = (selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.textContent?.replace(/\s+/g, ' ').trim();
      if (value) return value;
    }
    return '';
  };

  const attr = (selectors, name) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute(name)?.trim();
      if (value) return value;
    }
    return '';
  };

  function readState() {
    const audio = document.querySelector('audio');
    const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
    const trackLink = currentTrackLink();
    const artistLinks = currentArtistLinks(trackLink);
    const title = text(SELECTORS.title) || trackLink?.textContent?.replace(/\s+/g, ' ').trim() || metadata?.title || '';
    const artist = text(SELECTORS.artist) || artistLinks.map((node) => node.textContent.trim()).filter(Boolean).join(', ') || metadata?.artist || '';
    const trackKey = `${title}\u0000${artist}`;
    const trackChanged = Boolean(title || artist) && trackKey !== lastTrackKey;
    lastTrackKey = trackKey;
    const coverUrl = attr(SELECTORS.cover, 'src') ||
      trackLink?.closest('[class*="infoCard"], [class*="info"], [class*="PlayerBar"]')?.querySelector('img')?.src ||
      (metadata?.artwork?.length ? metadata.artwork[metadata.artwork.length - 1]?.src : '') || '';

    // Явное состояние audio точнее DOM-класса play/pause.
    const playButton = [...document.querySelectorAll('button')]
      .find((button) => /^(Воспроизведение|Пауза|Play|Pause)$/i.test(button.getAttribute('aria-label') || ''));
    const icon = playButton?.querySelector('use')?.getAttribute('xlink:href') ||
      playButton?.querySelector('use')?.getAttribute('href') || '';
    const buttonLabel = (playButton?.getAttribute('aria-label') || '').toLowerCase();
    const isPlaying = audio ? !audio.paused && !audio.ended :
      /pause/i.test(icon) || buttonLabel.includes('пауза');
    let duration = Number.isFinite(audio?.duration) ? audio.duration : null;
    let position = Number.isFinite(audio?.currentTime) ? audio.currentTime : null;

    // В текущей версии сайта audio-элемент может отсутствовать: звук идёт через WebAudio.
    // Тогда берём прошедшее и оставшееся время из блока слайдера таймкода.
    const timeline = document.querySelector('[aria-label="Управление таймкодом"]');
    const parseTimecode = (value) => {
      const match = String(value || '').match(/(\d+)\s*минут\w*\D+(\d+)\s*секунд\w*/i) ||
        String(value || '').match(/(\d+)\s*секунд\w*/i) ||
        String(value || '').match(/\b(\d{1,2}):(\d{2})\b/);
      if (!match) return null;
      return match.length === 2 ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2]);
    };
    const timelineRoot = timeline?.parentElement;
    const currentNode = timelineRoot?.querySelector('[class*="timecode_current"]');
    const endNode = timelineRoot?.querySelector('[class*="timecode_end"]');
    const currentFromAria = parseTimecode(currentNode?.getAttribute('aria-label')) ||
      parseTimecode(timeline?.getAttribute('aria-valuetext')) ||
      Number(timeline?.value);
    const durationFromMax = Number(timeline?.getAttribute('max'));
    if (!Number.isFinite(position) && Number.isFinite(currentFromAria)) position = currentFromAria;
    if (!Number.isFinite(duration) && Number.isFinite(durationFromMax) && durationFromMax > 0) duration = durationFromMax;

    // Fallback для старых вариантов DOM: первый span — конец, второй — текущая позиция.
    if (!Number.isFinite(position) || !Number.isFinite(duration)) {
      const timelineText = timelineRoot?.innerText || '';
      const times = [...timelineText.matchAll(/\b(\d{1,2}):(\d{2})\b/g)]
        .map((match) => Number(match[1]) * 60 + Number(match[2]));
      if (!Number.isFinite(duration) && times.length >= 1) duration = times[0];
      if (!Number.isFinite(position) && times.length >= 2) position = times[1];
    }

    // Если виден только процент таймлайна, восстановить позицию можно после получения duration.
    const percent = Number(timeline?.getAttribute('aria-valuenow'));
    if (Number.isFinite(duration) && !Number.isFinite(position) && Number.isFinite(percent)) {
      position = duration * Math.max(0, Math.min(100, percent)) / 100;
    }

    if (!title && !artist) return null;

    // Яндекс сначала меняет название, а таймкод обновляет чуть позже.
    if (trackChanged && !audio) {
      position = 0;
      duration = null;
      if (timingRefreshTimer) clearTimeout(timingRefreshTimer);
      timingRefreshTimer = setTimeout(() => {
        timingRefreshTimer = null;
        publish();
      }, 700);
    }
    return {
      title: title.slice(0, 128),
      artist: artist.slice(0, 128),
      coverUrl,
      isPlaying,
      duration,
      position,
      url: location.href,
      sentAt: Date.now()
    };
  }

  let lastSerialized = '';
  let lastTrackKey = '';
  let timingRefreshTimer = null;
  let stopped = false;
  let pollTimer = null;
  let observer = null;

  function stopIfContextInvalidated(error) {
    if (!String(error?.message || error).toLowerCase().includes('context invalidated')) return;
    stopped = true;
    observer?.disconnect();
    if (pollTimer) clearInterval(pollTimer);
  }

  function publish() {
    if (stopped) return;
    let state;
    try {
      state = readState();
    } catch (error) {
      stopIfContextInvalidated(error);
      console.debug('[Yandex Music RPC] Player state is temporarily unavailable', error);
      return;
    }
    if (!state) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    try {
      const messageResult = chrome.runtime.sendMessage({ type: 'TRACK_STATE', state });
      if (messageResult && typeof messageResult.catch === 'function') {
        messageResult.catch((error) => stopIfContextInvalidated(error));
      }
    } catch {
      // Расширение могло перезагрузиться в момент отправки сообщения.
      stopped = true;
    }
  }

  observer = new MutationObserver(() => publish());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  document.addEventListener('play', publish, true);
  document.addEventListener('pause', publish, true);
  document.addEventListener('timeupdate', publish, true);
  pollTimer = setInterval(publish, 5000); // прогресс и восстановление после смены трека
  publish();
})();
