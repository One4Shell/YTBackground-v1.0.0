/*!
 * YTBackground v1.0.0
 * Libreria per gestire video YouTube come background dinamici
 * Supporta effetto "object-fit: cover" tramite calcolo matematico JS
 * Autore: Senior Frontend Developer
 * Licenza: MIT
 */

;(function (root, factory) {
  'use strict';

  // Pattern UMD (Universal Module Definition)
  // Compatibile con AMD, CommonJS e browser globale
  if (typeof define === 'function' && define.amd) {
    // AMD (es. RequireJS)
    define([], factory);
  } else if (typeof module !== 'undefined' && module.exports) {
    // CommonJS / Node.js
    module.exports = factory();
  } else {
    // Browser globale - espone YTBackground su window
    root.YTBackground = factory();
  }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ============================================================
  // COSTANTI E VARIABILI MODULO
  // ============================================================

  /**
   * Rapporto d'aspetto standard dei video YouTube (16:9)
   * Usato per calcolare le dimensioni dell'iframe con cover
   */
  const YT_ASPECT_RATIO = 16 / 9;

  /**
   * URL dell'API YouTube iframe
   */
  const YT_API_URL = 'https://www.youtube.com/iframe_api';

  /**
   * Selettore per l'inizializzazione dichiarativa tramite data-attributes
   */
  const AUTO_INIT_SELECTOR = '[data-yt-bg-id]';

  /**
   * Namespace per i data-attributes HTML
   */
  const DATA_PREFIX = 'ytBg';

  /**
   * Registry centrale di tutte le istanze attive
   * Usato per il resize globale e la gestione del ciclo di vita
   */
  const instanceRegistry = new Map();

  /**
   * Flag che indica se l'API YouTube è già stata caricata nel DOM
   */
  let ytApiLoaded = false;

  /**
   * Flag che indica se l'API YouTube è pronta all'uso
   */
  let ytApiReady = false;

  /**
   * Coda di callback da eseguire quando l'API YouTube è pronta
   */
  const ytReadyCallbacks = [];

  /**
   * Timer per il debounce dell'evento resize
   */
  let resizeDebounceTimer = null;

  /**
   * Ritardo in ms per il debounce del resize (ottimizzazione performance)
   */
  const RESIZE_DEBOUNCE_DELAY = 150;

  // ============================================================
  // UTILITÀ CSS - Iniezione stili globali
  // ============================================================

  /**
   * Inietta i CSS di base nella pagina (eseguito una sola volta)
   * Definisce le classi fondamentali per il posizionamento dell'iframe
   */
  function injectGlobalStyles() {
    // Evita di iniettare gli stili più volte
    if (document.getElementById('ytbg-global-styles')) return;

    const style = document.createElement('style');
    style.id = 'ytbg-global-styles';
    style.textContent = `
      /* =============================================
         YTBackground - Stili Globali Iniettati
         ============================================= */

      /* Contenitore padre: posizione relativa e overflow hidden
         garantiscono che il video non trabocchi fuori dal div */
      .ytbg-parent {
        position: relative !important;
        overflow: hidden !important;
      }

      /* Wrapper interno che isola completamente il video iframe
         dal layout della pagina */
      .ytbg-wrapper {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: 0 !important;
        overflow: hidden !important;
      }

      /* L'iframe è centrato e ridimensionato via JS
         per simulare object-fit: cover */
      .ytbg-iframe {
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate3d(-50%, -50%, 0) !important;
        will-change: transform;
        pointer-events: none !important;
        border: none !important;
        /* Nasconde i controlli e le barre di YouTube
           usando margini negativi (tecnica complementare) */
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Overlay opzionale sopra il video (per leggibilità contenuti) */
      .ytbg-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }

      /* Stato di loading: placeholder mentre il video si carica */
      .ytbg-parent.ytbg-loading::before {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: #000 !important;
        z-index: 2 !important;
        transition: opacity 0.5s ease !important;
        opacity: 1 !important;
      }

      /* Quando il video è pronto, il placeholder svanisce */
      .ytbg-parent.ytbg-ready::before {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    // Inserisci prima di qualsiasi altro stile per permettere override
    const firstStyle = document.head.querySelector('style, link[rel="stylesheet"]');
    if (firstStyle) {
      document.head.insertBefore(style, firstStyle);
    } else {
      document.head.appendChild(style);
    }
  }

  // ============================================================
  // GESTIONE API YOUTUBE
  // ============================================================

  /**
   * Carica l'API YouTube iframe in modo asincrono
   * Se già presente nel DOM, non carica un secondo script
   * @param {Function} callback - Funzione da eseguire quando l'API è pronta
   */
  function loadYouTubeAPI(callback) {
    // Registra il callback nella coda
    if (typeof callback === 'function') {
      ytReadyCallbacks.push(callback);
    }

    // Se l'API è già pronta, esegui subito il callback
    if (ytApiReady) {
      callback && callback();
      return;
    }

    // Se lo script è già in fase di caricamento, aspetta
    if (ytApiLoaded) return;

    // Controlla se lo script YouTube è già nel DOM (caricato da altri)
    const existingScript = document.querySelector(`script[src="${YT_API_URL}"]`);
    if (existingScript) {
      ytApiLoaded = true;
      // L'evento onYouTubeIframeAPIReady gestirà il resto
      return;
    }

    // Crea e inietta lo script dell'API YouTube
    ytApiLoaded = true;
    const tag = document.createElement('script');
    tag.src = YT_API_URL;
    tag.async = true;
    tag.defer = true;

    // Gestione errori di caricamento script
    tag.onerror = function () {
      console.error('[YTBackground] Impossibile caricare l\'API YouTube. Controlla la connessione di rete.');
      ytApiLoaded = false; // Reset per permettere un nuovo tentativo
    };

    // Inserisce lo script prima del primo tag script nella pagina
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(tag, firstScript);
  }

  /**
   * Gestisce il callback globale onYouTubeIframeAPIReady
   * Chiamato automaticamente da YouTube quando l'API è pronta
   * NOTA: Deve essere sul window, ma gestiamo il caso in cui
   * sia già stato definito da altro codice nella pagina
   */
  function setupYouTubeReadyHandler() {
    const previousHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = function () {
      // Esegui il precedente handler se esistente (rispetto del codice terzo)
      if (typeof previousHandler === 'function') {
        previousHandler();
      }

      ytApiReady = true;

      // Esegui tutti i callback in coda
      while (ytReadyCallbacks.length > 0) {
        const cb = ytReadyCallbacks.shift();
        try {
          cb();
        } catch (e) {
          console.error('[YTBackground] Errore nell\'esecuzione del callback API ready:', e);
        }
      }
    };
  }

  // ============================================================
  // CALCOLO DIMENSIONI "OBJECT-FIT: COVER"
  // ============================================================

  /**
   * Calcola le dimensioni dell'iframe per simulare object-fit: cover
   *
   * ALGORITMO:
   * - Confronta il rapporto d'aspetto del contenitore con quello del video (16:9)
   * - Se il contenitore è "più largo" (landscape rispetto a 16:9):
   *   → Larghezza = 100% del contenitore, Altezza calcolata di conseguenza
   *   → Il video è più alto del contenitore → parte superiore/inferiore tagliata ✓
   * - Se il contenitore è "più stretto" (portrait, quadrato, o meno largo):
   *   → Altezza = 100% del contenitore, Larghezza calcolata di conseguenza
   *   → Il video è più largo del contenitore → parte sinistra/destra tagliata ✓
   *
   * @param {number} containerWidth  - Larghezza del contenitore in px
   * @param {number} containerHeight - Altezza del contenitore in px
   * @returns {{ width: number, height: number }} - Dimensioni calcolate in px
   */
  function calculateCoverDimensions(containerWidth, containerHeight) {
    // Protezione da divisione per zero
    if (containerWidth === 0 || containerHeight === 0) {
      return { width: 0, height: 0 };
    }

    // Rapporto d'aspetto del contenitore
    const containerRatio = containerWidth / containerHeight;

    let iframeWidth, iframeHeight;

    if (containerRatio >= YT_ASPECT_RATIO) {
      // Il contenitore è più largo del video (o uguale):
      // → Allinea le larghezze, l'altezza si adatta (sarà maggiore del contenitore)
      iframeWidth = containerWidth;
      iframeHeight = containerWidth / YT_ASPECT_RATIO;
    } else {
      // Il contenitore è più stretto del video (es. quadrato, verticale):
      // → Allinea le altezze, la larghezza si adatta (sarà maggiore del contenitore)
      iframeHeight = containerHeight;
      iframeWidth = containerHeight * YT_ASPECT_RATIO;
    }

    // Aggiungiamo un piccolo offset (4px) per prevenire "fessure" dovute all'arrotondamento
    // dei pixel su display mobile ad alta densità (Retina/OLED)
    return {
      width: Math.ceil(iframeWidth) + 4,
      height: Math.ceil(iframeHeight) + 4
    };
  }

  // ============================================================
  // GESTIONE RESIZE GLOBALE CON DEBOUNCE
  // ============================================================

  /**
   * Ricalcola le dimensioni di tutte le istanze registrate
   * Chiamata ad ogni evento resize (con debounce)
   */
  function recalculateAllInstances() {
    instanceRegistry.forEach(function (instance) {
      if (instance && typeof instance.resize === 'function') {
        instance.resize();
      }
    });
  }

  /**
   * Handler dell'evento resize con debounce
   * Il debounce evita chiamate eccessive durante il trascinamento
   * del bordo della finestra (ottimizzazione performance critica)
   */
  function onWindowResize() {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(recalculateAllInstances, RESIZE_DEBOUNCE_DELAY);
  }

  // Aggancia l'evento resize una sola volta
  window.addEventListener('resize', onWindowResize, { passive: true });
  // Gestione esplicita del cambio orientamento per smartphone
  window.addEventListener('orientationchange', onWindowResize, { passive: true });

  // ============================================================
  // PARSING OPTIONS DA DATA-ATTRIBUTES
  // ============================================================

  /**
   * Legge e normalizza le opzioni dai data-attributes di un elemento HTML
   * Converte i tipi stringa nei tipi JavaScript appropriati
   *
   * @param {HTMLElement} element - L'elemento DOM da cui leggere i dati
   * @returns {Object} - Oggetto opzioni normalizzato
   */
  function parseDataAttributes(element) {
    const dataset = element.dataset;

    return {
      // ID del video (obbligatorio)
      videoId: dataset.ytBgId || null,

      // Muto: true di default (necessario per autoplay moderno)
      mute: dataset.ytBgMute !== undefined
        ? dataset.ytBgMute !== 'false'
        : true,

      // Loop: true di default
      loop: dataset.ytBgLoop !== undefined
        ? dataset.ytBgLoop !== 'false'
        : true,

      // Secondo di inizio
      start: dataset.ytBgStart !== undefined
        ? parseInt(dataset.ytBgStart, 10) || 0
        : 0,

      // Controlli YouTube: false di default (background pulito)
      controls: dataset.ytBgControls !== undefined
        ? dataset.ytBgControls === 'true'
        : false,

      // Overlay: opacità del layer scuro sopra il video (0-1)
      overlay: dataset.ytBgOverlay !== undefined
        ? parseFloat(dataset.ytBgOverlay) || 0
        : 0,

      // Qualità di riproduzione suggerita
      quality: dataset.ytBgQuality || 'hd1080',

      // Autoplay: sempre true per i background (modificabile)
      autoplay: dataset.ytBgAutoplay !== undefined
        ? dataset.ytBgAutoplay !== 'false'
        : true
    };
  }

  // ============================================================
  // CLASSE PRINCIPALE: YTBackgroundInstance
  // ============================================================

  /**
   * Rappresenta una singola istanza di video background
   * Gestisce il ciclo di vita completo: creazione DOM, player YT, resize
   */
  class YTBackgroundInstance {
    /**
     * @param {HTMLElement} element - Il contenitore DOM target
     * @param {Object} options      - Opzioni di configurazione
     */
    constructor(element, options = {}) {
      if (!element || !(element instanceof HTMLElement)) {
        throw new Error('[YTBackground] L\'elemento fornito non è un HTMLElement valido.');
      }

      // Riferimento all'elemento contenitore
      this.element = element;

      // Merge delle opzioni con i valori di default
      this.options = Object.assign({
        videoId: null,
        mute: true,
        loop: true,
        start: 0,
        controls: false,
        overlay: 0,
        quality: 'hd1080',
        autoplay: true,
        onReady: null,      // Callback quando il player è pronto
        onStateChange: null // Callback per i cambi di stato del player
      }, options);

      // Validazione opzione fondamentale
      if (!this.options.videoId) {
        console.error('[YTBackground] Opzione "videoId" mancante per l\'elemento:', element);
        return;
      }

      // ID univoco per questa istanza
      this.instanceId = `ytbg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Riferimenti agli elementi DOM creati
      this.wrapper = null;
      this.iframeContainer = null;
      this.overlayEl = null;

      // Riferimento al player YouTube
      this.player = null;

      // Flag stato
      this.isReady = false;
      this.isDestroyed = false;

      // Cache dimensioni per evitare calcoli inutili su mobile scroll
      this._lastWidth = 0;
      this._lastHeight = 0;

      // Avvia l'inizializzazione
      this._init();
    }

    // ============================================================
    // METODI PRIVATI (prefisso _ per convenzione)
    // ============================================================

    /**
     * Inizializza l'istanza:
     * 1. Prepara il DOM del contenitore
     * 2. Crea la struttura HTML necessaria
     * 3. Carica l'API YouTube e crea il player
     */
    _init() {
      // Prepara il contenitore padre
      this._prepareParentElement();

      // Crea la struttura DOM del wrapper
      this._createDOMStructure();

      // Aggiungi classe loading
      this.element.classList.add('ytbg-loading');

      // Registra questa istanza nel registry globale
      instanceRegistry.set(this.instanceId, this);

      // Carica l'API YouTube e inizializza il player
      loadYouTubeAPI(() => this._createPlayer());
    }

    /**
     * Assicura che il contenitore padre abbia i CSS necessari
     * position: relative e overflow: hidden sono fondamentali
     */
    _prepareParentElement() {
      const computedStyle = window.getComputedStyle(this.element);

      // Imposta position: relative solo se non è già positioned
      const position = computedStyle.getPropertyValue('position');
      if (position === 'static') {
        this.element.style.position = 'relative';
      }

      // Aggiunge la classe che gestisce overflow e posizionamento
      this.element.classList.add('ytbg-parent');

      // Salva il z-index dei figli per preservare lo stack order
      this._preserveChildrenStackOrder();
    }

    /**
     * Assicura che i contenuti esistenti del div abbiano z-index > 0
     * così appaiono sopra il video background
     */
    _preserveChildrenStackOrder() {
      // Itera sui figli diretti esistenti
      Array.from(this.element.children).forEach(child => {
        const computed = window.getComputedStyle(child);
        const zIndex = computed.getPropertyValue('z-index');

        // Se il figlio non ha z-index esplicito, impostane uno
        if (zIndex === 'auto' || zIndex === '0') {
          child.style.position = child.style.position || 'relative';
          child.style.zIndex = '2'; // Sopra il video (z-index: 0) e overlay (z-index: 1)
        }
      });
    }

    /**
     * Crea la struttura DOM:
     * [parent]
     *   └── [.ytbg-wrapper]
     *         ├── [div#containerId] ← YouTube monta qui l'iframe
     *         └── [.ytbg-overlay]  ← Layer semitrasparente opzionale
     */
    _createDOMStructure() {
      // Crea il wrapper principale
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'ytbg-wrapper';
      this.wrapper.setAttribute('aria-hidden', 'true'); // Accessibilità: nasconde ai screen reader

      // Contenitore specifico dove YouTube monterà l'iframe
      this.iframeContainer = document.createElement('div');
      this.iframeContainer.id = this.instanceId;

      this.wrapper.appendChild(this.iframeContainer);

      // Crea l'overlay se richiesto (opacità > 0)
      if (this.options.overlay > 0) {
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'ytbg-overlay';
        this.overlayEl.style.backgroundColor = `rgba(0, 0, 0, ${this.options.overlay})`;
        this.wrapper.appendChild(this.overlayEl);
      }

      // Inserisce il wrapper come PRIMO figlio del contenitore
      // così i contenuti esistenti rimangono sopra
      this.element.insertBefore(this.wrapper, this.element.firstChild);
    }

    /**
     * Crea il player YouTube tramite l'API ufficiale
     * Configura tutti i parametri del video
     */
    _createPlayer() {
      if (this.isDestroyed) return;

      const opts = this.options;

      // Parametri del player YouTube
      // Ref: https://developers.google.com/youtube/player_parameters
      const playerVars = {
        autoplay: opts.autoplay ? 1 : 0,
        mute: opts.mute ? 1 : 0,
        controls: opts.controls ? 1 : 0,
        loop: opts.loop ? 1 : 0,
        // Per il loop, YouTube richiede playlist con lo stesso videoId
        playlist: opts.loop ? opts.videoId : undefined,
        start: opts.start,
        // Nasconde il titolo e i controlli di YouTube
        showinfo: 0,
        rel: 0,           // Non mostrare video correlati alla fine
        modestbranding: 1, // Riduce il branding YouTube
        iv_load_policy: 3, // Nasconde le annotazioni
        disablekb: 1,      // Disabilita controlli da tastiera
        fs: 0,             // Disabilita il fullscreen button
        playsinline: 1,    // iOS: riproduzione inline (non fullscreen)
        enablejsapi: 1,    // Abilita controllo JS
        origin: window.location.origin || '*',
        // Widget size (sarà sovrascritta dal nostro CSS)
        widget_referrer: window.location.href
      };

      // Crea il player tramite YouTube IFrame API
      this.player = new window.YT.Player(this.instanceId, {
        videoId: opts.videoId,
        playerVars: playerVars,
        // Suggerimento qualità (non sempre rispettato da YouTube)
        suggestedQuality: opts.quality,

        events: {
          onReady: (event) => this._onPlayerReady(event),
          onStateChange: (event) => this._onPlayerStateChange(event),
          onError: (event) => this._onPlayerError(event)
        }
      });
    }

    /**
     * Callback: il player è pronto per la riproduzione
     * @param {Object} event - Evento YouTube API
     */
    _onPlayerReady(event) {
      if (this.isDestroyed) return;

      this.isReady = true;

      // Applica le impostazioni iniziali
      if (this.options.mute) {
        event.target.mute();
      }

      // Ottieni il riferimento all'iframe creato da YouTube
      const iframe = event.target.getIframe();
      if (iframe) {
        iframe.classList.add('ytbg-iframe');
        // Applica le dimensioni iniziali
        this._applyIframeDimensions(iframe);
      }

      // Avvia la riproduzione
      if (this.options.autoplay) {
        event.target.playVideo();
      }

      // Rimuovi classe loading, aggiungi ready
      this.element.classList.remove('ytbg-loading');
      this.element.classList.add('ytbg-ready');

      // Esegui il callback utente se definito
      if (typeof this.options.onReady === 'function') {
        this.options.onReady(event, this);
      }
    }

    /**
     * Callback: cambio di stato del player
     * Gestisce la logica di loop manuale quando il video finisce
     * @param {Object} event - Evento YouTube API con data (stato)
     */
    _onPlayerStateChange(event) {
      if (this.isDestroyed) return;

      const state = event.data;

      // YT.PlayerState.ENDED = 0
      // Se il loop è attivo e il video finisce, riavvia
      if (state === window.YT.PlayerState.ENDED && this.options.loop) {
        this.player.seekTo(this.options.start || 0);
        this.player.playVideo();
      }

      // Esegui il callback utente se definito
      if (typeof this.options.onStateChange === 'function') {
        this.options.onStateChange(event, this);
      }
    }

    /**
     * Callback: errore nel player YouTube
     * @param {Object} event - Evento di errore
     */
    _onPlayerError(event) {
      const errorCodes = {
        2: 'Parametro videoId non valido',
        5: 'Errore player HTML5',
        100: 'Video non trovato o rimosso',
        101: 'Il proprietario non consente la riproduzione embedded',
        150: 'Il proprietario non consente la riproduzione embedded'
      };

      const msg = errorCodes[event.data] || `Errore sconosciuto (codice: ${event.data})`;
      console.error(`[YTBackground] Errore player per videoId "${this.options.videoId}": ${msg}`);

      // Rimuovi classe loading in ogni caso
      this.element.classList.remove('ytbg-loading');
    }

    /**
     * Calcola e applica le dimensioni corrette all'iframe
     * Implementa l'effetto "object-fit: cover" matematicamente
     * @param {HTMLIFrameElement} [iframeEl] - L'iframe da ridimensionare
     */
    _applyIframeDimensions(iframeEl) {
      // Usa l'iframe passato o recuperalo dal player
      const iframe = iframeEl ||
        (this.player && typeof this.player.getIframe === 'function'
          ? this.player.getIframe()
          : null);

      if (!iframe) return;

      // Dimensioni correnti del contenitore
      const containerWidth = this.element.offsetWidth;
      const containerHeight = this.element.offsetHeight;

      // Ottimizzazione mobile: non ridimensionare se le dimensioni non sono cambiate
      // (previene flickering durante la comparsa/scomparsa della barra indirizzi)
      if (this._lastWidth === containerWidth && this._lastHeight === containerHeight) {
        return;
      }

      this._lastWidth = containerWidth;
      this._lastHeight = containerHeight;

      // Calcola le dimensioni per il cover
      const { width, height } = calculateCoverDimensions(containerWidth, containerHeight);

      // Applica le dimensioni all'iframe tramite stile inline
      // (ha priorità sulle classi CSS e garantisce la precisione)
      iframe.style.width = `${width}px`;
      iframe.style.height = `${height}px`;
    }

    // ============================================================
    // METODI PUBBLICI
    // ============================================================

    /**
     * Ricalcola le dimensioni dell'iframe (usato dall'event listener resize)
     * Metodo pubblico per permettere aggiornamenti manuali
     */
    resize() {
      if (this.isDestroyed || !this.isReady) return;
      this._applyIframeDimensions();
    }

    /**
     * Mette in pausa il video
     */
    pause() {
      if (this.player && typeof this.player.pauseVideo === 'function') {
        this.player.pauseVideo();
      }
    }

    /**
     * Riprende la riproduzione del video
     */
    play() {
      if (this.player && typeof this.player.playVideo === 'function') {
        this.player.playVideo();
      }
    }

    /**
     * Silenzia il video
     */
    mute() {
      if (this.player && typeof this.player.mute === 'function') {
        this.player.mute();
      }
    }

    /**
     * Riattiva l'audio del video
     */
    unmute() {
      if (this.player && typeof this.player.unMute === 'function') {
        this.player.unMute();
      }
    }

    /**
     * Cambia il video in riproduzione
     * @param {string} newVideoId - Il nuovo ID del video YouTube
     */
    changeVideo(newVideoId) {
      if (!newVideoId) return;

      this.options.videoId = newVideoId;

      if (this.player && typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({
          videoId: newVideoId,
          startSeconds: this.options.start || 0,
          suggestedQuality: this.options.quality
        });
      }
    }

    /**
     * Distrugge l'istanza: rimuove il DOM, gli event listener,
     * e deregistra dal registry globale
     */
    destroy() {
      this.isDestroyed = true;

      // Distruggi il player YouTube
      if (this.player && typeof this.player.destroy === 'function') {
        this.player.destroy();
      }

      // Rimuovi gli elementi DOM creati
      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
      }

      // Rimuovi le classi aggiunte al contenitore
      this.element.classList.remove('ytbg-parent', 'ytbg-loading', 'ytbg-ready');

      // Deregistra dal registry globale
      instanceRegistry.delete(this.instanceId);

      // Nullifica i riferimenti per liberare memoria
      this.player = null;
      this.wrapper = null;
      this.iframeContainer = null;
      this.overlayEl = null;
      this.element = null;
    }
  }

  // ============================================================
  // CLASSE PUBBLICA PRINCIPALE: YTBackground
  // ============================================================

  /**
   * Classe principale esposta pubblicamente
   * Gestisce l'inizializzazione singola o multipla (auto-init)
   */
  class YTBackground {
    /**
     * Crea un'istanza di video background su un elemento specifico
     *
     * @param {string|HTMLElement} selector - Selettore CSS o elemento DOM
     * @param {Object} options              - Opzioni di configurazione
     * @returns {YTBackgroundInstance|null}
     *
     * @example
     * const bg = new YTBackground('#hero', {
     *   videoId: 'dQw4w9WgXcQ',
     *   mute: true,
     *   loop: true
     * });
     */
    constructor(selector, options = {}) {
      // Inietta gli stili globali (una sola volta)
      injectGlobalStyles();

      // Configura il gestore dell'evento YouTube ready
      setupYouTubeReadyHandler();

      // Risolvi il selettore in un elemento DOM
      let element;
      if (typeof selector === 'string') {
        element = document.querySelector(selector);
        if (!element) {
          console.error(`[YTBackground] Nessun elemento trovato per il selettore: "${selector}"`);
          return null;
        }
      } else if (selector instanceof HTMLElement) {
        element = selector;
      } else {
        console.error('[YTBackground] Il primo argomento deve essere un selettore CSS o un HTMLElement.');
        return null;
      }

      // Crea e ritorna l'istanza
      return new YTBackgroundInstance(element, options);
    }

    // ============================================================
    // METODI STATICI
    // ============================================================

    /**
     * Auto-inizializza tutti gli elementi con il data-attribute [data-yt-bg-id]
     * Utile per l'inizializzazione dichiarativa da HTML
     *
     * @param {string} [scope='document'] - Selettore del contesto di ricerca
     * @returns {YTBackgroundInstance[]} - Array delle istanze create
     *
     * @example
     * // Inizializza tutto automaticamente
     * YTBackground.autoInit();
     */
    static autoInit(scope) {
      // Inietta gli stili globali
      injectGlobalStyles();

      // Configura il gestore dell'evento YouTube ready
      setupYouTubeReadyHandler();

      const context = scope
        ? (typeof scope === 'string' ? document.querySelector(scope) : scope)
        : document;

      if (!context) {
        console.error('[YTBackground] Contesto di auto-init non trovato.');
        return [];
      }

      // Trova tutti gli elementi con il data-attribute
      const elements = context.querySelectorAll(AUTO_INIT_SELECTOR);
      const instances = [];

      elements.forEach(element => {
        // Evita doppia inizializzazione
        if (element.dataset.ytbgInitialized === 'true') return;

        // Leggi le opzioni dai data-attributes
        const options = parseDataAttributes(element);

        if (!options.videoId) {
          console.warn('[YTBackground] data-yt-bg-id mancante su:', element);
          return;
        }

        // Crea l'istanza
        const instance = new YTBackgroundInstance(element, options);
        instances.push(instance);

        // Marca l'elemento come inizializzato
        element.dataset.ytbgInitialized = 'true';
      });

      // Avvia il caricamento dell'API YouTube (una sola volta per tutte)
      if (instances.length > 0) {
        loadYouTubeAPI();
      }

      return instances;
    }

    /**
     * Ritorna il registry di tutte le istanze attive
     * @returns {Map} - La mappa delle istanze
     */
    static getInstances() {
      return instanceRegistry;
    }

    /**
     * Distrugge tutte le istanze attive e fa pulizia
     */
    static destroyAll() {
      instanceRegistry.forEach(instance => {
        if (instance && typeof instance.destroy === 'function') {
          instance.destroy();
        }
      });
      instanceRegistry.clear();
    }

    /**
     * Versione della libreria
     */
    static get version() {
      return '1.0.0';
    }
  }

  // ============================================================
  // AUTO-INIT AL CARICAMENTO DEL DOM
  // ============================================================

  /**
   * Avvia l'auto-inizializzazione quando il DOM è pronto
   * Gestisce sia il caso in cui il DOM sia già caricato
   * che quello in cui lo script sia caricato in <head>
   */
  function domReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      // Il DOM è già pronto (script caricato in fondo al body o defer)
      fn();
    }
  }

  domReady(function () {
    // Controlla se l'auto-init è disabilitato globalmente
    const metaDisable = document.querySelector('meta[name="ytbg-no-auto-init"]');
    if (metaDisable) return;

    // Auto-inizializza tutti gli elementi dichiarativi presenti
    YTBackground.autoInit();
  });

  // Esponi la classe pubblica
  return YTBackground;

})); // Fine UMD