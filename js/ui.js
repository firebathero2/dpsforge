/**
 * DPS Forge - UI Management
 * 게임 화면 업데이트 및 사용자 인터랙션
 */

class GameUI {
  constructor() {
    this.refreshRate = GAME_CONSTANTS.TICK_INTERVAL * 1000;  // ms
    this.gameLoopId = null;
    this.autoBuyTiers = new Set();
    this.autoUpgradeTiers = new Set();
    this.autoSellTiers = new Set();
    this.autoBuyIntervalSec = 0.04;
    this.autoUpgradeIntervalSec = 0.04;
    this.autoSellIntervalSec = 0.04;
    this.autoBuyAccumulatorSecByTier = {};
    this.autoUpgradeAccumulatorSecByTier = {};
    this.autoSellAccumulatorSecByTier = {};
    this.activeTraitPreset = 1;
    this.traitPresets = {};
    this.debugLogLimit = 40;
    this.isDebugPanelOpen = false;
    this.wakeLockSentinel = null;
    this.wakeLockRequested = false;
    this.timeScale = 1;
    this.unitActionFxEnabled = true;
    this.availableTimeScales = [1, 2, 3];
    this.firstRebirthCompleted = false;
    this.secondRebirthCompleted = false;
    this.traitPresetNames = {
      1: '1',
      2: '2',
      3: '3',
      4: '4',
      5: '5'
    };
    this.tutorialFlow = [
      { id: 'welcome', mode: 'message', caption: '(가칭)DPSFORGE에 오신 것을 환영합니다.' },
      { id: 'overview', mode: 'message', caption: '이 게임은 높은 단수의 유닛을 뽑아 성장하는 방치형 게임입니다.' },
      { id: 'buff', mode: 'message', caption: '처음 1분간 초보자 버프로 골드가 자동 지급됩니다.' },
      {
        id: 'auto-buy',
        mode: 'action',
        caption: '자동 구매 버튼을 눌러보세요.',
        targetButtonId: 'auto-buy-tier-1-toggle',
        isCompleted: () => this.autoBuyTiers.has(1)
      },
      {
        id: 'deploy',
        mode: 'action',
        targetButtonId: 'deploy-tier-1',
        getCaption: () => {
          const currentPopulation = this.getTotalDeployedUnitCount();
          return `1단 이상 유닛을 10기 배치해보세요. (${currentPopulation}/10)`;
        },
        isCompleted: () => this.getTotalDeployedUnitCount() >= 10
      },
      {
        id: 'upgrade',
        mode: 'action',
        caption: '강화 버튼을 눌러 2단 유닛을 만들어보세요.',
        targetButtonId: 'upgrade-tier-1',
        isCompleted: () => this.hasTier2Unit()
      },
      {
        id: 'finish',
        mode: 'finish',
        caption: '이제 2단 유닛을 배치하며 게임을 진행하면 됩니다. 닫기를 눌러 시작하세요.'
      }
    ];
    this.midBossRun = null;
    this.isHardResetInProgress = false;
    this.hudNumericSnapshot = {
      gold: Number(gameEngine?.state?.gold) || 0,
      dps: Number(gameEngine?.state?.currentDPS) || 0
    };
    this.lastHudEffectAtMs = {
      gold: 0,
      dps: 0
    };
    this.hudEffectCooldownMs = {
      gold: 420,
      dps: 620
    };
    this.upgradeFxLastAtMsByTier = {};
    this.upgradeFxCooldownMs = {
      success: 520,
      fail: 640
    };
    this.huntStageSignature = '';
    this.huntStageActorRuntimeById = {};
    this.huntStageMotionById = {};
    this.huntStageLastMotionAtMs = 0;
    for (const tier of this.getAutoBuyTargetTiers()) {
      this.autoBuyAccumulatorSecByTier[tier] = 0;
    }
    for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
      this.autoUpgradeAccumulatorSecByTier[tier] = 0;
    }
    for (let tier = GAME_CONSTANTS.MIN_SELL_TIER; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      this.autoSellAccumulatorSecByTier[tier] = 0;
    }
  }
  
  /**
   * UI 초기화
   */
  init() {
    this.initializeTierTables();
    this.bindEvents();
    this.bindLayoutNavigation();
    this.startGameLoop();
    this.handleGameRestore();
    this.loadAutomationState();
    this.loadTraitPresetState();
    this.initWakeLockSettings();
    this.initTimeScaleSettings();
    this.initUnitActionFxSettings();
    this.initDebugPanel();
    this.initTutorialGuide();
  }
  
  /**
   * 게임 루프 시작
   */
  startGameLoop() {
    this.gameLoopId = setInterval(() => {
      const realDelta = GAME_CONSTANTS.TICK_INTERVAL;
      const scaledDelta = GAME_CONSTANTS.TICK_INTERVAL * this.timeScale;
      gameEngine.tick(scaledDelta, realDelta);
      this.runAutomation(scaledDelta);
      this.updateUI();
    }, this.refreshRate);
  }
  
  /**
   * 게임 루프 중지
   */
  stopGameLoop() {
    if (this.gameLoopId) {
      clearInterval(this.gameLoopId);
    }
  }
  
  /**
   * UI 전체 업데이트
   */
  updateUI() {
    this.updateResourceDisplay();
    this.updateInventoryDisplay();
    this.updateDeployedDisplay();
    this.updateMidBossPanel();
    this.updateRebirthPanel();
    this.updateEmergencyRecoveryPanel();
    this.updateAutomationButtons();
    this.updateTraitPresetButtons();
    this.updateTraitCostLabels();
    this.updatePurchasePriceTooltip();
    this.updateTutorialGuide();
  }

  /**
   * 특성 프리셋 버튼 표시 업데이트
   */
  updateTraitPresetButtons() {
    const presetButtons = document.querySelectorAll('[data-trait-preset]');
    if (!presetButtons || presetButtons.length < 1) {
      return;
    }

    presetButtons.forEach((button) => {
      const presetId = Number.parseInt(button.dataset.traitPreset, 10);
      const presetName = this.traitPresetNames[presetId] || String(presetId);
      const isActive = presetId === this.activeTraitPreset;
      button.textContent = presetName;
      button.classList.toggle('btn-toggle-on', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.setAttribute('title', `프리셋 ${presetId}: ${presetName}`);
    });
  }

  /**
   * 특성 레벨 문자열 포맷
   */
  formatTraitLevel(traitType, currentLevel) {
    const maxLevel = GAME_CONSTANTS.TRAIT_SYSTEMS?.[traitType]?.maxLevel;
    if (!Number.isFinite(maxLevel)) {
      return `${currentLevel}Lv`;
    }
    return `${currentLevel}/${maxLevel}Lv`;
  }

  /**
   * 초 단위 시간을 HH:MM:SS로 포맷
   */
  formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * 확률 문자열 포맷
   */
  formatProbabilityLabel(probability) {
    const normalized = Math.max(0, Number(probability) || 0) * 100;
    return `${normalized.toFixed(2)}%`;
  }

  /**
   * 1000 단위 축약 접미사 (A, B, C... / Z 다음 AA)
   */
  getAbcSuffix(thousandIndex) {
    let index = Math.max(1, Math.floor(Number(thousandIndex) || 1));
    let suffix = '';

    while (index > 0) {
      index -= 1;
      suffix = String.fromCharCode(65 + (index % 26)) + suffix;
      index = Math.floor(index / 26);
    }

    return suffix;
  }

  trimNumericText(text) {
    return String(text)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?[1-9])0+$/, '$1');
  }

  /**
   * 숫자 축약 포맷
   * 예: 1200 -> 1.2A, 1500000 -> 1.5B
   */
  formatAbcNumber(value, options = {}) {
    const {
      decimals = 2,
      smallAsInteger = true
    } = options;

    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '0';
    }

    const abs = Math.abs(num);
    if (abs < 1000) {
      if (smallAsInteger) {
        return String(Math.floor(num));
      }
      return this.trimNumericText(num.toFixed(decimals));
    }

    let thousandIndex = Math.floor(Math.log10(abs) / 3);
    let scaled = num / (1000 ** thousandIndex);
    let roundedScaled = Number(scaled.toFixed(decimals));

    if (Math.abs(roundedScaled) >= 1000) {
      thousandIndex += 1;
      scaled = num / (1000 ** thousandIndex);
      roundedScaled = Number(scaled.toFixed(decimals));
    }

    const numberText = this.trimNumericText(roundedScaled.toFixed(decimals));
    return `${numberText}${this.getAbcSuffix(thousandIndex)}`;
  }

  getTutorialState() {
    const state = gameEngine?.state?.tutorial;
    return state && typeof state === 'object' ? state : null;
  }

  getTotalDeployedUnitCount() {
    const deployed = gameEngine?.state?.deployed;
    if (!deployed || typeof deployed !== 'object') {
      return 0;
    }

    return Object.values(deployed).reduce((total, amount) => {
      return total + Math.max(0, Math.floor(Number(amount) || 0));
    }, 0);
  }

  getCurrentTutorialNode() {
    const tutorialState = this.getTutorialState();
    if (!tutorialState || !tutorialState.enabled || tutorialState.completed) {
      return null;
    }

    const stepIndex = Math.max(0, Math.floor(Number(tutorialState.step) || 0));
    return this.tutorialFlow[stepIndex] || null;
  }

  isTutorialActive() {
    return this.getCurrentTutorialNode() !== null;
  }

  setTutorialOverlayVisible(isVisible) {
    const overlayEl = document.getElementById('tutorial-overlay');
    if (!overlayEl) {
      return null;
    }

    overlayEl.hidden = !isVisible;
    overlayEl.style.display = isVisible ? 'flex' : 'none';
    return overlayEl;
  }

  initTutorialGuide() {
    if (!this.isTutorialActive()) {
      this.clearTutorialHighlights();
      this.setTutorialOverlayVisible(false);
      return;
    }

    this.activatePanel('management-panel');
    this.activatePanelTab('management', 'units-tab');
    this.updateTutorialGuide();
  }

  updateTutorialGuide() {
    const overlayEl = this.setTutorialOverlayVisible(false);
    const captionEl = document.getElementById('tutorial-caption');
    const progressEl = document.getElementById('tutorial-progress');
    const nextBtn = document.getElementById('tutorial-primary-btn');

    if (!overlayEl || !captionEl || !nextBtn || !progressEl) {
      return;
    }

    const step = this.getCurrentTutorialNode();
    if (!step) {
      this.setTutorialOverlayVisible(false);
      return;
    }

    if (step.mode === 'action' && typeof step.isCompleted === 'function' && step.isCompleted()) {
      this.advanceTutorialStep();
      return;
    }

    this.setTutorialOverlayVisible(true);
    const captionText = typeof step.getCaption === 'function' ? step.getCaption() : step.caption;
    captionEl.textContent = captionText;
    const stepNumber = Math.max(1, (this.tutorialFlow.indexOf(step) + 1));
    progressEl.textContent = `${stepNumber}/${this.tutorialFlow.length}`;

    if (step.mode === 'message') {
      nextBtn.hidden = false;
      nextBtn.textContent = '다음';
    } else if (step.mode === 'finish') {
      nextBtn.hidden = false;
      nextBtn.textContent = '닫기';
    } else {
      nextBtn.hidden = true;
      nextBtn.textContent = '다음';
    }

    this.clearTutorialHighlights();
    if (step.targetButtonId) {
      this.activatePanel('management-panel');
      this.activatePanelTab('management', 'units-tab');
      const targetBtn = document.getElementById(step.targetButtonId);
      if (targetBtn) {
        targetBtn.classList.add('tutorial-highlight');
      }
    }
  }

  clearTutorialHighlights() {
    document.querySelectorAll('.tutorial-highlight').forEach((node) => {
      node.classList.remove('tutorial-highlight');
    });
  }

  advanceTutorialStep() {
    const tutorialState = this.getTutorialState();
    if (!tutorialState || tutorialState.completed) {
      return;
    }

    const nextStep = (Math.max(0, Math.floor(Number(tutorialState.step) || 0)) + 1);
    if (nextStep >= this.tutorialFlow.length) {
      tutorialState.step = this.tutorialFlow.length;
      tutorialState.completed = true;
      tutorialState.enabled = false;
      this.clearTutorialHighlights();
    } else {
      tutorialState.step = nextStep;
    }

    this.updateTutorialGuide();
  }

  closeTutorial() {
    this.logTutorialDebug('closeTutorial:before');
    const tutorialState = this.getTutorialState();
    if (tutorialState) {
      tutorialState.enabled = false;
      tutorialState.completed = true;
      tutorialState.step = Math.max(this.tutorialFlow.length, Number(tutorialState.step) || 0);
    }

    this.clearTutorialHighlights();
    this.setTutorialOverlayVisible(false);
    this.logTutorialDebug('closeTutorial:after');
  }

  onTutorialPrimaryAction(source = 'click') {
    this.appendDebugLog(`primary-action(${source})`);
    const step = this.getCurrentTutorialNode();
    if (!step) {
      return;
    }

    if (step.mode === 'message') {
      this.advanceTutorialStep();
      return;
    }

    if (step.mode === 'finish') {
      this.closeTutorial();
    }
  }

  hasTier2Unit() {
    const state = gameEngine.getState();
    return ((state.inventory?.[2] || 0) + (state.deployed?.[2] || 0)) > 0;
  }

  initDebugPanel() {
    const panelEl = document.getElementById('debug-panel');
    const openBtn = document.getElementById('debug-toggle-open-btn');
    const closeBtn = document.getElementById('debug-toggle-close-btn');
    const clearBtn = document.getElementById('debug-clear-btn');

    const setPanelVisible = (isVisible) => {
      this.isDebugPanelOpen = !!isVisible;
      if (panelEl) {
        panelEl.hidden = !this.isDebugPanelOpen;
      }
      if (openBtn) {
        openBtn.hidden = this.isDebugPanelOpen;
      }
    };

    setPanelVisible(false);

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        setPanelVisible(true);
        this.appendDebugLog('debug panel opened');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.appendDebugLog('debug panel closed');
        setPanelVisible(false);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const logEl = document.getElementById('debug-log');
        if (logEl) {
          logEl.textContent = '';
        }
        this.appendDebugLog('debug log cleared');
      });
    }

    this.logTutorialDebug('debug-panel:ready');
  }

  isWakeLockSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  updateWakeLockUi(message = null) {
    const statusEl = document.getElementById('wake-lock-status');
    const toggleBtn = document.getElementById('wake-lock-toggle-btn');
    if (!statusEl || !toggleBtn) {
      return;
    }

    if (!this.isWakeLockSupported()) {
      statusEl.textContent = '이 브라우저는 화면 유지 기능을 지원하지 않음';
      toggleBtn.textContent = '지원 안 됨';
      toggleBtn.disabled = true;
      return;
    }

    if (message) {
      statusEl.textContent = message;
    } else if (this.wakeLockSentinel) {
      statusEl.textContent = '화면 유지 켜짐';
    } else if (this.wakeLockRequested) {
      statusEl.textContent = '요청됨 (화면 복귀 시 재적용)';
    } else {
      statusEl.textContent = '화면 유지 꺼짐';
    }

    toggleBtn.textContent = this.wakeLockRequested ? '화면 유지 끄기' : '화면 유지 켜기';
    toggleBtn.disabled = false;
  }

  async requestWakeLock() {
    if (!this.isWakeLockSupported()) {
      this.updateWakeLockUi();
      return false;
    }

    try {
      this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      this.wakeLockSentinel.addEventListener('release', () => {
        this.wakeLockSentinel = null;
        this.updateWakeLockUi();
      });
      this.updateWakeLockUi('화면 유지 켜짐');
      return true;
    } catch (error) {
      this.wakeLockSentinel = null;
      this.updateWakeLockUi('화면 유지 요청 실패 (권한/절전 모드 확인)');
      return false;
    }
  }

  async releaseWakeLock() {
    if (this.wakeLockSentinel) {
      await this.wakeLockSentinel.release();
      this.wakeLockSentinel = null;
    }
    this.updateWakeLockUi('화면 유지 꺼짐');
  }

  async onToggleWakeLock() {
    if (!this.wakeLockRequested) {
      this.wakeLockRequested = true;
      const acquired = await this.requestWakeLock();
      if (!acquired) {
        this.wakeLockRequested = false;
        this.updateWakeLockUi();
      }
      return;
    }

    this.wakeLockRequested = false;
    await this.releaseWakeLock();
  }

  initWakeLockSettings() {
    const toggleBtn = document.getElementById('wake-lock-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.onToggleWakeLock();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wakeLockRequested && !this.wakeLockSentinel) {
        this.requestWakeLock();
      }
    });

    this.updateWakeLockUi();
  }

  formatTimeScaleLabel(scale) {
    const numeric = Number(scale);
    if (!Number.isFinite(numeric)) {
      return '1.0x';
    }
    return `${numeric.toFixed(1)}x`;
  }

  isTimeScaleUnlocked(scale) {
    const numeric = Number(scale);
    if (Math.abs(numeric - 1) < 0.001) {
      return true;
    }
    if (Math.abs(numeric - 2) < 0.001) {
      return this.firstRebirthCompleted;
    }
    if (Math.abs(numeric - 3) < 0.001) {
      return this.secondRebirthCompleted;
    }
    return false;
  }

  updateTimeScaleUi() {
    if (!this.isTimeScaleUnlocked(this.timeScale)) {
      this.timeScale = 1;
    }

    const statusEl = document.getElementById('time-scale-status');
    if (statusEl) {
      statusEl.textContent = this.formatTimeScaleLabel(this.timeScale);
    }

    document.querySelectorAll('.time-scale-btn').forEach((button) => {
      const value = Number(button.dataset.timeScale);
      const isUnlocked = this.isTimeScaleUnlocked(value);
      const isActive = Math.abs(value - this.timeScale) < 0.001;
      button.classList.toggle('btn-toggle-on', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.disabled = !isUnlocked;
      if (!isUnlocked && Math.abs(value - 2) < 0.001) {
        button.title = '1차 환생 보상으로 해금됩니다.';
      } else if (!isUnlocked && Math.abs(value - 3) < 0.001) {
        button.title = '2차 환생 보상으로 해금됩니다.';
      } else {
        button.title = '';
      }
    });
  }

  setTimeScale(scale) {
    const parsed = Number(scale);
    if (!this.availableTimeScales.includes(parsed)) {
      return;
    }

    if (!this.isTimeScaleUnlocked(parsed)) {
      return;
    }

    this.timeScale = parsed;
    this.updateTimeScaleUi();
    this.saveAutomationState();
  }

  initTimeScaleSettings() {
    document.querySelectorAll('.time-scale-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.setTimeScale(button.dataset.timeScale);
      });
    });

    this.updateTimeScaleUi();
  }

  canPerformFirstRebirth(state) {
    const level = Math.max(1, Math.floor(Number(state?.characterLevel) || 1));
    return level >= 2;
  }

  canPerformSecondRebirth(state) {
    const level = Math.max(1, Math.floor(Number(state?.characterLevel) || 1));
    const inventoryCount = Math.max(0, Math.floor(Number(state?.inventory?.[20]) || 0));
    const deployedCount = Math.max(0, Math.floor(Number(state?.deployed?.[20]) || 0));
    return level >= 10 && (inventoryCount + deployedCount) > 0;
  }

  updateRebirthActionButtons(state = null) {
    const currentState = state || gameEngine.getState();
    const firstBtn = document.getElementById('rebirth-first-button');
    const secondBtn = document.getElementById('rebirth-second-button');

    if (firstBtn) {
      firstBtn.title = '조건 : 2레벨 달성\n보상 : 2배속 해금';
      if (this.firstRebirthCompleted) {
        firstBtn.hidden = true;
      } else {
        firstBtn.hidden = false;
        firstBtn.disabled = !this.canPerformFirstRebirth(currentState);
      }
    }

    if (secondBtn) {
      secondBtn.title = '조건 : 20단 보유, 10레벨 달성\n보상 : 3배속 해금';
      if (this.secondRebirthCompleted) {
        secondBtn.hidden = true;
      } else {
        secondBtn.hidden = false;
        secondBtn.disabled = !this.canPerformSecondRebirth(currentState);
        secondBtn.textContent = '2차 환생';
      }
    }
  }

  onPerformFirstRebirthUnlock() {
    const state = gameEngine.getState();
    if (this.firstRebirthCompleted) {
      return;
    }

    if (!this.canPerformFirstRebirth(state)) {
      alert('조건을 만족하지 않습니다. (조건 : 2레벨 달성)');
      return;
    }

    const confirmed = confirm('1차 환생을 진행하면 현재 런 진행값이 초기화됩니다.\n계속하시겠습니까?');
    if (!confirmed) {
      return;
    }

    this.firstRebirthCompleted = true;
    this.resetAllAutomationState();
    const result = gameEngine.performMilestoneRebirth();
    if (!result.success) {
      this.firstRebirthCompleted = false;
      alert(result.message || '1차 환생 처리 중 오류가 발생했습니다.');
      return;
    }

    this.midBossRun = null;
    this.updateTimeScaleUi();
    this.updateRebirthActionButtons();
    this.saveAutomationState();
    this.updateUI();
    alert('1차 환생 완료! 보상으로 2배속이 해금되었습니다.');
  }

  onPerformSecondRebirthUnlock() {
    const state = gameEngine.getState();
    if (this.secondRebirthCompleted) {
      return;
    }

    if (!this.canPerformSecondRebirth(state)) {
      alert('조건을 만족하지 않습니다. (조건 : 20단 보유, 10레벨 달성)');
      return;
    }

    const confirmed = confirm('2차 환생을 진행하면 현재 런 진행값이 초기화됩니다.\n계속하시겠습니까?');
    if (!confirmed) {
      return;
    }

    this.secondRebirthCompleted = true;
    this.resetAllAutomationState();
    const result = gameEngine.performMilestoneRebirth();
    if (!result.success) {
      this.secondRebirthCompleted = false;
      alert(result.message || '2차 환생 처리 중 오류가 발생했습니다.');
      return;
    }

    this.midBossRun = null;
    this.updateTimeScaleUi();
    this.updateRebirthActionButtons();
    this.saveAutomationState();
    this.updateUI();
    alert('2차 환생 완료! 보상으로 3배속이 해금되었습니다.');
  }

  updateUnitActionFxUi() {
    const statusEl = document.getElementById('unit-action-fx-status');
    if (statusEl) {
      statusEl.textContent = this.unitActionFxEnabled ? '켜짐' : '꺼짐';
    }

    const toggleBtn = document.getElementById('unit-action-fx-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = this.unitActionFxEnabled ? '관리 이펙트 끄기' : '관리 이펙트 켜기';
      toggleBtn.setAttribute('aria-pressed', this.unitActionFxEnabled ? 'true' : 'false');
    }
  }

  onToggleUnitActionFx() {
    this.unitActionFxEnabled = !this.unitActionFxEnabled;
    this.updateUnitActionFxUi();
    this.saveAutomationState();
  }

  initUnitActionFxSettings() {
    const toggleBtn = document.getElementById('unit-action-fx-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.onToggleUnitActionFx();
      });
    }

    this.updateUnitActionFxUi();
  }

  appendDebugLog(message) {
    const logEl = document.getElementById('debug-log');
    if (!logEl) {
      return;
    }

    const stamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const entry = document.createElement('p');
    entry.className = 'debug-log-entry';
    entry.textContent = `[${stamp}] ${message}`;
    logEl.appendChild(entry);

    while (logEl.childElementCount > this.debugLogLimit) {
      logEl.removeChild(logEl.firstElementChild);
    }

    logEl.scrollTop = logEl.scrollHeight;
  }

  logTutorialDebug(prefix = 'tutorial') {
    const stateEl = document.getElementById('debug-state');
    const tutorialState = this.getTutorialState();

    if (!tutorialState) {
      if (stateEl) {
        stateEl.textContent = '상태: tutorial state 없음';
      }
      this.appendDebugLog(`${prefix} | tutorial state missing`);
      return;
    }

    const enabled = tutorialState.enabled ? '1' : '0';
    const completed = tutorialState.completed ? '1' : '0';
    const step = Math.max(0, Math.floor(Number(tutorialState.step) || 0));
    const buffActive = tutorialState.beginnerBuffActive ? '1' : '0';
    const elapsed = Math.max(0, Number(tutorialState.beginnerBuffElapsedSec) || 0).toFixed(1);
    const duration = Math.max(0, Number(tutorialState.beginnerBuffDurationSec) || 0).toFixed(1);
    const stateText = `tutorial enabled=${enabled} completed=${completed} step=${step} buff=${buffActive} ${elapsed}/${duration}`;

    if (stateEl) {
      stateEl.textContent = `상태: ${stateText}`;
    }

    this.appendDebugLog(`${prefix} | ${stateText}`);
  }

  getAutoBuyTargetTiers() {
    const highTierTargets = Object.keys(GAME_CONSTANTS.HIGH_TIER_PURCHASE_PRICES || {})
      .map((tier) => Number.parseInt(tier, 10))
      .filter((tier) => Number.isFinite(tier));

    return [1, ...highTierTargets]
      .filter((tier, index, list) => tier >= 1 && tier <= GAME_CONSTANTS.MAX_TIER && list.indexOf(tier) === index)
      .sort((a, b) => a - b);
  }

  /**
   * 강화확률 상세 계산(+1/+2/+3/실패)
   */
  getUpgradeProbabilityDetail(tier, state) {
    const normalizedTier = Math.max(1, Math.floor(Number(tier) || 1));
    const baseRate = Math.max(0, Number(GAME_CONSTANTS.UPGRADE_PROBABILITY[normalizedTier]) || 0);

    const traitBonusEnabled = normalizedTier <= 39;
    const plus1TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        state?.traitLevels?.enhanceProbabilityPlus1Upgrade,
        normalizedTier
      )
      : 0;
    const plus2TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        state?.traitLevels?.enhanceProbabilityPlus2Upgrade,
        normalizedTier
      )
      : 0;
    const plus3TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        state?.traitLevels?.enhanceProbabilityPlus3Upgrade,
        normalizedTier
      )
      : 0;
    const breakthroughLevel = Math.max(0, Math.floor(state?.rebirth?.rewards?.breakthroughMemory || 0));
    const bestTierReached = Math.max(1, Math.floor(state?.rebirth?.bestTierReached || 1));
    const breakthroughBonus = normalizedTier <= bestTierReached
      ? breakthroughLevel * 0.02
      : 0;

    const capRate = Math.max(0, Number(GAME_CONSTANTS.getEnhanceProbabilityCap(normalizedTier)) || 0);
    const basePrimaryRate = Math.max(0, Math.min(Math.min(baseRate, capRate), 1 / 1.11));
    const rawBasePlus2Rate = basePrimaryRate * 0.1;
    const rawBasePlus3Rate = basePrimaryRate * 0.01;

    let basePlus1Rate = basePrimaryRate;
    let basePlus2Rate = rawBasePlus2Rate;
    let basePlus3Rate = rawBasePlus3Rate;

    let rawPlus1Rate = Math.max(0, basePlus1Rate + plus1TraitBonus + breakthroughBonus);
    let rawPlus2Rate = Math.max(0, basePlus2Rate + plus2TraitBonus);
    let rawPlus3Rate = Math.max(0, basePlus3Rate + plus3TraitBonus);

    // 35단: +3강 확률은 +1강으로 편입
    if (normalizedTier === 35) {
      basePlus1Rate += basePlus3Rate;
      basePlus3Rate = 0;
      rawPlus1Rate += rawPlus3Rate;
      rawPlus3Rate = 0;
    }

    // 36단 이상: +2/+3강 확률은 모두 +1강으로 편입
    if (normalizedTier >= 36) {
      basePlus1Rate += basePlus2Rate + basePlus3Rate;
      basePlus2Rate = 0;
      basePlus3Rate = 0;
      rawPlus1Rate += rawPlus2Rate + rawPlus3Rate;
      rawPlus2Rate = 0;
      rawPlus3Rate = 0;
    }

    const rawTotal = rawPlus1Rate + rawPlus2Rate + rawPlus3Rate;
    const cappedTotal = Math.min(capRate, 1);
    const capScale = rawTotal > cappedTotal && rawTotal > 0
      ? (cappedTotal / rawTotal)
      : 1;

    const plus1Rate = rawPlus1Rate * capScale;
    const plus2Rate = rawPlus2Rate * capScale;
    const plus3Rate = rawPlus3Rate * capScale;
    const effectiveRate = plus1Rate + plus2Rate + plus3Rate;
    const failRate = Math.max(0, 1 - effectiveRate);

    return {
      baseRate,
      effectiveRate,
      basePlus1Rate,
      basePlus2Rate,
      basePlus3Rate,
      plus1Rate,
      plus2Rate,
      plus3Rate,
      failRate,
      capRate,
      isCapped: rawTotal > cappedTotal
    };
  }

  /**
   * 1~최대단 테이블 동적 구성
   */
  initializeTierTables() {
    const inventoryTbody = document.querySelector('#inventory-container .unit-table tbody');
    const deployedTbody = document.querySelector('#deployed-container .unit-table tbody');
    if (!inventoryTbody || !deployedTbody) {
      return;
    }

    const inventoryRows = [];
    const deployedRows = [];
    const autoBuyTargets = new Set(this.getAutoBuyTargetTiers());

    for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const spec = GAME_CONSTANTS.UNIT_SPECS[tier] || { attackPower: 0, attackSpeed: 0 };
      const dps = GAME_CONSTANTS.getDPS(tier);
      const probabilityCell = tier < GAME_CONSTANTS.MAX_TIER
        ? `<td id="upgrade-probability-tier-${tier}" class="upgrade-probability-cell">${this.formatProbabilityLabel(GAME_CONSTANTS.UPGRADE_PROBABILITY[tier])}</td>`
        : '<td>-</td>';

      const buyCell = autoBuyTargets.has(tier)
        ? `<button class="btn-sm" id="auto-buy-tier-${tier}-toggle">자동구매 OFF</button>`
        : '-';

      const upgradeCell = tier < GAME_CONSTANTS.MAX_TIER
        ? `<button class="btn-sm" id="upgrade-tier-${tier}">강화</button>`
        : '-';

      let sellCell = '-';
      if (tier >= GAME_CONSTANTS.MIN_SELL_TIER) {
        const sellExp = GAME_CONSTANTS.getSellExpByTier(tier);
        const firstRebirthAction = tier === 15
          ? '<button type="button" class="btn-sm btn-rebirth-action" id="rebirth-first-button" title="조건 : 2레벨 달성&#10;보상 : 2배속 해금">1차 환생</button>'
          : '';
        const secondRebirthAction = tier === 20
          ? '<button type="button" class="btn-sm btn-rebirth-action" id="rebirth-second-button" title="조건 : 20단 보유, 10레벨 달성&#10;보상 : 3배속 해금">2차 환생</button>'
          : '';
        sellCell = `
          <div class="sell-actions">
            <button type="button" class="btn-sm btn-sell" id="sell-tier-${tier}">판매(+${sellExp}EXP)</button>
            <button type="button" class="btn-sm btn-auto-sell" id="auto-sell-tier-${tier}">자동판매 OFF</button>
            ${firstRebirthAction}
            ${secondRebirthAction}
          </div>
        `;
      }

      inventoryRows.push(`
        <tr>
          <td>${tier}단</td>
          <td>${this.formatAbcNumber(dps)}</td>
          <td id="inventory-tier-${tier}-count">0</td>
          <td>${buyCell}</td>
          <td><button class="btn-sm" id="deploy-tier-${tier}">배치</button></td>
          ${probabilityCell}
          <td>${upgradeCell}</td>
          <td>${sellCell}</td>
        </tr>
      `);

      deployedRows.push(`
        <tr>
          <td>${tier}단</td>
          <td>${spec.attackPower}</td>
          <td>${spec.attackSpeed.toFixed(2)}회/초</td>
          <td>${this.formatAbcNumber(dps)}</td>
          <td id="deployed-tier-${tier}">0</td>
          <td id="deployed-dps-${tier}">-</td>
          <td><button class="btn-sm" id="retrieve-tier-${tier}">회수</button></td>
        </tr>
      `);
    }

    inventoryTbody.innerHTML = inventoryRows.join('');
    deployedTbody.innerHTML = deployedRows.join('');
    this.updateRebirthActionButtons();
  }

  /**
   * 특성 비용 라벨을 상수와 동기화
   */
  updateTraitCostLabels() {
    const costBindings = [
      { elementId: 'trait-attack-cost', traitType: 'attackPowerUpgrade' },
      { elementId: 'trait-enhance-plus1-cost', traitType: 'enhanceProbabilityPlus1Upgrade' },
      { elementId: 'trait-enhance-plus2-cost', traitType: 'enhanceProbabilityPlus2Upgrade' },
      { elementId: 'trait-enhance-plus3-cost', traitType: 'enhanceProbabilityPlus3Upgrade' },
      { elementId: 'trait-slot-cost', traitType: 'slotCapacityUpgrade' },
      { elementId: 'trait-automation-speed-cost', traitType: 'automationSpeedUpgrade' }
    ];

    for (const binding of costBindings) {
      const cost = GAME_CONSTANTS.TRAIT_SYSTEMS?.[binding.traitType]?.cost;
      const costEl = document.getElementById(binding.elementId);
      if (costEl && Number.isFinite(cost)) {
        costEl.textContent = `비용: ${cost}P`;
      }
    }
  }

  /**
   * 구매 헤더 툴팁 가격 라벨을 상수와 동기화
   */
  updatePurchasePriceTooltip() {
    const tooltipTriggerEl = document.getElementById('purchase-price-tooltip');
    const tooltipTextEl = document.getElementById('purchase-price-tooltip-text');
    if (!tooltipTriggerEl || !tooltipTextEl) {
      return;
    }

    const labels = this.getAutoBuyTargetTiers().map((tier) => {
      const price = tier === 1
        ? GAME_CONSTANTS.UNIT_COST
        : GAME_CONSTANTS.HIGH_TIER_PURCHASE_PRICES?.[tier];
      return `${tier}단 ${this.formatAbcNumber(price || 0)}`;
    });

    const tooltipText = `가격표\n${labels.join('\n')}`;
    tooltipTextEl.textContent = tooltipText;
    tooltipTriggerEl.setAttribute('aria-label', `구매 가격 안내 가격표: ${labels.join(', ')}`);
  }

  /**
   * 자동화 토글 버튼 표시 업데이트
   */
  updateAutomationButtons() {
    for (const tier of this.getAutoBuyTargetTiers()) {
      const autoBuyBtn = document.getElementById(`auto-buy-tier-${tier}-toggle`);
      if (!autoBuyBtn) {
        continue;
      }
      const isOn = this.autoBuyTiers.has(tier);
      autoBuyBtn.textContent = isOn ? '자동구매 ON' : '자동구매 OFF';
      autoBuyBtn.classList.toggle('btn-toggle-on', isOn);
    }

    for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
      const upgradeBtn = document.getElementById(`upgrade-tier-${tier}`);
      if (!upgradeBtn) {
        continue;
      }

      const isOn = this.autoUpgradeTiers.has(tier);
      upgradeBtn.textContent = isOn ? '자동강화 ON' : '강화';
      upgradeBtn.classList.toggle('btn-toggle-on', isOn);
    }

    for (let tier = GAME_CONSTANTS.MIN_SELL_TIER; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const sellBtn = document.getElementById(`auto-sell-tier-${tier}`);
      if (!sellBtn) {
        continue;
      }

      const isOn = this.autoSellTiers.has(tier);
      sellBtn.textContent = isOn ? '자동판매 ON' : '판매';
      sellBtn.classList.toggle('btn-toggle-on', isOn);
    }
  }

  /**
   * 자동화 실행
   */
  runAutomation(deltaTimeSec) {
    this.syncAutomationIntervals();

    if (this.autoBuyTiers.size > 0) {
      this.runAutoBuyTiers(deltaTimeSec);
    }

    if (this.autoUpgradeTiers.size > 0) {
      this.runAutoUpgrade(deltaTimeSec);
    }

    if (this.autoSellTiers.size > 0) {
      this.runAutoSell(deltaTimeSec);
    }
  }

  /**
   * 특성 레벨에 따라 자동화 간격 동기화
   */
  syncAutomationIntervals() {
    const traitLevels = gameEngine.state.traitLevels || {};
    const automationStartPassLevel = Math.max(0, Math.floor(gameEngine.state.rebirth?.rewards?.automationStartPass || 0));
    const automationRate = GAME_CONSTANTS.getAutomationActionsPerSecond(traitLevels.automationSpeedUpgrade || 0)
      + (automationStartPassLevel * 10);

    this.autoBuyIntervalSec = 1 / automationRate;
    this.autoUpgradeIntervalSec = 1 / automationRate;
    this.autoSellIntervalSec = 1 / automationRate;
  }

  /**
   * 자동 구매: 활성화된 단수를 각각 독립 주기로 구매
   */
  runAutoBuyTiers(deltaTimeSec) {
    for (const tier of this.autoBuyTiers) {
      if (!this.autoBuyAccumulatorSecByTier[tier]) {
        this.autoBuyAccumulatorSecByTier[tier] = 0;
      }

      this.autoBuyAccumulatorSecByTier[tier] += deltaTimeSec;
      while (this.autoBuyAccumulatorSecByTier[tier] >= this.autoBuyIntervalSec) {
        this.autoBuyAccumulatorSecByTier[tier] -= this.autoBuyIntervalSec;

        const purchased = tier === 1
          ? gameEngine.buyUnit(1, 1)
          : gameEngine.buyHighTierUnit(tier, 1).success;

        if (!purchased) {
          this.autoBuyAccumulatorSecByTier[tier] = Math.min(
            this.autoBuyAccumulatorSecByTier[tier],
            this.autoBuyIntervalSec
          );
          break;
        }
      }
    }
  }

  /**
   * 자동 강화: 높은 단계부터 우선 강화
   */
  runAutoUpgrade(deltaTimeSec) {
    if ((gameEngine.getState().deployedCount || 0) < 1) {
      if (this.autoUpgradeTiers.size > 0) {
        this.autoUpgradeTiers.clear();
        this.saveAutomationState();
        this.updateAutomationButtons();
      }
      for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
        this.autoUpgradeAccumulatorSecByTier[tier] = 0;
      }
      return;
    }

    for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
      if (!this.autoUpgradeTiers.has(tier)) {
        continue;
      }

      // 같은 단수에 자동판매가 켜져 있으면 강화는 잠시 중지
      if (this.autoSellTiers.has(tier)) {
        this.autoUpgradeAccumulatorSecByTier[tier] = 0;
        continue;
      }

      this.autoUpgradeAccumulatorSecByTier[tier] += deltaTimeSec;

      while (this.autoUpgradeAccumulatorSecByTier[tier] >= this.autoUpgradeIntervalSec) {
        this.autoUpgradeAccumulatorSecByTier[tier] -= this.autoUpgradeIntervalSec;

        if ((gameEngine.state.inventory[tier] || 0) < 1) {
          break;
        }

        const result = gameEngine.attemptUpgrade(tier);
        this.emitUpgradeResultFx(tier, result);
      }
    }
  }

  /**
   * 자동 판매: 높은 단계부터 우선 판매
   */
  runAutoSell(deltaTimeSec) {
    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= GAME_CONSTANTS.MIN_SELL_TIER; tier--) {
      if (!this.autoSellTiers.has(tier)) {
        continue;
      }

      this.autoSellAccumulatorSecByTier[tier] += deltaTimeSec;

      while (this.autoSellAccumulatorSecByTier[tier] >= this.autoSellIntervalSec) {
        this.autoSellAccumulatorSecByTier[tier] -= this.autoSellIntervalSec;

        if ((gameEngine.state.inventory[tier] || 0) < 1) {
          break;
        }

        gameEngine.sellUnit(tier, 1);
      }
    }
  }
  
  /**
   * 자원 표시 업데이트
   */
  updateResourceDisplay() {
    const state = gameEngine.getState();

    this.updateHudValue('gold-display', this.formatAbcNumber(state.gold));
    this.updateHudValue('dps-display', this.formatAbcNumber(state.currentDPS));
    this.emitHudGainFx('gold', state.gold, 'fx-gold');
    this.emitHudGainFx('dps', state.currentDPS, 'fx-boss');
    
    // 수입 배율
    const incomeMultiplierEl = document.getElementById('income-multiplier');
    if (incomeMultiplierEl) {
      incomeMultiplierEl.textContent = `x${this.formatAbcNumber(state.currentIncomeMultiplier, { smallAsInteger: false })}`;
    }

    // 실제 수입(초당)
    const actualIncomeEl = document.getElementById('actual-income');
    if (actualIncomeEl) {
      actualIncomeEl.textContent = `${this.formatAbcNumber(state.currentIncomePerSecond, { smallAsInteger: false })}/s`;
    }

    // 다음 배율 구간
    const nextMultiplierEl = document.getElementById('next-multiplier');
    if (nextMultiplierEl) {
      nextMultiplierEl.textContent = `DPS ${this.formatAbcNumber(state.nextIncomeThreshold)}`;
    }
    
    // 누적 골드
    const earnedEl = document.getElementById('total-earned');
    if (earnedEl) {
      earnedEl.textContent = this.formatAbcNumber(state.totalGoldEarned);
    }

    this.updateHudValue('character-level', state.characterLevel);

    // 캐릭터 경험치
    const expEl = document.getElementById('character-exp');
    if (expEl) {
      const nextExpText = state.requiredExpForNextLevel === 0
        ? 'MAX'
        : `${this.formatAbcNumber(state.characterExp)} / ${this.formatAbcNumber(state.requiredExpForNextLevel)}`;
      this.updateHudValue('character-exp', nextExpText);
    }

    this.updateHudValue('trait-points', state.traitPoints);
    this.updateHudValue('midboss-level', state.midBoss?.level || 0);
    this.updateHudValue('slot-population', `${state.deployedCount} / ${state.slotCap}`);
    const automationSpeedLevel = state.traitLevels.automationSpeedUpgrade || 0;
    const automationStartPassLevel = Math.max(0, Math.floor(state.rebirth?.rewards?.automationStartPass || 0));
    const automationSpeedRate = GAME_CONSTANTS.getAutomationActionsPerSecond(automationSpeedLevel)
      + (automationStartPassLevel * 10);
    this.updateHudValue('status-automation-rate', `각 ${automationSpeedRate}회/초`);
    this.updateHudValue('play-time', this.formatDuration(state.playTimeSeconds || 0));
    this.updateHudValue('total-play-time', this.formatDuration(state.totalPlayTimeSeconds || 0));
    this.updateHudValue('scaled-play-time', this.formatDuration(state.scaledPlayTimeSeconds || 0));
    this.updateHudValue('total-scaled-play-time', this.formatDuration(state.totalScaledPlayTimeSeconds || 0));
    this.updateHudValue('status-rebirth-count', `${Math.floor(state.rebirth?.totalRebirthCount || 0)}회`);
    this.updateHudValue('status-last-rebirth-tier', `${Math.floor(state.rebirth?.lastRebirthTier || 1)}단`);

    // 공격력 업글 정보 표시
    const attackLevel = state.traitLevels.attackPowerUpgrade || 0;
    const attackMultiplier = GAME_CONSTANTS.getAttackPowerMultiplier(attackLevel);
    const attackLevelEl = document.getElementById('trait-attack-level');
    const attackEffectEl = document.getElementById('trait-attack-effect');
    if (attackLevelEl) attackLevelEl.textContent = this.formatTraitLevel('attackPowerUpgrade', attackLevel);
    if (attackEffectEl) {
      const attackMax = GAME_CONSTANTS.TRAIT_SYSTEMS.attackPowerUpgrade?.maxLevel || 0;
      const attackPreviewText = attackLevel >= attackMax ? '' : '(+0.10)';
      this.setTraitEffectText(attackEffectEl, `배수: ×${attackMultiplier.toFixed(2)}`, attackPreviewText);
    }

    // 강화확률 특성(+1/+2/+3) 정보 표시
    const enhanceBindings = [
      {
        key: 'enhanceProbabilityPlus1Upgrade',
        levelId: 'trait-enhance-plus1-level',
        effectId: 'trait-enhance-plus1-effect',
        effectPrefix: '+1강 강화확률'
      },
      {
        key: 'enhanceProbabilityPlus2Upgrade',
        levelId: 'trait-enhance-plus2-level',
        effectId: 'trait-enhance-plus2-effect',
        effectPrefix: '+2강 강화확률'
      },
      {
        key: 'enhanceProbabilityPlus3Upgrade',
        levelId: 'trait-enhance-plus3-level',
        effectId: 'trait-enhance-plus3-effect',
        effectPrefix: '+3강 강화확률'
      }
    ];

    for (const binding of enhanceBindings) {
      const level = state.traitLevels[binding.key] || 0;
      const bonus = GAME_CONSTANTS.getEnhanceProbabilityBonus(level);
      const levelEl = document.getElementById(binding.levelId);
      const effectEl = document.getElementById(binding.effectId);

      if (levelEl) levelEl.textContent = this.formatTraitLevel(binding.key, level);
      if (effectEl) {
        const maxLevel = GAME_CONSTANTS.TRAIT_SYSTEMS[binding.key]?.maxLevel || 0;
        const previewText = level >= maxLevel ? '' : '(+0.1%)';
        this.setTraitEffectText(effectEl, `${binding.effectPrefix} +${(bonus * 100).toFixed(2)}%`, previewText);
      }
    }

    // 사냥터 인원 증가 특성 정보 표시
    const slotLevel = state.traitLevels.slotCapacityUpgrade || 0;
    const slotLevelEl = document.getElementById('trait-slot-level');
    const slotEffectEl = document.getElementById('trait-slot-effect');
    if (slotLevelEl) slotLevelEl.textContent = this.formatTraitLevel('slotCapacityUpgrade', slotLevel);
    if (slotEffectEl) {
      const slotMax = GAME_CONSTANTS.TRAIT_SYSTEMS.slotCapacityUpgrade?.maxLevel || 0;
      const slotPreviewText = slotLevel >= slotMax ? '' : '(+1칸)';
      this.setTraitEffectText(slotEffectEl, `+${slotLevel}칸 (총 ${state.slotCap}칸)`, slotPreviewText);
    }

    // 자동화 속도 특성 정보 표시
    const automationSpeedLevelEl = document.getElementById('trait-automation-speed-level');
    const automationSpeedEffectEl = document.getElementById('trait-automation-speed-effect');
    if (automationSpeedLevelEl) automationSpeedLevelEl.textContent = this.formatTraitLevel('automationSpeedUpgrade', automationSpeedLevel);
    if (automationSpeedEffectEl) {
      const automationSpeedMax = GAME_CONSTANTS.TRAIT_SYSTEMS.automationSpeedUpgrade?.maxLevel || 0;
      const automationSpeedPreviewText = automationSpeedLevel >= automationSpeedMax ? '' : '(+5회/초)';
      this.setTraitEffectText(automationSpeedEffectEl, `속도: 구매/강화/판매 각 ${automationSpeedRate}회/초`, automationSpeedPreviewText);
    }
  }

  /**
   * 환생 패널 업데이트
   */
  updateRebirthPanel() {
    const state = gameEngine.getState();
    const rebirth = state.rebirth || {};
    const rewards = rebirth.rewards || {};
    const rebirthDisabled = !GAME_CONSTANTS.REBIRTH_ENABLED;

    const rebirthTabBtn = document.querySelector('.panel-tab[data-tab="rebirth-tab"]');
    if (rebirthTabBtn) {
      rebirthTabBtn.disabled = rebirthDisabled;
      rebirthTabBtn.title = rebirthDisabled ? GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE : '';
    }

    const rebirthTabPanel = document.getElementById('rebirth-tab');
    if (rebirthDisabled && rebirthTabPanel?.classList.contains('active')) {
      this.activatePanelTab('management', 'units-tab');
    }

    const rebirthNoticeEl = document.getElementById('rebirth-disabled-notice');
    if (rebirthNoticeEl) {
      rebirthNoticeEl.hidden = !rebirthDisabled;
      rebirthNoticeEl.textContent = GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE;
    }

    const pointsEl = document.getElementById('rebirth-point-display');
    if (pointsEl) {
      pointsEl.textContent = this.formatAbcNumber(rebirth.points || 0);
    }

    const totalCountEl = document.getElementById('rebirth-total-count');
    if (totalCountEl) {
      totalCountEl.textContent = `${Math.floor(rebirth.totalRebirthCount || 0)}회`;
    }

    const cumulativePointsEl = document.getElementById('rebirth-cumulative-points');
    if (cumulativePointsEl) {
      cumulativePointsEl.textContent = this.formatAbcNumber(rebirth.cumulativePointsEarned || 0);
    }

    const highestTierEl = document.getElementById('rebirth-highest-tier');
    if (highestTierEl) {
      highestTierEl.textContent = `${Math.floor(rebirth.lastRebirthTier || 1)}단`;
    }

    const previewPointsEl = document.getElementById('rebirth-preview-points');
    if (previewPointsEl) {
      previewPointsEl.textContent = this.formatAbcNumber(state.rebirthPointPreview || 0);
    }

    const rebirthBtn = document.getElementById('rebirth-button');
    if (rebirthBtn) {
      rebirthBtn.disabled = rebirthDisabled || !state.rebirthCanRebirth;
      rebirthBtn.textContent = rebirthDisabled
        ? '업데이트 예정'
        : (state.rebirthCanRebirth ? '환생 실행' : `${GAME_CONSTANTS.REBIRTH_UNLOCK_TIER}단 도달 필요`);
      rebirthBtn.title = rebirthDisabled ? GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE : '';
    }

    const bindings = [
      {
        key: 'automationStartPass',
        levelId: 'rebirth-automation-start-pass-level',
        costId: 'rebirth-automation-start-pass-cost',
        effectId: 'rebirth-automation-start-pass-effect',
        buttonId: 'rebirth-upgrade-automation-start-pass',
        getEffectData: (level, isMax) => ({
          base: `자동화 속도 +${10 * level}회/초`,
          preview: isMax ? '' : '(+10회/초)'
        })
      },
      {
        key: 'trainingManual',
        levelId: 'rebirth-training-manual-level',
        costId: 'rebirth-training-manual-cost',
        effectId: 'rebirth-training-manual-effect',
        buttonId: 'rebirth-upgrade-training-manual',
        getEffectData: (level, isMax) => ({
          base: `판매 EXP +${20 * level}%`,
          preview: isMax ? '' : '(+20%)'
        })
      },
      {
        key: 'breakthroughMemory',
        levelId: 'rebirth-breakthrough-memory-level',
        costId: 'rebirth-breakthrough-memory-cost',
        effectId: 'rebirth-breakthrough-memory-effect',
        buttonId: 'rebirth-upgrade-breakthrough-memory',
        getEffectData: (level, isMax) => ({
          base: `강화확률 +${2 * level}%`,
          preview: isMax ? '' : '(+2%)'
        })
      },
      {
        key: 'vanguardGrant',
        levelId: 'rebirth-vanguard-grant-level',
        costId: 'rebirth-vanguard-grant-cost',
        effectId: 'rebirth-vanguard-grant-effect',
        buttonId: 'rebirth-upgrade-vanguard-grant',
        getEffectData: (level, isMax) => {
          if (level < 1) {
            return {
              base: '환생 시 유닛 지급 없음',
              preview: '(1단 유닛 10기 지급)'
            };
          }
          return {
            base: `환생 시 ${level}단 유닛 10기 지급`,
            preview: isMax ? '' : '(+1단)'
          };
        }
      },
      {
        key: 'pioneerSlots',
        levelId: 'rebirth-pioneer-slots-level',
        costId: 'rebirth-pioneer-slots-cost',
        effectId: 'rebirth-pioneer-slots-effect',
        buttonId: 'rebirth-upgrade-pioneer-slots',
        getEffectData: (level, isMax) => ({
          base: `기본 슬롯 +${2 * level}`,
          preview: isMax ? '' : '(+2)'
        })
      }
    ];

    for (const binding of bindings) {
      const rewardMeta = GAME_CONSTANTS.REBIRTH_REWARDS[binding.key];
      if (!rewardMeta) {
        continue;
      }

      const level = Math.max(0, Math.floor(rewards[binding.key] || 0));
      const isMax = level >= rewardMeta.maxLevel;
      const cost = GAME_CONSTANTS.getRebirthRewardCost(binding.key, level);

      const levelEl = document.getElementById(binding.levelId);
      if (levelEl) {
        levelEl.textContent = `${level}/${rewardMeta.maxLevel}Lv`;
      }

      const costEl = document.getElementById(binding.costId);
      if (costEl) {
        costEl.textContent = isMax
          ? '비용: 최대 레벨'
          : `비용: ${this.formatAbcNumber(cost || 0)} ${GAME_CONSTANTS.REBIRTH_POINT_NAME}`;
      }

      const effectEl = document.getElementById(binding.effectId);
      if (effectEl) {
        const effectData = binding.getEffectData(level, isMax);
        this.setTraitEffectText(effectEl, effectData.base, effectData.preview);
      }

      const buttonEl = document.getElementById(binding.buttonId);
      if (buttonEl) {
        buttonEl.disabled = rebirthDisabled || isMax;
        buttonEl.title = rebirthDisabled ? GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE : '';
      }
    }
  }

  /**
   * 소프트락 복구 패널 표시 업데이트
   */
  updateEmergencyRecoveryPanel() {
    const state = gameEngine.getState();
    const panelEl = document.getElementById('emergency-recovery-panel');
    const buttonEl = document.getElementById('emergency-recovery-btn');
    if (!panelEl || !buttonEl) {
      return;
    }

    const canRecover = Boolean(state.emergencyRecoveryAvailable);
    panelEl.classList.toggle('active', canRecover);
    buttonEl.disabled = !canRecover;
  }

  /**
   * HUD 수치 갱신 및 변경 시 플래시
   */
  updateHudValue(elementId, nextValue) {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    const nextText = String(nextValue);
    const previousText = element.dataset.lastValue;

    element.textContent = nextText;

    if (previousText !== undefined && previousText !== nextText) {
      this.flashHudValue(element);
    }

    element.dataset.lastValue = nextText;
  }

  setTraitEffectText(element, baseText, previewText = '') {
    if (!element) {
      return;
    }

    if (!previewText) {
      element.textContent = baseText;
      return;
    }

    element.innerHTML = `${baseText}<span class="trait-preview">${previewText}</span>`;
  }

  /**
   * 짧은 HUD 플래시 효과
   */
  flashHudValue(element) {
    element.classList.remove('hud-flash');
    void element.offsetWidth;
    element.classList.add('hud-flash');

    window.setTimeout(() => {
      element.classList.remove('hud-flash');
    }, 300);
  }

  emitHudGainFx(key, nextValue, floatingClassName) {
    const normalizedKey = key === 'dps' ? 'dps' : 'gold';
    const previousValue = Number(this.hudNumericSnapshot[normalizedKey]) || 0;
    const currentValue = Number(nextValue) || 0;
    this.hudNumericSnapshot[normalizedKey] = currentValue;

    const delta = currentValue - previousValue;
    if (!(delta > 0)) {
      return;
    }

    const nowMs = performance.now();
    const cooldownMs = this.hudEffectCooldownMs[normalizedKey] || 500;
    if ((nowMs - (this.lastHudEffectAtMs[normalizedKey] || 0)) < cooldownMs) {
      return;
    }

    this.lastHudEffectAtMs[normalizedKey] = nowMs;
    const elementId = normalizedKey === 'dps' ? 'dps-display' : 'gold-display';
    const valueEl = document.getElementById(elementId);
    if (valueEl) {
      this.setTemporaryClass(valueEl, 'fx-value-pop', 320);
    }

    const compactDelta = this.formatAbcNumber(delta, { smallAsInteger: false });
    const label = normalizedKey === 'dps' ? `+${compactDelta} DPS` : `+${compactDelta} 골드`;
    this.spawnBattleFloatText(label, floatingClassName);
  }

  setTemporaryClass(element, className, durationMs = 420) {
    if (!element || !className) {
      return;
    }

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);

    window.setTimeout(() => {
      element.classList.remove(className);
    }, durationMs);
  }

  getTierRowElements(tier) {
    const normalizedTier = Math.max(1, Math.floor(Number(tier) || 1));
    const inventoryRow = document.querySelector(`#inventory-container .unit-table tbody tr:nth-child(${normalizedTier})`);
    const deployedRow = document.querySelector(`#deployed-container .unit-table tbody tr:nth-child(${normalizedTier})`);
    return { inventoryRow, deployedRow };
  }

  isBattleHuntTabActive() {
    const battlePanel = document.getElementById('battle-panel');
    const huntTab = document.getElementById('battle-hunt-tab');
    return Boolean(
      battlePanel?.classList.contains('active')
      && huntTab?.classList.contains('active')
    );
  }

  pulseTierRows(tier, className, durationMs = 420) {
    if (!this.unitActionFxEnabled || this.isBattleHuntTabActive()) {
      return;
    }

    const rows = this.getTierRowElements(tier);
    this.setTemporaryClass(rows.inventoryRow, className, durationMs);
    this.setTemporaryClass(rows.deployedRow, className, durationMs);
  }

  pulseMidBossCard(className, durationMs = 600) {
    const card = document.querySelector('.midboss-battle-card');
    this.setTemporaryClass(card, className, durationMs);
  }

  shouldEmitUpgradeFx(tier, resultKey) {
    const normalizedTier = Math.max(1, Math.floor(Number(tier) || 1));
    const normalizedResultKey = resultKey === 'success' ? 'success' : 'fail';
    const stateKey = `${normalizedTier}:${normalizedResultKey}`;
    const nowMs = performance.now();
    const cooldownMs = this.upgradeFxCooldownMs[normalizedResultKey] || 320;
    const lastAtMs = this.upgradeFxLastAtMsByTier[stateKey] || 0;

    if ((nowMs - lastAtMs) < cooldownMs) {
      return false;
    }

    this.upgradeFxLastAtMsByTier[stateKey] = nowMs;
    return true;
  }

  emitUpgradeResultFx(tier, result) {
    if (!result || typeof result !== 'object') {
      return;
    }

    if (result.success) {
      if (!this.shouldEmitUpgradeFx(tier, 'success')) {
        return;
      }

      const targetTier = Math.max(1, Math.floor(Number(result.newTier) || tier));
      this.pulseTierRows(targetTier, 'fx-tier-deploy', 260);
      this.spawnBattleFloatText(`강화 성공 ${tier} -> ${targetTier}`, 'fx-boss');
      return;
    }

    if (!this.shouldEmitUpgradeFx(tier, 'fail')) {
      return;
    }

    this.pulseTierRows(tier, 'fx-tier-sell', 280);
    this.spawnBattleFloatText(`강화 실패 ${tier}단`, 'fx-boss-fail');
  }

  updateBattleStageTheme(state) {
    const stageEl = document.querySelector('.battle-stage');
    if (!stageEl || !state) {
      return;
    }

    let highestTier = 1;
    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= 1; tier--) {
      const inventoryCount = Math.max(0, Math.floor(Number(state.inventory?.[tier]) || 0));
      const deployedCount = Math.max(0, Math.floor(Number(state.deployed?.[tier]) || 0));
      if ((inventoryCount + deployedCount) > 0) {
        highestTier = tier;
        break;
      }
    }

    stageEl.classList.remove(
      'theme-tier-bronze',
      'theme-tier-silver',
      'theme-tier-gold',
      'theme-tier-prismatic',
      'theme-tier-cosmic'
    );

    let themeClassName = 'theme-tier-bronze';
    if (highestTier >= 33) {
      themeClassName = 'theme-tier-cosmic';
    } else if (highestTier >= 25) {
      themeClassName = 'theme-tier-prismatic';
    } else if (highestTier >= 17) {
      themeClassName = 'theme-tier-gold';
    } else if (highestTier >= 9) {
      themeClassName = 'theme-tier-silver';
    }

    stageEl.classList.add(themeClassName);
  }

  getBattleStageUnitAccent(tier) {
    const colorByBlock = [
      '#ffffff', // 1-5: white
      '#22c55e', // 6-10: green
      '#3b82f6', // 11-15: blue
      '#facc15', // 16-20: yellow
      '#a855f7', // 21-25: purple
      '#f97316', // 26-30: orange
      '#ef4444', // 31-35: red
      '#ec4899'  // 36-40: magenta
    ];
    const normalizedTier = Math.max(1, Math.floor(Number(tier) || 1));
    const blockIndex = Math.min(colorByBlock.length - 1, Math.floor((normalizedTier - 1) / 5));
    return colorByBlock[blockIndex];
  }

  getBattleStageActors(state) {
    const actors = [];
    if (!state) {
      return actors;
    }

    const attackMultiplier = GAME_CONSTANTS.getAttackPowerMultiplier(state.traitLevels?.attackPowerUpgrade || 0);
    let actorIndex = 0;

    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= 1; tier--) {
      const count = Math.max(0, Math.floor(Number(state.deployed?.[tier]) || 0));
      if (count < 1) {
        continue;
      }

      const spec = GAME_CONSTANTS.UNIT_SPECS[tier] || { attackPower: 1, attackSpeed: 0.6 };
      const attackSpeed = Math.max(0.3, Number(spec.attackSpeed) || 0.6);
      for (let index = 0; index < count; index++) {
        actors.push({
          id: `tier-${tier}-${index + 1}`,
          tier,
          attackSpeed,
          hitDamage: Math.max(1, Math.round((Number(spec.attackPower) || 1) * attackMultiplier)),
          side: actorIndex % 2 === 0 ? 'left' : 'right'
        });
        actorIndex += 1;
      }
    }

    const slotCap = Math.max(0, Math.floor(Number(state.slotCap) || GAME_CONSTANTS.SLOT_CAP));
    return actors.slice(0, slotCap);
  }

  getBattleStageSeed(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0) / 4294967295;
  }

  buildBattleStageActorLayout(stageEl, actors) {
    if (!stageEl) {
      return [];
    }

    const stageWidth = stageEl.clientWidth || 640;
    const stageHeight = stageEl.clientHeight || 140;
    const targetX = stageWidth * 0.5;
    const targetY = stageHeight * 0.5;
    const sideGroups = {
      left: [],
      right: []
    };

    for (const actor of actors) {
      sideGroups[actor.side].push(actor);
    }

    for (const side of ['left', 'right']) {
      sideGroups[side].sort((leftActor, rightActor) => {
        const leftSeed = this.getBattleStageSeed(`${leftActor.id}-lane`);
        const rightSeed = this.getBattleStageSeed(`${rightActor.id}-lane`);
        return leftSeed - rightSeed;
      });
    }

    const layout = [];
    for (const side of ['left', 'right']) {
      const group = sideGroups[side];
      const minXRatio = side === 'left' ? 0.02 : 0.64;
      const maxXRatio = side === 'left' ? 0.36 : 0.98;
      for (let index = 0; index < group.length; index++) {
        const actor = group[index];
        const laneRatio = group.length <= 1 ? 0.5 : (index / Math.max(1, group.length - 1));
        const yJitter = (this.getBattleStageSeed(`${actor.id}-y`) - 0.5) * 0.2;
        const xSeed = this.getBattleStageSeed(`${actor.id}-x`);
        const driftSeed = this.getBattleStageSeed(`${actor.id}-drift`);
        const topRatio = Math.min(0.94, Math.max(0.06, 0.06 + (laneRatio * 0.88) + yJitter));
        const leftRatio = minXRatio + ((maxXRatio - minXRatio) * xSeed);
        const leftPx = stageWidth * leftRatio;
        const topPx = stageHeight * topRatio;
        const shotOriginX = leftPx + (side === 'left' ? 36 : 6);
        const shotOriginY = topPx + 12;
        const shotDx = targetX - shotOriginX;
        const shotDy = targetY - shotOriginY;
        const shotWidth = Math.max(48, Math.hypot(shotDx, shotDy) - 28);
        const shotAngle = Math.atan2(shotDy, shotDx) * (180 / Math.PI);
        const cycleSec = 1 / actor.attackSpeed;
        const delaySec = this.getBattleStageSeed(`${actor.id}-delay`) * cycleSec;
        const driftY = ((driftSeed * 12) - 6).toFixed(1);
        const advanceX = side === 'left' ? Math.min(22, Math.max(9, Math.abs(shotDx) * 0.08)) : -Math.min(22, Math.max(9, Math.abs(shotDx) * 0.08));
        const motionRangeX = Math.min(stageWidth * 0.22, 56 + (this.getBattleStageSeed(`${actor.id}-rx`) * 70));
        const motionRangeY = Math.min(stageHeight * 0.34, 22 + (this.getBattleStageSeed(`${actor.id}-ry`) * 52));
        const motionSpeed = 42 + (this.getBattleStageSeed(`${actor.id}-speed`) * 38);
        const turnRate = 1.6 + (this.getBattleStageSeed(`${actor.id}-turn`) * 1.8);

        layout.push({
          ...actor,
          leftPx,
          topPx,
          cycleSec,
          delaySec,
          shotWidth,
          shotAngle,
          advanceX,
          driftY,
          motionRangeX,
          motionRangeY,
          motionSpeed,
          turnRate,
          hitJitterX: (side === 'left' ? -0.24 : 0.24) + ((this.getBattleStageSeed(`${actor.id}-hit-x`) - 0.5) * 0.22),
          hitJitterY: (this.getBattleStageSeed(`${actor.id}-hit-y`) - 0.5) * 0.64
        });
      }
    }

    return layout;
  }

  renderBattleStageActors(unitsEl, actors) {
    if (!unitsEl) {
      return;
    }

    if (actors.length < 1) {
      unitsEl.innerHTML = '';
      return;
    }

    unitsEl.innerHTML = actors.map((actor, index) => {
      return `
        <div
          class="battle-stage-unit battle-stage-unit-${actor.side}"
          style="left: ${actor.leftPx.toFixed(1)}px; top: ${actor.topPx.toFixed(1)}px; --attack-cycle: ${actor.cycleSec.toFixed(2)}s; --attack-delay: ${actor.delaySec.toFixed(2)}s; --shot-width: ${actor.shotWidth.toFixed(1)}px; --shot-angle: ${actor.shotAngle.toFixed(2)}deg; --unit-accent: ${this.getBattleStageUnitAccent(actor.tier)}; --shot-left: ${actor.side === 'left' ? 'calc(100% - 4px)' : 'auto'}; right: ${actor.side === 'right' ? 'calc(100% - 4px)' : 'auto'};"
          data-actor-id="${actor.id}"
        >
          <span class="battle-stage-unit-body">T${actor.tier}</span>
          <span class="battle-stage-unit-shot"></span>
        </div>
      `;
    }).join('');
  }

  syncBattleStageActorRuntime(actors, nowMs) {
    const activeIds = new Set();

    for (const actor of actors) {
      activeIds.add(actor.id);
      const existing = this.huntStageActorRuntimeById[actor.id];
      if (existing) {
        existing.cycleMs = actor.cycleSec * 1000;
        existing.side = actor.side;
        existing.hitDamage = actor.hitDamage;
        existing.hitJitterX = actor.hitJitterX;
        existing.hitJitterY = actor.hitJitterY;
        continue;
      }

      this.huntStageActorRuntimeById[actor.id] = {
        cycleMs: actor.cycleSec * 1000,
        side: actor.side,
        hitDamage: actor.hitDamage,
        hitJitterX: actor.hitJitterX,
        hitJitterY: actor.hitJitterY,
        nextHitAtMs: nowMs + (actor.delaySec * 1000) + (actor.cycleSec * 180)
      };

      if (!this.huntStageMotionById[actor.id]) {
        const headingRad = this.getBattleStageSeed(`${actor.id}-heading`) * Math.PI * 2;
        this.huntStageMotionById[actor.id] = {
          offsetX: 0,
          offsetY: 0,
          headingRad,
          targetX: 0,
          targetY: 0,
          speedPxPerSec: actor.motionSpeed,
          turnRateRadPerSec: actor.turnRate,
          maxRangeX: actor.motionRangeX,
          maxRangeY: actor.motionRangeY,
          bankDeg: 0
        };
      }
    }

    Object.keys(this.huntStageActorRuntimeById).forEach((actorId) => {
      if (!activeIds.has(actorId)) {
        delete this.huntStageActorRuntimeById[actorId];
      }
    });

    Object.keys(this.huntStageMotionById).forEach((actorId) => {
      if (!activeIds.has(actorId)) {
        delete this.huntStageMotionById[actorId];
      }
    });
  }

  normalizeRadians(radians) {
    let result = radians;
    while (result > Math.PI) {
      result -= (Math.PI * 2);
    }
    while (result < -Math.PI) {
      result += (Math.PI * 2);
    }
    return result;
  }

  pickBattleUnitMotionTarget(motionState) {
    const minTargetDistance = 12;
    let targetX = 0;
    let targetY = 0;

    for (let attempt = 0; attempt < 6; attempt++) {
      targetX = (Math.random() * 2 - 1) * motionState.maxRangeX;
      targetY = (Math.random() * 2 - 1) * motionState.maxRangeY;
      const distance = Math.hypot(targetX - motionState.offsetX, targetY - motionState.offsetY);
      if (distance >= minTargetDistance) {
        break;
      }
    }

    motionState.targetX = targetX;
    motionState.targetY = targetY;
  }

  updateBattleStageUnitMotion(actors, nowMs) {
    if (!Array.isArray(actors) || actors.length < 1) {
      this.huntStageLastMotionAtMs = nowMs;
      return;
    }

    const previousAt = this.huntStageLastMotionAtMs || nowMs;
    this.huntStageLastMotionAtMs = nowMs;
    const deltaSec = Math.max(0.001, Math.min(0.12, (nowMs - previousAt) / 1000));

    for (const actor of actors) {
      const motionState = this.huntStageMotionById[actor.id];
      if (!motionState) {
        continue;
      }

      motionState.speedPxPerSec = actor.motionSpeed;
      motionState.turnRateRadPerSec = actor.turnRate;
      motionState.maxRangeX = actor.motionRangeX;
      motionState.maxRangeY = actor.motionRangeY;

      const distanceToTarget = Math.hypot(
        motionState.targetX - motionState.offsetX,
        motionState.targetY - motionState.offsetY
      );

      if (distanceToTarget < 10) {
        this.pickBattleUnitMotionTarget(motionState);
      }

      const desiredHeading = Math.atan2(
        motionState.targetY - motionState.offsetY,
        motionState.targetX - motionState.offsetX
      );
      const headingDelta = this.normalizeRadians(desiredHeading - motionState.headingRad);
      const maxTurnDelta = motionState.turnRateRadPerSec * deltaSec;
      const clampedTurn = Math.max(-maxTurnDelta, Math.min(maxTurnDelta, headingDelta));
      motionState.headingRad += clampedTurn;

      const speedStep = motionState.speedPxPerSec * deltaSec;
      motionState.offsetX += Math.cos(motionState.headingRad) * speedStep;
      motionState.offsetY += Math.sin(motionState.headingRad) * speedStep;

      const overflowX = Math.abs(motionState.offsetX) - motionState.maxRangeX;
      const overflowY = Math.abs(motionState.offsetY) - motionState.maxRangeY;
      if (overflowX > 0) {
        motionState.offsetX = Math.sign(motionState.offsetX) * motionState.maxRangeX;
        this.pickBattleUnitMotionTarget(motionState);
      }
      if (overflowY > 0) {
        motionState.offsetY = Math.sign(motionState.offsetY) * motionState.maxRangeY;
        this.pickBattleUnitMotionTarget(motionState);
      }

      const headingDeg = motionState.headingRad * (180 / Math.PI);
      const sideDirection = actor.side === 'left' ? 1 : -1;
      const bankTargetDeg = Math.max(-6, Math.min(6, headingDeg * 0.28 * sideDirection));
      motionState.bankDeg += (bankTargetDeg - motionState.bankDeg) * Math.min(1, deltaSec * 4.5);

      const actorEl = document.querySelector(`.battle-stage-unit[data-actor-id="${actor.id}"]`);
      if (!actorEl) {
        continue;
      }

      actorEl.style.transform = `translate3d(${motionState.offsetX.toFixed(2)}px, ${motionState.offsetY.toFixed(2)}px, 0) rotate(${motionState.bankDeg.toFixed(2)}deg)`;
    }
  }

  spawnBattleDamageNumber(amount, side, anchorX, anchorY) {
    const layer = document.getElementById('battle-fx-layer');
    if (!layer || !(amount > 0)) {
      return;
    }

    const numberEl = document.createElement('div');
    numberEl.className = `battle-hit-number battle-hit-number-${side === 'right' ? 'right' : 'left'}`;
    numberEl.textContent = this.formatAbcNumber(amount, { smallAsInteger: true });
    numberEl.style.left = `${anchorX.toFixed(1)}px`;
    numberEl.style.top = `${anchorY.toFixed(1)}px`;
    layer.appendChild(numberEl);

    window.setTimeout(() => {
      numberEl.remove();
    }, 700);
  }

  emitBattleStageHits(actors, targetEl, nowMs) {
    if (!targetEl || actors.length < 1) {
      return;
    }

    const stageEl = document.querySelector('.battle-stage');
    const stageRect = stageEl?.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    if (!stageRect || !targetRect.width || !targetRect.height) {
      return;
    }

    const targetCenterX = (targetRect.left - stageRect.left) + (targetRect.width / 2);
    const targetCenterY = (targetRect.top - stageRect.top) + (targetRect.height / 2);
    const targetRadius = Math.min(targetRect.width, targetRect.height) * 0.5;

    const pendingHitsBySide = {
      left: [],
      right: []
    };

    for (const actor of actors) {
      const runtime = this.huntStageActorRuntimeById[actor.id];
      if (!runtime) {
        continue;
      }

      let safety = 0;
      while (nowMs >= runtime.nextHitAtMs && safety < 3) {
        pendingHitsBySide[runtime.side].push({
          damage: runtime.hitDamage,
          jitterX: runtime.hitJitterX,
          jitterY: runtime.hitJitterY
        });
        runtime.nextHitAtMs += runtime.cycleMs;
        safety += 1;
      }
    }

    for (const side of ['left', 'right']) {
      const pendingHits = pendingHitsBySide[side];
      if (pendingHits.length < 1) {
        continue;
      }

      const groupedHits = pendingHits.length <= 2
        ? pendingHits.map((hit) => [hit])
        : [
            pendingHits.slice(0, Math.ceil(pendingHits.length / 2)),
            pendingHits.slice(Math.ceil(pendingHits.length / 2))
          ];

      groupedHits.forEach((group, index) => {
        const damage = group.reduce((sum, hit) => sum + hit.damage, 0);
        const averageJitterX = group.reduce((sum, hit) => sum + hit.jitterX, 0) / group.length;
        const averageJitterY = group.reduce((sum, hit) => sum + hit.jitterY, 0) / group.length;
        const stackOffsetY = (index * 12) - (groupedHits.length > 1 ? 6 : 0);
        const anchorX = targetCenterX + (targetRadius * averageJitterX);
        const anchorY = targetCenterY + (targetRadius * averageJitterY) + stackOffsetY;
        this.spawnBattleDamageNumber(damage, side, anchorX, anchorY);
      });

      this.setTemporaryClass(targetEl, side === 'left' ? 'fx-target-hit-left' : 'fx-target-hit-right', 180);
    }
  }

  updateBattleStageActors(state) {
    const stageEl = document.querySelector('.battle-stage');
    const unitsEl = document.getElementById('battle-stage-units');
    const targetEl = document.getElementById('battle-stage-target');
    if (!stageEl || !unitsEl || !targetEl) {
      return;
    }

    const baseActors = this.getBattleStageActors(state);
    const actors = this.buildBattleStageActorLayout(stageEl, baseActors);
    const widthKey = Math.max(1, Math.round((stageEl.clientWidth || 0) / 24));
    const signature = `${widthKey}|${actors.map((actor) => `${actor.id}:${actor.leftPx.toFixed(1)}:${actor.topPx.toFixed(1)}:${actor.cycleSec.toFixed(2)}`).join('|')}`;

    if (signature !== this.huntStageSignature) {
      this.renderBattleStageActors(unitsEl, actors);
      this.huntStageSignature = signature;
    }

    targetEl.classList.toggle('is-active', actors.length > 0);
    const nowMs = performance.now();
    this.syncBattleStageActorRuntime(actors, nowMs);
    this.updateBattleStageUnitMotion(actors, nowMs);
    this.emitBattleStageHits(actors, targetEl, nowMs);
  }

  spawnBattleFloatText(text, variantClass = 'fx-gold') {
    return;
  }
  
  /**
   * 인벤토리 표시 업데이트
   */
  updateInventoryDisplay() {
    const state = gameEngine.getState();
    const containerEl = document.getElementById('inventory-container');
    
    if (!containerEl) return;
    
    // 템플릿 업데이트
    for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const countEl = document.getElementById(`inventory-tier-${tier}-count`);
      const count = state.inventory[tier] || 0;
      if (countEl) {
        countEl.textContent = this.formatAbcNumber(count);
      }

      if (tier < GAME_CONSTANTS.MAX_TIER) {
        const probabilityEl = document.getElementById(`upgrade-probability-tier-${tier}`);
        if (probabilityEl) {
          const detail = this.getUpgradeProbabilityDetail(tier, state);
          const plus1Label = this.formatProbabilityLabel(detail.plus1Rate);
          const plus2Label = this.formatProbabilityLabel(detail.plus2Rate);
          const plus3Label = this.formatProbabilityLabel(detail.plus3Rate);
          const plus1BaseLabel = this.formatProbabilityLabel(detail.basePlus1Rate);
          const plus2BaseLabel = this.formatProbabilityLabel(detail.basePlus2Rate);
          const plus3BaseLabel = this.formatProbabilityLabel(detail.basePlus3Rate);
          const plus1Delta = this.formatProbabilityLabel(Math.max(0, detail.plus1Rate - detail.basePlus1Rate));
          const plus2Delta = this.formatProbabilityLabel(Math.max(0, detail.plus2Rate - detail.basePlus2Rate));
          const plus3Delta = this.formatProbabilityLabel(Math.max(0, detail.plus3Rate - detail.basePlus3Rate));

          const plus1DeltaMarkup = (detail.plus1Rate - detail.basePlus1Rate) > 0
            ? `<span class="upgrade-probability-delta">추가 +${plus1Delta}p</span>`
            : '<span class="upgrade-probability-delta upgrade-probability-delta-zero">추가 +0%p</span>';
          const plus2DeltaMarkup = (detail.plus2Rate - detail.basePlus2Rate) > 0
            ? `<span class="upgrade-probability-delta">추가 +${plus2Delta}p</span>`
            : '<span class="upgrade-probability-delta upgrade-probability-delta-zero">추가 +0%p</span>';
          const plus3DeltaMarkup = (detail.plus3Rate - detail.basePlus3Rate) > 0
            ? `<span class="upgrade-probability-delta">추가 +${plus3Delta}p</span>`
            : '<span class="upgrade-probability-delta upgrade-probability-delta-zero">추가 +0%p</span>';

          const cappedBadge = detail.isCapped
            ? '<span class="upgrade-probability-cap">상한</span>'
            : '';

          probabilityEl.innerHTML = `
            <span class="upgrade-probability-line upgrade-probability-line-plus1"><span class="upgrade-probability-tag">+1강</span><span class="upgrade-probability-base">기준 ${plus1BaseLabel}</span>${plus1DeltaMarkup}</span>
            <span class="upgrade-probability-line upgrade-probability-line-plus2"><span class="upgrade-probability-tag">+2강</span><span class="upgrade-probability-base">기준 ${plus2BaseLabel}</span>${plus2DeltaMarkup}</span>
            <span class="upgrade-probability-line upgrade-probability-line-plus3"><span class="upgrade-probability-tag">+3강</span><span class="upgrade-probability-base">기준 ${plus3BaseLabel}</span>${plus3DeltaMarkup}${cappedBadge}</span>
          `;
        }
      }
    }

    this.updateRebirthActionButtons(state);
  }
  
  /**
   * 배치 현황 표시 업데이트
   */
  updateDeployedDisplay() {
    const state = gameEngine.getState();
    const containerEl = document.getElementById('deployed-container');
    
    if (!containerEl) return;
    
    let totalSlots = 0;
    for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const count = state.deployed[tier] || 0;
      const dps = count * GAME_CONSTANTS.getDPS(tier);
      
      // 배치된 유닛 표시
      const deployedEl = document.getElementById(`deployed-tier-${tier}`);
      if (deployedEl) {
        deployedEl.textContent = this.formatAbcNumber(count);
      }
      
      // DPS 표시
      const tierDpsEl = document.getElementById(`deployed-dps-${tier}`);
      if (tierDpsEl) {
        tierDpsEl.textContent = dps > 0 ? this.formatAbcNumber(dps) : '-';
      }
      
      totalSlots += count;
    }
    
    // 슬롯 상태
    const slotEl = document.getElementById('slot-status');
    if (slotEl) {
      slotEl.textContent = `${totalSlots}/${state.slotCap}`;
    }

    this.updateBattleStageTheme(state);
    this.updateBattleStageActors(state);
  }

  /**
   * 중간보스 패널 업데이트 및 도전 애니메이션 처리
   */
  updateMidBossPanel() {
    const snapshot = gameEngine.getMidBossChallengeSnapshot();

    const levelEl = document.getElementById('midboss-current-level');
    if (levelEl) {
      levelEl.textContent = snapshot.isCompleted
        ? `${snapshot.maxChallenges}/${snapshot.maxChallenges} (완료)`
        : `${snapshot.level}/${snapshot.maxChallenges}`;
    }

    const dpsCutEl = document.getElementById('midboss-dps-cut');
    if (dpsCutEl) {
      dpsCutEl.textContent = snapshot.isCompleted
        ? '-'
        : this.formatAbcNumber(snapshot.dpsCut);
    }

    const cloneDpsEl = document.getElementById('midboss-clone-dps');
    if (cloneDpsEl) {
      cloneDpsEl.textContent = this.formatAbcNumber(snapshot.cloneTotalDps);
    }

    this.renderMidBossCloneList(snapshot.clones);
    this.updateMidBossRunAnimation(snapshot);
    this.updateMidBossStartButton(snapshot);
  }

  renderMidBossCloneList(clones) {
    const listEl = document.getElementById('midboss-clone-list');
    if (!listEl) {
      return;
    }

    if (clones.length < 1) {
      listEl.innerHTML = '<div class="midboss-clone-item">출전 가능한 유닛이 없습니다.</div>';
      return;
    }

    listEl.innerHTML = clones
      .map((clone, index) => `
        <div class="midboss-clone-item">
          <span>#${index + 1} 클론</span>
          <span>${clone.tier}단</span>
          <strong>DPS ${this.formatAbcNumber(clone.dps)}</strong>
        </div>
      `)
      .join('');
  }

  updateMidBossRunAnimation(snapshot) {
    const progressEl = document.getElementById('midboss-progress-fill');
    const timerEl = document.getElementById('midboss-timer');
    const liveDpsEl = document.getElementById('midboss-live-dps');
    const avgDpsEl = document.getElementById('midboss-avg-dps');
    const statusTextEl = document.getElementById('midboss-status-text');

    if (!progressEl || !timerEl || !liveDpsEl || !avgDpsEl || !statusTextEl) {
      return;
    }

    if (!this.midBossRun) {
      progressEl.style.width = '0%';
      timerEl.textContent = `0.0 / ${snapshot.durationSec.toFixed(1)}초`;
      liveDpsEl.textContent = this.formatAbcNumber(snapshot.cloneTotalDps);
      avgDpsEl.textContent = this.formatAbcNumber(0);
      statusTextEl.textContent = snapshot.isCompleted ? '완료' : '대기 중';
      return;
    }

    const nowMs = performance.now();
    const elapsedSec = Math.min((nowMs - this.midBossRun.startedAtMs) / 1000, this.midBossRun.durationSec);
    const deltaSec = Math.max(0, (nowMs - this.midBossRun.lastTickMs) / 1000);
    this.midBossRun.lastTickMs = nowMs;

    this.midBossRun.accumulatedDamage += this.midBossRun.liveDps * deltaSec;

    const progress = Math.min(1, elapsedSec / this.midBossRun.durationSec);
    const averagedDps = this.midBossRun.accumulatedDamage / this.midBossRun.durationSec;

    progressEl.style.width = `${(progress * 100).toFixed(1)}%`;
    timerEl.textContent = `${elapsedSec.toFixed(1)} / ${this.midBossRun.durationSec.toFixed(1)}초`;
    liveDpsEl.textContent = this.formatAbcNumber(this.midBossRun.liveDps);
    avgDpsEl.textContent = this.formatAbcNumber(averagedDps);
    statusTextEl.textContent = '도전 중...';

    if (elapsedSec >= this.midBossRun.durationSec) {
      const result = gameEngine.resolveMidBossChallenge(averagedDps);
      if (result.success) {
        this.pulseMidBossCard('fx-midboss-success', 760);
        this.spawnBattleFloatText('중간보스 성공!', 'fx-boss');
        statusTextEl.textContent = result.completed
          ? `성공! 슬롯 +${result.slotReward} (완료)`
          : `성공! 슬롯 +${result.slotReward}`;
      } else {
        this.pulseMidBossCard('fx-midboss-fail', 500);
        this.spawnBattleFloatText('중간보스 실패', 'fx-boss-fail');
        if (result.isCompleted) {
          statusTextEl.textContent = '완료';
        } else {
          statusTextEl.textContent = `실패 (평균 ${this.formatAbcNumber(result.averageDps)} / 컷 ${this.formatAbcNumber(result.dpsCut)})`;
        }
      }
      this.midBossRun = null;
    }
  }

  updateMidBossStartButton(snapshot) {
    const startBtn = document.getElementById('midboss-start-btn');
    if (!startBtn) {
      return;
    }

    if (this.midBossRun) {
      startBtn.disabled = true;
      startBtn.textContent = '도전 진행 중...';
      return;
    }

    if (snapshot.isCompleted) {
      startBtn.disabled = true;
      startBtn.textContent = '중간보스 완료';
      return;
    }

    if (snapshot.clones.length < 1) {
      startBtn.disabled = true;
      startBtn.textContent = '유닛 부족';
      return;
    }

    startBtn.disabled = false;
    startBtn.textContent = '중간보스 도전';
  }
  
  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    const tutorialPrimaryBtn = document.getElementById('tutorial-primary-btn');
    if (tutorialPrimaryBtn) {
      tutorialPrimaryBtn.addEventListener('click', () => this.onTutorialPrimaryAction('click'));
      tutorialPrimaryBtn.addEventListener('pointerup', () => this.onTutorialPrimaryAction('pointerup'));
    }

    const tutorialOverlay = document.getElementById('tutorial-overlay');
    if (tutorialOverlay) {
      tutorialOverlay.addEventListener('pointerdown', (event) => {
        const targetId = event.target?.id || event.target?.className || 'unknown';
        this.appendDebugLog(`overlay pointerdown target=${targetId}`);
      });
    }

    // 자동구매 토글 버튼
    for (const tier of this.getAutoBuyTargetTiers()) {
      const autoBuyBtn = document.getElementById(`auto-buy-tier-${tier}-toggle`);
      if (autoBuyBtn) {
        autoBuyBtn.addEventListener('click', () => this.onToggleAutoBuyTier(tier));
      }
    }
    
    // 배치 버튼
    for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const deployBtn = document.getElementById(`deploy-tier-${tier}`);
      if (deployBtn) {
        deployBtn.addEventListener('click', () => this.onDeployUnit(tier));
      }
    }
    
    // 회수 버튼
    for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const retrieveBtn = document.getElementById(`retrieve-tier-${tier}`);
      if (retrieveBtn) {
        retrieveBtn.addEventListener('click', () => this.onRetrieveUnit(tier));
      }
    }
    
    // 강화 버튼: 단수별 자동강화 토글
    for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
      const upgradeBtn = document.getElementById(`upgrade-tier-${tier}`);
      if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => this.onToggleAutoUpgradeTier(tier));
      }
    }

    // 판매 버튼 (5단 이상)
    for (let tier = GAME_CONSTANTS.MIN_SELL_TIER; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const sellBtn = document.getElementById(`sell-tier-${tier}`);
      if (sellBtn) {
        sellBtn.addEventListener('click', () => this.onSellUnit(tier));
      }
    }

    // 특성포인트 업그레이드 버튼
    const upgradeAttackBtn = document.getElementById('upgrade-attack-power');
    if (upgradeAttackBtn) {
      upgradeAttackBtn.addEventListener('click', () => this.onUpgradeTrait('attackPowerUpgrade'));
    }

    const upgradeEnhancePlus1Btn = document.getElementById('upgrade-enhance-probability-plus1');
    if (upgradeEnhancePlus1Btn) {
      upgradeEnhancePlus1Btn.addEventListener('click', () => this.onUpgradeTrait('enhanceProbabilityPlus1Upgrade'));
    }

    const upgradeEnhancePlus2Btn = document.getElementById('upgrade-enhance-probability-plus2');
    if (upgradeEnhancePlus2Btn) {
      upgradeEnhancePlus2Btn.addEventListener('click', () => this.onUpgradeTrait('enhanceProbabilityPlus2Upgrade'));
    }

    const upgradeEnhancePlus3Btn = document.getElementById('upgrade-enhance-probability-plus3');
    if (upgradeEnhancePlus3Btn) {
      upgradeEnhancePlus3Btn.addEventListener('click', () => this.onUpgradeTrait('enhanceProbabilityPlus3Upgrade'));
    }

    const resetAttackBtn = document.getElementById('reset-attack-power');
    if (resetAttackBtn) {
      resetAttackBtn.addEventListener('click', () => this.onResetTrait('attackPowerUpgrade'));
    }

    const resetEnhancePlus1Btn = document.getElementById('reset-enhance-probability-plus1');
    if (resetEnhancePlus1Btn) {
      resetEnhancePlus1Btn.addEventListener('click', () => this.onResetTrait('enhanceProbabilityPlus1Upgrade'));
    }

    const resetEnhancePlus2Btn = document.getElementById('reset-enhance-probability-plus2');
    if (resetEnhancePlus2Btn) {
      resetEnhancePlus2Btn.addEventListener('click', () => this.onResetTrait('enhanceProbabilityPlus2Upgrade'));
    }

    const resetEnhancePlus3Btn = document.getElementById('reset-enhance-probability-plus3');
    if (resetEnhancePlus3Btn) {
      resetEnhancePlus3Btn.addEventListener('click', () => this.onResetTrait('enhanceProbabilityPlus3Upgrade'));
    }

    const upgradeSlotBtn = document.getElementById('upgrade-slot-capacity');
    if (upgradeSlotBtn) {
      upgradeSlotBtn.addEventListener('click', () => this.onUpgradeTrait('slotCapacityUpgrade'));
    }

    const resetSlotBtn = document.getElementById('reset-slot-capacity');
    if (resetSlotBtn) {
      resetSlotBtn.addEventListener('click', () => this.onResetTrait('slotCapacityUpgrade'));
    }

    const upgradeAutomationSpeedBtn = document.getElementById('upgrade-automation-speed');
    if (upgradeAutomationSpeedBtn) {
      upgradeAutomationSpeedBtn.addEventListener('click', () => this.onUpgradeTrait('automationSpeedUpgrade'));
    }

    const resetAutomationSpeedBtn = document.getElementById('reset-automation-speed');
    if (resetAutomationSpeedBtn) {
      resetAutomationSpeedBtn.addEventListener('click', () => this.onResetTrait('automationSpeedUpgrade'));
    }

    const traitPresetButtons = document.querySelectorAll('[data-trait-preset]');
    traitPresetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const presetId = Number.parseInt(button.dataset.traitPreset, 10);
        this.onSelectTraitPreset(presetId);
      });
    });

    const saveTraitPresetBtn = document.getElementById('save-trait-preset');
    if (saveTraitPresetBtn) {
      saveTraitPresetBtn.addEventListener('click', () => this.onSaveTraitPreset());
    }

    const renameTraitPresetBtn = document.getElementById('rename-trait-preset');
    if (renameTraitPresetBtn) {
      renameTraitPresetBtn.addEventListener('click', () => this.onRenameTraitPreset());
    }

    const midBossStartBtn = document.getElementById('midboss-start-btn');
    if (midBossStartBtn) {
      midBossStartBtn.addEventListener('click', () => this.onStartMidBossChallenge());
    }

    const hardResetBtn = document.getElementById('hard-reset-button');
    if (hardResetBtn) {
      hardResetBtn.addEventListener('click', () => this.onHardReset());
    }

    const emergencyRecoveryBtn = document.getElementById('emergency-recovery-btn');
    if (emergencyRecoveryBtn) {
      emergencyRecoveryBtn.addEventListener('click', () => this.onEmergencyRecovery());
    }

    const rebirthButton = document.getElementById('rebirth-button');
    if (rebirthButton) {
      rebirthButton.addEventListener('click', () => this.onPerformRebirth());
    }

    const firstRebirthBtn = document.getElementById('rebirth-first-button');
    if (firstRebirthBtn) {
      firstRebirthBtn.addEventListener('click', () => this.onPerformFirstRebirthUnlock());
    }

    const secondRebirthBtn = document.getElementById('rebirth-second-button');
    if (secondRebirthBtn) {
      secondRebirthBtn.addEventListener('click', () => this.onPerformSecondRebirthUnlock());
    }

    const rebirthAutomationStartPassBtn = document.getElementById('rebirth-upgrade-automation-start-pass');
    if (rebirthAutomationStartPassBtn) {
      rebirthAutomationStartPassBtn.addEventListener('click', () => this.onUpgradeRebirthReward('automationStartPass'));
    }

    const rebirthTrainingManualBtn = document.getElementById('rebirth-upgrade-training-manual');
    if (rebirthTrainingManualBtn) {
      rebirthTrainingManualBtn.addEventListener('click', () => this.onUpgradeRebirthReward('trainingManual'));
    }

    const rebirthBreakthroughMemoryBtn = document.getElementById('rebirth-upgrade-breakthrough-memory');
    if (rebirthBreakthroughMemoryBtn) {
      rebirthBreakthroughMemoryBtn.addEventListener('click', () => this.onUpgradeRebirthReward('breakthroughMemory'));
    }

    const rebirthVanguardGrantBtn = document.getElementById('rebirth-upgrade-vanguard-grant');
    if (rebirthVanguardGrantBtn) {
      rebirthVanguardGrantBtn.addEventListener('click', () => this.onUpgradeRebirthReward('vanguardGrant'));
    }

    const rebirthPioneerSlotsBtn = document.getElementById('rebirth-upgrade-pioneer-slots');
    if (rebirthPioneerSlotsBtn) {
      rebirthPioneerSlotsBtn.addEventListener('click', () => this.onUpgradeRebirthReward('pioneerSlots'));
    }

    // 자동판매 버튼: 단수별 자동판매 토글 (5단~10단)
    for (let tier = GAME_CONSTANTS.MIN_SELL_TIER; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      const autoSellBtn = document.getElementById(`auto-sell-tier-${tier}`);
      if (autoSellBtn) {
        autoSellBtn.addEventListener('click', () => this.onToggleAutoSellTier(tier));
      }
    }
    
    // 창 닫기 시 저장
    window.addEventListener('beforeunload', () => {
      if (this.isHardResetInProgress) {
        return;
      }
      gameEngine.save();
      this.saveAutomationState();
      this.saveTraitPresetState();
    });
  }

  /**
   * 사이드바 및 내부 탭 전환 이벤트
   */
  bindLayoutNavigation() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach((link) => {
      link.addEventListener('click', () => this.activatePanel(link.dataset.panel));
    });

    const panelTabs = document.querySelectorAll('.panel-tab');
    panelTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabGroup = tab.dataset.tabGroup;
        const tabId = tab.dataset.tab;
        this.activatePanelTab(tabGroup, tabId);
      });
    });

    this.activatePanel('status-panel');
    this.activatePanelTab('battle', 'battle-hunt-tab');
    this.activatePanelTab('management', 'units-tab');
  }

  /**
   * 상위 패널 전환
   */
  activatePanel(panelId) {
    document.querySelectorAll('.sidebar-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.panel === panelId);
    });

    document.querySelectorAll('.panel-content').forEach((panel) => {
      panel.classList.toggle('active', panel.id === panelId);
    });
  }

  /**
   * 관리 화면 내부 탭 전환
   */
  activatePanelTab(tabGroup, tabId) {
    document.querySelectorAll(`.panel-tab[data-tab-group="${tabGroup}"]`).forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    document.querySelectorAll(`.panel-tab-content[data-tab-group-content="${tabGroup}"]`).forEach((content) => {
      content.classList.toggle('active', content.id === tabId);
    });
  }

  /**
   * 중간보스 도전 시작
   */
  onStartMidBossChallenge() {
    if (this.midBossRun) {
      return;
    }

    const snapshot = gameEngine.getMidBossChallengeSnapshot();
    if (!snapshot.canChallenge) {
      return;
    }

    const nowMs = performance.now();
    this.midBossRun = {
      startedAtMs: nowMs,
      lastTickMs: nowMs,
      durationSec: snapshot.durationSec,
      liveDps: snapshot.cloneTotalDps,
      accumulatedDamage: 0
    };

    this.pulseMidBossCard('fx-midboss-start', 620);
    this.spawnBattleFloatText('중간보스 도전 시작', 'fx-boss');
  }

  /**
   * 자동구매 모드 전환 (레거시 호환)
   */
  setExclusiveAutoBuyMode(mode = null) {
    this.autoBuyTiers.clear();
    if (Number.isFinite(mode) && mode >= 1) {
      this.autoBuyTiers.add(mode);
    }

    for (const tier of this.getAutoBuyTargetTiers()) {
      this.autoBuyAccumulatorSecByTier[tier] = 0;
    }
  }

  /**
   * 자동구매 토글 이벤트
   */
  onToggleAutoBuy() {
    this.onToggleAutoBuyTier(1);
  }

  onToggleAutoBuyTier(tier) {
    if (this.autoBuyTiers.has(tier)) {
      // 이미 켜진 단수를 누르면 전체 OFF
      this.autoBuyTiers.clear();
    } else {
      // 자동구매는 항상 1개 단수만 ON (상호배타)
      this.autoBuyTiers.clear();
      this.autoBuyTiers.add(tier);
    }
    for (const targetTier of this.getAutoBuyTargetTiers()) {
      this.autoBuyAccumulatorSecByTier[targetTier] = 0;
    }
    this.updateAutomationButtons();
    this.updateTutorialGuide();
  }

  /**
   * 단수별 자동강화 토글 이벤트
   */
  onToggleAutoUpgradeTier(tier) {
    if (this.autoUpgradeTiers.has(tier)) {
      this.autoUpgradeTiers.delete(tier);
      this.autoUpgradeAccumulatorSecByTier[tier] = 0;
    } else {
      const deployedCount = gameEngine.getState().deployedCount || 0;
      if (deployedCount < 1) {
        alert('사냥터에 배치된 유닛이 0명이면 자동강화를 켤 수 없습니다. 먼저 1기 이상 배치하세요.');
        return;
      }
      this.autoUpgradeTiers.add(tier);
    }

    this.updateAutomationButtons();
    this.updateTutorialGuide();
  }
  
  /**
   * 유닛 구매 이벤트
   */
  onBuyUnit(tier) {
    if (gameEngine.buyUnit(tier, 1)) {
      console.log(`Bought tier ${tier} unit`);
      this.updateUI();
    }
  }
  
  /**
   * 유닛 배치 이벤트
   */
  onDeployUnit(tier) {
    const quantity = Math.max(0, Math.floor(Number(gameEngine.state.inventory?.[tier]) || 0));
    if (quantity < 1) {
      return;
    }

    if (gameEngine.deployUnit(tier, quantity)) {
      console.log(`Deployed tier ${tier} units: ${quantity}`);
      this.pulseTierRows(tier, 'fx-tier-deploy');
      this.spawnBattleFloatText(`${tier}단 +${quantity} 배치`, 'fx-deploy');
    }

    this.updateUI();

    this.updateTutorialGuide();
  }
  
  /**
   * 유닛 회수 이벤트
   */
  onRetrieveUnit(tier) {
    if (gameEngine.retrieveUnit(tier, 1)) {
      console.log(`Retrieved tier ${tier} unit`);
      this.pulseTierRows(tier, 'fx-tier-retrieve');
      this.spawnBattleFloatText(`${tier}단 회수`, 'fx-boss');
      this.updateUI();
    }
  }

  /**
   * 유닛 판매 이벤트
   */
  onSellUnit(tier) {
    const result = gameEngine.sellUnit(tier, 1);
    if (result.success) {
      console.log(`Sold tier ${tier} unit, gained ${result.gainedExp} EXP`);
      this.pulseTierRows(tier, 'fx-tier-sell');
      this.spawnBattleFloatText(`판매 +${this.formatAbcNumber(result.gainedExp)}EXP`, 'fx-sell');
      this.updateUI();
    }
  }

  /**
   * 단수별 자동판매 토글 이벤트
   */
  onToggleAutoSellTier(tier) {
    if (this.autoSellTiers.has(tier)) {
      this.autoSellTiers.delete(tier);
      this.autoSellAccumulatorSecByTier[tier] = 0;
    } else {
      this.autoSellTiers.add(tier);
    }

    this.updateAutomationButtons();
  }

  /**
   * 특성 프리셋 선택
   */
  onSelectTraitPreset(presetId) {
    const normalizedPreset = Math.min(5, Math.max(1, Number.parseInt(presetId, 10) || 1));
    this.activeTraitPreset = normalizedPreset;
    this.updateTraitPresetButtons();
    this.saveAutomationState();
    this.saveTraitPresetState();

    // 프리셋 버튼 클릭 시 즉시 불러오기 (저장 데이터가 있을 때만 적용)
    this.onLoadTraitPreset(false, false);
  }

  /**
   * 특성 프리셋 저장
   */
  onSaveTraitPreset() {
    const traitTypes = Object.keys(GAME_CONSTANTS.TRAIT_SYSTEMS || {});
    const snapshot = {};

    for (const traitType of traitTypes) {
      const currentLevel = Math.max(0, Math.floor(Number(gameEngine.state.traitLevels?.[traitType]) || 0));
      snapshot[traitType] = currentLevel;
    }

    this.traitPresets[this.activeTraitPreset] = snapshot;
    this.saveTraitPresetState();
    alert(`프리셋 ${this.activeTraitPreset}번에 저장했습니다.`);
  }

  /**
   * 특성 프리셋 불러오기
   */
  onLoadTraitPreset(showSuccessMessage = true, showMissingMessage = true) {
    const preset = this.traitPresets[this.activeTraitPreset];
    if (!preset) {
      if (showMissingMessage) {
        alert(`프리셋 ${this.activeTraitPreset}번에 저장된 데이터가 없습니다.`);
      }
      return;
    }

    const traitTypes = Object.keys(GAME_CONSTANTS.TRAIT_SYSTEMS || {});

    const getInvestedPoints = (levels) => {
      let invested = 0;
      for (const traitType of traitTypes) {
        const cost = GAME_CONSTANTS.TRAIT_SYSTEMS?.[traitType]?.cost || 0;
        const level = Math.max(0, Math.floor(Number(levels?.[traitType]) || 0));
        invested += level * cost;
      }
      return invested;
    };

    const currentLevels = { ...(gameEngine.state.traitLevels || {}) };
    const currentPoints = Math.max(0, Math.floor(Number(gameEngine.state.traitPoints) || 0));
    const totalOwnedPoints = currentPoints + getInvestedPoints(currentLevels);

    const normalizedTargetLevels = {};
    for (const traitType of traitTypes) {
      const maxLevel = GAME_CONSTANTS.TRAIT_SYSTEMS?.[traitType]?.maxLevel || 0;
      const targetLevel = Math.max(0, Math.floor(Number(preset[traitType]) || 0));
      normalizedTargetLevels[traitType] = Math.min(maxLevel, targetLevel);
    }

    const targetInvestedPoints = getInvestedPoints(normalizedTargetLevels);
    const appliedLevels = {};
    let remainingPoints = totalOwnedPoints;

    if (targetInvestedPoints <= totalOwnedPoints) {
      for (const traitType of traitTypes) {
        appliedLevels[traitType] = normalizedTargetLevels[traitType];
      }
      remainingPoints = totalOwnedPoints - targetInvestedPoints;
    } else {
      // 포인트가 부족하면 프리셋 순서를 유지한 채 가능한 범위까지만 적용
      for (const traitType of traitTypes) {
        const cost = GAME_CONSTANTS.TRAIT_SYSTEMS?.[traitType]?.cost || 0;
        const targetLevel = normalizedTargetLevels[traitType] || 0;

        if (cost <= 0) {
          appliedLevels[traitType] = targetLevel;
          continue;
        }

        const maxAffordableLevel = Math.floor(remainingPoints / cost);
        const appliedLevel = Math.min(targetLevel, Math.max(0, maxAffordableLevel));
        appliedLevels[traitType] = appliedLevel;
        remainingPoints -= appliedLevel * cost;
      }
    }

    for (const traitType of traitTypes) {
      gameEngine.state.traitLevels[traitType] = appliedLevels[traitType] || 0;
    }
    gameEngine.state.traitPoints = Math.max(0, remainingPoints);

    // 슬롯 특성이 줄어들면 초과 배치 유닛을 낮은 단수부터 회수
    let deployedCount = Object.values(gameEngine.state.deployed || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
    const slotCap = gameEngine.getCurrentSlotCap();
    if (deployedCount > slotCap) {
      let toRetrieve = deployedCount - slotCap;
      for (let tier = 1; tier <= GAME_CONSTANTS.MAX_TIER && toRetrieve > 0; tier++) {
        const deployed = Math.max(0, Math.floor(Number(gameEngine.state.deployed?.[tier]) || 0));
        if (deployed < 1) {
          continue;
        }
        const retrieveCount = Math.min(deployed, toRetrieve);
        gameEngine.retrieveUnit(tier, retrieveCount);
        toRetrieve -= retrieveCount;
      }
    }

    this.updateUI();
    if (showSuccessMessage) {
      const appliedInvestedPoints = getInvestedPoints(appliedLevels);
      if (appliedInvestedPoints < targetInvestedPoints) {
        alert(
          `프리셋 ${this.activeTraitPreset}번을 가능한 범위로 불러왔습니다.\n` +
          `(요청 ${targetInvestedPoints}P / 적용 ${appliedInvestedPoints}P / 보유 총량 ${totalOwnedPoints}P)`
        );
      } else {
        alert(`프리셋 ${this.activeTraitPreset}번을 불러왔습니다.`);
      }
    }
  }

  /**
   * 현재 선택 프리셋 이름 변경
   */
  onRenameTraitPreset() {
    const presetId = this.activeTraitPreset;
    const currentName = this.traitPresetNames[presetId] || String(presetId);
    const input = prompt(`프리셋 ${presetId} 이름을 입력하세요. (최대 8글자)`, currentName);
    if (input === null) {
      return;
    }

    const normalizedName = input.trim().slice(0, 8);
    this.traitPresetNames[presetId] = normalizedName || String(presetId);
    this.updateTraitPresetButtons();
    this.saveTraitPresetState();
  }

  /**
   * 특성 프리셋 상태 저장
   */
  saveTraitPresetState() {
    try {
      const payload = {
        activeTraitPreset: this.activeTraitPreset,
        presets: this.traitPresets,
        presetNames: this.traitPresetNames
      };
      localStorage.setItem('dpsforge_trait_presets', JSON.stringify(payload));
    } catch (e) {
      console.warn('⚠ Failed to save trait preset state:', e);
    }
  }

  /**
   * 특성 프리셋 상태 로드
   */
  loadTraitPresetState() {
    try {
      const saved = localStorage.getItem('dpsforge_trait_presets');
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved);
      this.activeTraitPreset = Math.min(5, Math.max(1, Number.parseInt(parsed.activeTraitPreset, 10) || this.activeTraitPreset));
      this.traitPresets = parsed.presets && typeof parsed.presets === 'object' ? parsed.presets : {};
      const parsedNames = parsed.presetNames && typeof parsed.presetNames === 'object' ? parsed.presetNames : {};
      this.traitPresetNames = {
        1: String(parsedNames[1] || '1').slice(0, 8),
        2: String(parsedNames[2] || '2').slice(0, 8),
        3: String(parsedNames[3] || '3').slice(0, 8),
        4: String(parsedNames[4] || '4').slice(0, 8),
        5: String(parsedNames[5] || '5').slice(0, 8)
      };
      this.updateTraitPresetButtons();
    } catch (e) {
      console.warn('⚠ Failed to load trait preset state:', e);
    }
  }

  /**
   * 고단위 유닛 구매 이벤트
   */
  onBuyHighTierUnit(tier) {
    const result = gameEngine.buyHighTierUnit(tier, 1);
    if (result.success) {
      console.log(result.message);
      alert(result.message);
      this.updateUI();
    } else {
      console.warn(result.message);
      alert(result.message);
    }
  }

  /**
   * 4단 자동구매 토글
   */
  onToggleAutoHighTierBuy() {
    this.onToggleAutoBuyTier(4);
  }

  /**
   * 7단 자동구매 토글
   */
  onToggleAutoHighTierBuy7() {
    this.onToggleAutoBuyTier(7);
  }

  /**
   * 10단 자동구매 토글
   */
  onToggleAutoHighTierBuy10() {
    this.onToggleAutoBuyTier(10);
  }

  /**
   * 14단 자동구매 토글
   */
  onToggleAutoHighTierBuy14() {
    this.onToggleAutoBuyTier(14);
  }

  /**
   * 특성포인트 업그레이드 이벤트
   */
  onUpgradeTrait(traitType) {
    const success = gameEngine.spendTraitPoints(traitType, 1);
    if (success) {
      console.log(`Upgraded ${traitType}`);
      this.updateUI();
    } else {
      const traitMeta = GAME_CONSTANTS.TRAIT_SYSTEMS?.[traitType];
      const currentLevel = gameEngine.state.traitLevels?.[traitType] || 0;
      const maxLevel = traitMeta?.maxLevel;
      const cost = traitMeta?.cost || 0;
      const points = gameEngine.state.traitPoints || 0;

      let message = `업글 실패: ${traitType}`;
      if (Number.isFinite(maxLevel) && currentLevel >= maxLevel) {
        message = `이미 최대 레벨입니다. (${currentLevel}/${maxLevel})`;
      } else if (points < cost) {
        message = `특성 포인트가 부족합니다. (필요 ${cost}P / 보유 ${points}P)`;
      }

      console.warn(message);
      alert(message);
    }
  }

  /**
   * 특성 리셋 이벤트
   */
  onResetTrait(traitType) {
    const trait = GAME_CONSTANTS.TRAIT_SYSTEMS[traitType];
    if (!trait) {
      alert('특성을 찾을 수 없습니다.');
      return;
    }

    // 확인 메시지
    const confirmed = confirm(`${trait.name}을 정말 리셋하시겠습니까?\n환불 포인트를 받게 됩니다.`);
    if (!confirmed) {
      return;
    }

    const result = gameEngine.resetTrait(traitType);
    if (result.success) {
      console.log(result.message);
      alert(result.message);
      this.updateUI();
    } else {
      console.warn(result.message);
      alert(result.message);
    }
  }

  /**
   * 환생 실행
   */
  onPerformRebirth() {
    if (!GAME_CONSTANTS.REBIRTH_ENABLED) {
      alert(GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE);
      return;
    }

    const confirmed = confirm('환생하면 현재 유닛/골드/특성 진행도가 초기화됩니다.\n환생하시겠습니까?');
    if (!confirmed) {
      return;
    }

    // 환생 직후 첫 틱에서 기존 자동화가 동작하지 않도록 선제적으로 OFF 처리
    this.resetAllAutomationState();

    const result = gameEngine.performRebirth();
    if (result.success) {
      alert(`${result.message}\n현재 보유: ${result.totalPoints} ${GAME_CONSTANTS.REBIRTH_POINT_NAME}`);
      this.midBossRun = null;
      this.updateUI();
      return;
    }

    alert(result.message);
  }

  /**
   * 환생 보상 업그레이드
   */
  onUpgradeRebirthReward(rewardKey) {
    if (!GAME_CONSTANTS.REBIRTH_ENABLED) {
      alert(GAME_CONSTANTS.REBIRTH_TEMP_DISABLED_MESSAGE);
      return;
    }

    const result = gameEngine.upgradeRebirthReward(rewardKey);
    if (!result.success) {
      alert(result.message);
      return;
    }

    this.updateUI();
  }

  /**
   * 소프트락 복구: 10골드 지급
   */
  onEmergencyRecovery() {
    const result = gameEngine.applyEmergencyRecovery();
    if (!result.success) {
      alert(result.message);
      return;
    }

    alert(`복구 완료: ${result.gainedGold} 골드 지급`);
    this.updateUI();
  }

  /**
   * 테스트용 전체 초기화
   */
  onHardReset() {
    const confirmed = confirm('정말 초기화하시겠습니까?\n게임 진행, 자동화 설정, 특성 프리셋이 모두 삭제됩니다.');
    if (!confirmed) {
      return;
    }

    this.isHardResetInProgress = true;
    gameEngine.autoSaveSuspended = true;
    if (gameEngine.autoSaveTimer) {
      clearTimeout(gameEngine.autoSaveTimer);
      gameEngine.autoSaveTimer = null;
    }
    gameEngine.autoSavePending = false;

    localStorage.removeItem('dpsforge_gamestate');
    localStorage.removeItem('dpsforge_lastsave');
    localStorage.removeItem('dpsforge_automation');
    localStorage.removeItem('dpsforge_trait_presets');

    this.stopGameLoop();
    window.location.reload();
  }

  /**
   * 자동화 상태 전체 초기화
   */
  resetAllAutomationState() {
    this.autoBuyTiers.clear();
    this.autoUpgradeTiers.clear();
    this.autoSellTiers.clear();

    for (const tier of this.getAutoBuyTargetTiers()) {
      this.autoBuyAccumulatorSecByTier[tier] = 0;
    }

    for (let tier = 1; tier < GAME_CONSTANTS.MAX_TIER; tier++) {
      this.autoUpgradeAccumulatorSecByTier[tier] = 0;
    }

    for (let tier = GAME_CONSTANTS.MIN_SELL_TIER; tier <= GAME_CONSTANTS.MAX_TIER; tier++) {
      this.autoSellAccumulatorSecByTier[tier] = 0;
    }

    this.saveAutomationState();
  }
  
  /**
   * 저장
   */
  onSave() {
    gameEngine.save();
    this.saveAutomationState();
    console.log('Game saved');
    alert('Game saved successfully!');
  }
  
  /**
   * 자동화 상태 저장 (localStorage)
   */
  saveAutomationState() {
    try {
      const automationState = {
        autoBuyTiers: Array.from(this.autoBuyTiers),
        autoUpgradeTiers: Array.from(this.autoUpgradeTiers),
        autoSellTiers: Array.from(this.autoSellTiers),
        timeScale: this.timeScale,
        activeTraitPreset: this.activeTraitPreset,
        unitActionFxEnabled: this.unitActionFxEnabled,
        firstRebirthCompleted: this.firstRebirthCompleted,
        secondRebirthCompleted: this.secondRebirthCompleted
      };
      localStorage.setItem('dpsforge_automation', JSON.stringify(automationState));
      console.log('✓ Automation state saved');
    } catch (e) {
      console.warn('⚠ Failed to save automation state:', e);
    }
  }

  /**
   * 자동화 상태 로드 (localStorage)
   */
  loadAutomationState() {
    try {
      const saved = localStorage.getItem('dpsforge_automation');
      if (saved) {
        const state = JSON.parse(saved);
        this.autoBuyTiers.clear();

        if (Array.isArray(state.autoBuyTiers)) {
          for (const tier of state.autoBuyTiers) {
            const parsedTier = Number.parseInt(tier, 10);
            if (this.getAutoBuyTargetTiers().includes(parsedTier)) {
              this.setExclusiveAutoBuyMode(parsedTier);
              break;
            }
          }
        } else {
          // 레거시 단일/개별 플래그 저장값 마이그레이션
          const legacyEnabledModes = [
            state.autoBuyEnabled ? 1 : null,
            state.autoHighTierBuyEnabled ? 4 : null,
            state.autoHighTierBuy7Enabled ? 7 : null,
            state.autoHighTierBuy10Enabled ? 10 : null,
            state.autoHighTierBuy14Enabled ? 14 : null
          ].filter((value) => value !== null);
          this.setExclusiveAutoBuyMode(legacyEnabledModes[0] || null);
        }

        for (const tier of this.getAutoBuyTargetTiers()) {
          this.autoBuyAccumulatorSecByTier[tier] = 0;
        }

        this.autoUpgradeTiers = new Set(state.autoUpgradeTiers || []);
        this.autoSellTiers = new Set(state.autoSellTiers || []);
        const savedScale = Number(state.timeScale);
        this.timeScale = this.availableTimeScales.includes(savedScale) ? savedScale : 1;
        this.activeTraitPreset = Math.min(5, Math.max(1, Number.parseInt(state.activeTraitPreset, 10) || 1));
        this.unitActionFxEnabled = state.unitActionFxEnabled !== false;
        this.firstRebirthCompleted = Boolean(state.firstRebirthCompleted);
        this.secondRebirthCompleted = Boolean(state.secondRebirthCompleted);
        this.updateAutomationButtons();
        this.updateTraitPresetButtons();
        this.updateUnitActionFxUi();
        this.updateTimeScaleUi();
        this.updateRebirthActionButtons();
        console.log('✓ Automation state loaded', { autoSell: Array.from(this.autoSellTiers) });
      } else {
        this.unitActionFxEnabled = true;
        this.firstRebirthCompleted = false;
        this.secondRebirthCompleted = false;
        this.updateUnitActionFxUi();
        this.updateTimeScaleUi();
        this.updateRebirthActionButtons();
        console.log('ℹ No saved automation state');
      }
    } catch (e) {
      console.warn('⚠ Failed to load automation state:', e);
    }
  }

  /**
   * 게임 복구 및 오프라인 보상 처리
   */
  handleGameRestore() {
    const loaded = gameEngine.load();
    if (loaded) {
      const offlineReward = gameEngine.handleGameRestore();
      if (offlineReward > 0) {
        console.log(`Offline reward: ${offlineReward} gold`);
        alert(`Welcome back! You earned ${this.formatAbcNumber(offlineReward)} gold while offline.`);
      }
    }
    this.updateUI();
  }
}

// 게임 UI 인스턴스
let gameUI = null;

// 페이지 로드 시 게임 시작
document.addEventListener('DOMContentLoaded', () => {
  gameUI = new GameUI();
  gameUI.init();
});
