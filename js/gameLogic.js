/**
 * DPS Forge - Game Logic
 * 게임의 핵심 로직 구현
 */

class GameEngine {
  constructor() {
    this.autoSaveTimer = null;
    this.autoSavePending = false;
    this.autoSaveSuspended = false;
    this.lastSavedAt = 0;
    this.observableProxyCache = new WeakMap();
    this.state = this.makeObservableState(initGameState());
  }

  /**
   * 프록시 상태를 순수 JSON 직렬화 가능 객체로 변환
   */
  toSerializable(value, visited = new WeakMap()) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (visited.has(value)) {
      return visited.get(value);
    }

    if (Array.isArray(value)) {
      const arr = [];
      visited.set(value, arr);
      for (const item of value) {
        arr.push(this.toSerializable(item, visited));
      }
      return arr;
    }

    const obj = {};
    visited.set(value, obj);
    for (const [key, nestedValue] of Object.entries(value)) {
      obj[key] = this.toSerializable(nestedValue, visited);
    }
    return obj;
  }

  /**
   * 프록시 대상 여부 확인
   */
  isObservableCandidate(value) {
    return typeof value === 'object' && value !== null;
  }

  /**
   * 중첩 객체 변경까지 감지하는 상태 프록시 생성
   */
  makeObservableState(target) {
    if (!this.isObservableCandidate(target)) {
      return target;
    }

    const cachedProxy = this.observableProxyCache.get(target);
    if (cachedProxy) {
      return cachedProxy;
    }

    const proxy = new Proxy(target, {
      get: (obj, prop, receiver) => {
        const value = Reflect.get(obj, prop, receiver);
        if (this.isObservableCandidate(value)) {
          return this.makeObservableState(value);
        }
        return value;
      },
      set: (obj, prop, value, receiver) => {
        const wrappedValue = this.isObservableCandidate(value)
          ? this.makeObservableState(value)
          : value;
        const previousValue = obj[prop];
        const changed = previousValue !== wrappedValue;
        const success = Reflect.set(obj, prop, wrappedValue, receiver);
        if (success && changed) {
          this.requestAutoSave();
        }
        return success;
      },
      deleteProperty: (obj, prop) => {
        const existed = Object.prototype.hasOwnProperty.call(obj, prop);
        const success = Reflect.deleteProperty(obj, prop);
        if (success && existed) {
          this.requestAutoSave();
        }
        return success;
      }
    });

    this.observableProxyCache.set(target, proxy);
    return proxy;
  }

  /**
   * 상태 변경 시 자동 저장 요청 (최소 간격 스로틀)
   */
  requestAutoSave() {
    if (this.autoSaveSuspended) {
      return;
    }

    this.autoSavePending = true;
    if (this.autoSaveTimer) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastSavedAt;
    const minInterval = GAME_CONSTANTS.AUTO_SAVE_INTERVAL_MS;
    const delay = elapsed >= minInterval ? 0 : (minInterval - elapsed);

    this.autoSaveTimer = setTimeout(() => {
      this.flushAutoSave();
    }, delay);
  }

  /**
   * 대기 중인 자동 저장 즉시 반영
   */
  flushAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    if (!this.autoSavePending || this.autoSaveSuspended) {
      return;
    }

    this.save();
  }

  /**
   * 누적 경험치 적용 후 자동 레벨업 처리
   */
  addCharacterExp(expAmount) {
    if (expAmount <= 0) {
      return { gainedExp: 0, leveledUp: 0, gainedTraitPoints: 0 };
    }

    if (this.state.characterLevel >= GAME_CONSTANTS.MAX_CHARACTER_LEVEL) {
      this.state.characterExp = 0;
      return { gainedExp: 0, leveledUp: 0, gainedTraitPoints: 0 };
    }

    this.state.characterExp += expAmount;

    let leveledUp = 0;
    while (this.state.characterLevel < GAME_CONSTANTS.MAX_CHARACTER_LEVEL) {
      const requiredExp = GAME_CONSTANTS.getRequiredExpForLevel(this.state.characterLevel);
      if (this.state.characterExp < requiredExp) {
        break;
      }

      this.state.characterExp -= requiredExp;
      this.state.characterLevel += 1;
      this.state.traitPoints += 1;
      leveledUp += 1;
    }

    if (this.state.characterLevel >= GAME_CONSTANTS.MAX_CHARACTER_LEVEL) {
      this.state.characterLevel = GAME_CONSTANTS.MAX_CHARACTER_LEVEL;
      this.state.characterExp = 0;
    }

    return {
      gainedExp: expAmount,
      leveledUp,
      gainedTraitPoints: leveledUp
    };
  }
  
  /**
   * 게임 틱 (주기적 업데이트)
   * deltaTime: 경과 시간 (초)
   */
  tick(deltaTime = GAME_CONSTANTS.TICK_INTERVAL, realDeltaTime = deltaTime) {
    // 1. 배치된 유닛으로부터 골드 생성 (액트 분리 수입)
    const splitDps = this.getSplitDpsByAct();
    const incomeAct1PerSecond = GAME_CONSTANTS.getActualIncomePerSecondFromDPS(splitDps.act1);
    const incomeAct2PerSecond = GAME_CONSTANTS.getActualIncomePerSecondFromDPS(splitDps.act2) * GAME_CONSTANTS.ACT2_INCOME_MULTIPLIER;
    const incomePerSecond = incomeAct1PerSecond + incomeAct2PerSecond;
    const goldGenerated = incomePerSecond * deltaTime;

    if (!this.state.act2?.unlocked && splitDps.act2 > 0) {
      this.state.act2.unlocked = true;
    }

    // 초보자 튜토리얼 버프: 시작 후 2분간 초당 고정 골드 지급
    let tutorialBonusGold = 0;
    const tutorialState = this.state.tutorial;
    if (tutorialState?.beginnerBuffActive) {
      const durationSec = Math.max(0, Number(tutorialState.beginnerBuffDurationSec) || 0);
      const elapsedSec = Math.max(0, Number(tutorialState.beginnerBuffElapsedSec) || 0);
      const ratePerSec = Math.max(0, Number(tutorialState.beginnerBuffRatePerSec) || 0);
      const remainingSec = Math.max(0, durationSec - elapsedSec);
      const appliedSec = Math.min(Math.max(0, deltaTime), remainingSec);

      if (appliedSec > 0) {
        tutorialBonusGold = ratePerSec * appliedSec;
        tutorialState.beginnerBuffElapsedSec = elapsedSec + appliedSec;
      }

      if ((tutorialState.beginnerBuffElapsedSec || 0) >= durationSec) {
        tutorialState.beginnerBuffActive = false;
      }
    }
    
    this.state.gold += goldGenerated + tutorialBonusGold;
    this.state.totalDamageDealt += (splitDps.act1 + splitDps.act2) * deltaTime;
    this.state.totalGoldEarned += goldGenerated + tutorialBonusGold;
    this.state.playTimeSeconds = (Number(this.state.playTimeSeconds) || 0) + realDeltaTime;
    this.state.totalPlayTimeSeconds = (Number(this.state.totalPlayTimeSeconds) || 0) + realDeltaTime;
    this.state.scaledPlayTimeSeconds = (Number(this.state.scaledPlayTimeSeconds) || 0) + deltaTime;
    this.state.totalScaledPlayTimeSeconds = (Number(this.state.totalScaledPlayTimeSeconds) || 0) + deltaTime;

  }

  /**
   * 배치 유닛 DPS를 액트(1~25 / 26~최대)로 분리 계산
   */
  getSplitDpsByAct() {
    const attackPowerMultiplier = GAME_CONSTANTS.getAttackPowerMultiplier(this.state.traitLevels.attackPowerUpgrade);
    let act1RawDps = 0;
    let act2RawDps = 0;

    for (const [tierKey, count] of Object.entries(this.state.deployed || {})) {
      const tier = Number.parseInt(tierKey, 10);
      const normalizedCount = Number(count) || 0;
      if (!Number.isFinite(tier) || normalizedCount <= 0) {
        continue;
      }

      const unitDps = GAME_CONSTANTS.getDPS(tier) * normalizedCount;
      if (tier >= GAME_CONSTANTS.ACT2_TIER_START) {
        act2RawDps += unitDps;
      } else {
        act1RawDps += unitDps;
      }
    }

    return {
      act1: act1RawDps * attackPowerMultiplier,
      act2: act2RawDps * attackPowerMultiplier
    };
  }

  /**
   * 현재 사냥터 슬롯 한도 계산
   * 기본 슬롯 + 중간보스 보상 슬롯
   */
  getCurrentSlotCap() {
    return this.state.maxSlots;
  }

  /**
   * 현재 보유 기준 최고 단수 계산
   */
  getHighestOwnedTier() {
    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= 1; tier--) {
      const totalOwned = (this.state.inventory[tier] || 0) + (this.state.deployed[tier] || 0);
      if (totalOwned > 0) {
        return tier;
      }
    }
    return 1;
  }

  /**
   * 현재 배치 유닛 수
   */
  getDeployedUnitCount() {
    return Object.values(this.state.deployed || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  /**
   * 현재 인벤토리 유닛 수
   */
  getInventoryUnitCount() {
    return Object.values(this.state.inventory || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  /**
   * 소프트락 복구 가능 여부
   */
  canUseEmergencyRecovery() {
    const normalizedGold = Math.max(0, Math.floor(Number(this.state.gold) || 0));
    return normalizedGold === 0
      && this.getDeployedUnitCount() === 0
      && this.getInventoryUnitCount() === 0;
  }

  /**
   * 소프트락 복구 지급 골드
   * 기본값은 초보자 버프 총합(지급량*지속시간)으로 계산한다.
   */
  getEmergencyRecoveryGold() {
    const beginnerRate = Math.max(0, Number(GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_RATE_PER_SEC) || 0);
    const beginnerDuration = Math.max(0, Number(GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_DURATION_SEC) || 0);
    const beginnerTotal = Math.floor(beginnerRate * beginnerDuration);
    return Math.max(0, beginnerTotal);
  }

  /**
   * 소프트락 복구: 최소 1단 구매 가능 골드 지급
   */
  applyEmergencyRecovery() {
    if (!this.canUseEmergencyRecovery()) {
      return {
        success: false,
        message: '복구 조건을 만족하지 않습니다.',
        gainedGold: 0
      };
    }

    const gainedGold = this.getEmergencyRecoveryGold();
    this.state.gold += gainedGold;
    this.state.totalGoldEarned += gainedGold;

    return {
      success: true,
      message: `${gainedGold} 골드를 지급했습니다.`,
      gainedGold
    };
  }
  
  /**
   * 유닛 구매
   * tier: 구매할 유닛 단계 (기본: 1단)
   * quantity: 구매 수량 (기본: 1)
   */
  buyUnit(tier = 1, quantity = 1) {
    const totalCost = GAME_CONSTANTS.UNIT_COST * quantity;
    
    if (this.state.gold < totalCost) {
      console.warn(`Not enough gold. Need ${totalCost}, have ${this.state.gold}`);
      return false;
    }
    
    this.state.gold -= totalCost;
    this.state.inventory[tier] = (this.state.inventory[tier] || 0) + quantity;
    return true;
  }
  
  /**
   * 사냥터에 유닛 배치
   * tier: 배치할 유닛 단계
   * quantity: 배치할 수량
   */
  deployUnit(tier, quantity = 1) {
    if ((this.state.inventory[tier] || 0) < quantity) {
      console.warn(`Not enough inventory. Need ${quantity}, have ${this.state.inventory[tier]}`);
      return false;
    }

    let deployedCount = Object.values(this.state.deployed).reduce((a, b) => a + b, 0);
    const slotCap = this.getCurrentSlotCap();
    let deployedSucceeded = 0;

    for (let i = 0; i < quantity; i++) {
      if ((this.state.inventory[tier] || 0) < 1) {
        break;
      }

      if (deployedCount < slotCap) {
        this.state.inventory[tier] -= 1;
        this.state.deployed[tier] = (this.state.deployed[tier] || 0) + 1;
        deployedCount += 1;
        deployedSucceeded += 1;
        continue;
      }

      // 슬롯이 꽉 찼다면, 현재 배치된 더 낮은 단수 1기를 해제 후 교체 배치
      let replaceTier = null;
      for (let t = 1; t < tier; t++) {
        if ((this.state.deployed[t] || 0) > 0) {
          replaceTier = t;
          break;
        }
      }

      if (replaceTier === null) {
        break;
      }

      this.state.deployed[replaceTier] -= 1;
      this.state.inventory[replaceTier] = (this.state.inventory[replaceTier] || 0) + 1;

      this.state.inventory[tier] -= 1;
      this.state.deployed[tier] = (this.state.deployed[tier] || 0) + 1;
      deployedSucceeded += 1;
    }

    if (deployedSucceeded < quantity) {
      console.warn(`Could not deploy all units. Deployed ${deployedSucceeded}/${quantity}`);
    }

    return deployedSucceeded === quantity;
  }
  
  /**
   * 사냥터에서 유닛 회수
   * tier: 회수할 유닛 단계
   * quantity: 회수할 수량
   */
  retrieveUnit(tier, quantity = 1) {
    if ((this.state.deployed[tier] || 0) < quantity) {
      console.warn(`Not enough deployed units. Need ${quantity}, have ${this.state.deployed[tier]}`);
      return false;
    }
    
    this.state.deployed[tier] -= quantity;
    this.state.inventory[tier] = (this.state.inventory[tier] || 0) + quantity;
    return true;
  }
  
  /**
   * 강화 시도
    * tier: 강화할 유닛 단계 (tier -> tier+1/+2/+3 진화)
   */
  attemptUpgrade(tier) {
    if (tier < 1 || tier >= GAME_CONSTANTS.MAX_TIER) {
      console.warn(`Cannot upgrade tier ${tier}`);
      return { success: false, newTier: null };
    }

    if (this.getDeployedUnitCount() < 1) {
      console.warn('Cannot upgrade without deployed units');
      return {
        success: false,
        newTier: null,
        reason: 'NO_DEPLOYED_UNITS'
      };
    }
    
    if ((this.state.inventory[tier] || 0) < 1) {
      console.warn(`No tier ${tier} units in inventory`);
      return { success: false, newTier: null };
    }
    
    const baseSuccessRate = GAME_CONSTANTS.UPGRADE_PROBABILITY[tier] || 0;
    const traitBonusEnabled = tier <= 39;
    const plus1TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        this.state.traitLevels.enhanceProbabilityPlus1Upgrade,
        tier
      )
      : 0;
    const plus2TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        this.state.traitLevels.enhanceProbabilityPlus2Upgrade,
        tier
      )
      : 0;
    const plus3TraitBonus = traitBonusEnabled
      ? GAME_CONSTANTS.getEnhanceProbabilityBonus(
        this.state.traitLevels.enhanceProbabilityPlus3Upgrade,
        tier
      )
      : 0;
    const capRate = Math.max(0, Number(GAME_CONSTANTS.getEnhanceProbabilityCap(tier)) || 0);

    // +1 기준확률, +2는 기준의 1/10, +3은 기준의 1/100
    // 각 특성은 해당 단계(+1/+2/+3)에만 독립적으로 영향을 준다.
    const basePlus1Rate = Math.max(0, Math.min(Math.min(baseSuccessRate, capRate), 1 / 1.11));
    const basePlus2Rate = basePlus1Rate * 0.1;
    const basePlus3Rate = basePlus1Rate * 0.01;

    let rawPlus1Rate = Math.max(0, basePlus1Rate + plus1TraitBonus);
    let rawPlus2Rate = Math.max(0, basePlus2Rate + plus2TraitBonus);
    let rawPlus3Rate = Math.max(0, basePlus3Rate + plus3TraitBonus);

    // 35단: +3강은 발생하지 않고 +1강으로 편입
    if (tier === 35) {
      rawPlus1Rate += rawPlus3Rate;
      rawPlus3Rate = 0;
    }

    // 36단 이상: +1강만 발생, +2/+3은 모두 +1강으로 편입
    if (tier >= 36) {
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

    const roll = Math.random();
    const plus3Threshold = plus3Rate;
    const plus2Threshold = plus3Threshold + plus2Rate;
    const plus1Threshold = plus2Threshold + plus1Rate;
    
    // 소비 (성공/실패 모두 소비)
    this.state.inventory[tier] -= 1;

    let tierGain = 0;
    if (roll < plus3Threshold) {
      tierGain = 3;
    } else if (roll < plus2Threshold) {
      tierGain = 2;
    } else if (roll < plus1Threshold) {
      tierGain = 1;
    }

    if (tierGain > 0) {
      const newTier = Math.min(GAME_CONSTANTS.MAX_TIER, tier + tierGain);
      this.state.inventory[newTier] = (this.state.inventory[newTier] || 0) + 1;
      return { success: true, newTier };
    } else {
      return { success: false, newTier: null };
    }
  }

  /**
   * 5단 이상 유닛 판매
   * tier: 판매할 유닛 단계
   * quantity: 판매 수량
   */
  sellUnit(tier, quantity = 1) {
    if (tier < GAME_CONSTANTS.MIN_SELL_TIER || tier > GAME_CONSTANTS.MAX_TIER) {
      console.warn(`Tier ${tier} cannot be sold`);
      return {
        success: false,
        reason: 'INVALID_TIER',
        sold: 0,
        gainedExp: 0,
        leveledUp: 0,
        gainedTraitPoints: 0
      };
    }

    if (quantity < 1 || (this.state.inventory[tier] || 0) < quantity) {
      console.warn(`Not enough tier ${tier} inventory to sell`);
      return {
        success: false,
        reason: 'NOT_ENOUGH_INVENTORY',
        sold: 0,
        gainedExp: 0,
        leveledUp: 0,
        gainedTraitPoints: 0
      };
    }

    const requiresSellTicket = tier >= GAME_CONSTANTS.SELL_TICKET_REQUIRED_TIER_START;
    if (requiresSellTicket) {
      const requiredTicket = Math.max(1, Math.floor((GAME_CONSTANTS.SELL_TICKET_COST_PER_UNIT || 1) * quantity));
      const currentTicket = Math.max(0, Math.floor(Number(this.state.sellTicket) || 0));
      if (currentTicket < requiredTicket) {
        return {
          success: false,
          reason: 'SELL_TICKET_REQUIRED',
          requiredTicket,
          currentTicket,
          sold: 0,
          gainedExp: 0,
          leveledUp: 0,
          gainedTraitPoints: 0
        };
      }
      this.state.sellTicket = currentTicket - requiredTicket;
    }

    const expPerUnit = GAME_CONSTANTS.getSellExpByTier(tier);
    const totalExp = Math.floor(expPerUnit * quantity);

    this.state.inventory[tier] -= quantity;
    const levelUpResult = this.addCharacterExp(totalExp);

    return {
      success: true,
      sold: quantity,
      gainedExp: levelUpResult.gainedExp,
      leveledUp: levelUpResult.leveledUp,
      gainedTraitPoints: levelUpResult.gainedTraitPoints
    };
  }

  /**
   * 고단위 유닛 직접 구매 (골드 소모)
    * tier: 구매할 유닛 단계 (4, 7, 10, 14 지원)
   * quantity: 구매 수량
   */
  buyHighTierUnit(tier, quantity = 1) {
    if (!GAME_CONSTANTS.HIGH_TIER_PURCHASE_PRICES[tier]) {
      console.warn(`Tier ${tier} cannot be purchased directly`);
      return {
        success: false,
        purchased: 0,
        totalCost: 0,
        message: `${tier}단은 직접 구매할 수 없습니다.`
      };
    }

    const pricePerUnit = GAME_CONSTANTS.HIGH_TIER_PURCHASE_PRICES[tier];
    const totalCost = pricePerUnit * quantity;

    if (this.state.gold < totalCost) {
      console.warn(`Not enough gold. Need ${totalCost}, have ${this.state.gold}`);
      return {
        success: false,
        purchased: 0,
        totalCost,
        message: `골드가 부족합니다. 필요: ${totalCost}, 보유: ${Math.floor(this.state.gold)}`
      };
    }

    this.state.gold -= totalCost;
    this.state.inventory[tier] = (this.state.inventory[tier] || 0) + quantity;

    return {
      success: true,
      purchased: quantity,
      totalCost,
      message: `${tier}단 ${quantity}개를 ${totalCost} 골드에 구매했습니다.`
    };
  }

  /**
   * 특성포인트를 정 소비
    * traitType: GAME_CONSTANTS.TRAIT_SYSTEMS 키
   * levels: 업글 레벨 수
   */
  spendTraitPoints(traitType, levels = 1) {
    if (!GAME_CONSTANTS.TRAIT_SYSTEMS[traitType]) {
      console.warn(`Unknown trait type: ${traitType}`);
      return false;
    }

    const trait = GAME_CONSTANTS.TRAIT_SYSTEMS[traitType];
    const normalizedLevels = Math.max(1, Math.floor(Number(levels) || 1));
    const requiredPoints = trait.cost * normalizedLevels;
    const currentPoints = Math.max(0, Math.floor(Number(this.state.traitPoints) || 0));

    if (currentPoints < requiredPoints) {
      console.warn(`Not enough trait points. Need ${requiredPoints}, have ${currentPoints}`);
      return false;
    }

    const currentLevel = Math.max(0, Math.floor(Number(this.state.traitLevels[traitType]) || 0));
    if (currentLevel + normalizedLevels > trait.maxLevel) {
      console.warn(`Cannot exceed max level ${trait.maxLevel} for ${traitType}`);
      return false;
    }

    this.state.traitPoints = currentPoints - requiredPoints;
    this.state.traitLevels[traitType] = currentLevel + normalizedLevels;
    return true;
  }

  /**
   * 특성 리셋
    * traitType: GAME_CONSTANTS.TRAIT_SYSTEMS 키
   * 현재 레벨만큼 포인트 환불
   */
  resetTrait(traitType) {
    if (!GAME_CONSTANTS.TRAIT_SYSTEMS[traitType]) {
      console.warn(`Unknown trait type: ${traitType}`);
      return {
        success: false,
        message: `알 수 없는 특성입니다.`
      };
    }

    const currentLevel = Math.max(0, Math.floor(Number(this.state.traitLevels[traitType]) || 0));
    if (currentLevel === 0) {
      return {
        success: false,
        message: `이미 리셋된 상태입니다.`
      };
    }

    const trait = GAME_CONSTANTS.TRAIT_SYSTEMS[traitType];
    const refundPoints = currentLevel * trait.cost;

    const currentPoints = Math.max(0, Math.floor(Number(this.state.traitPoints) || 0));
    this.state.traitLevels[traitType] = 0;
    this.state.traitPoints = currentPoints + refundPoints;

    return {
      success: true,
      message: `${trait.name}을 리셋했습니다. ${refundPoints}P 환불`,
      refundPoints
    };
  }

  /**
   * 1차/2차 환생 전용 리셋
   * 유지: 레벨/경험치/특성/튜토리얼/누적 시간
   * 리셋: 골드/유닛/런 시간/런 누적치/중간보스 등 진행값
   */
  performMilestoneRebirth() {
    const preservedLevel = Math.max(1, Math.floor(Number(this.state.characterLevel) || 1));
    const preservedExp = Math.max(0, Math.floor(Number(this.state.characterExp) || 0));
    const preservedTraitPoints = Math.max(0, Math.floor(Number(this.state.traitPoints) || 0));
    const preservedTraitLevels = {
      ...initGameState().traitLevels,
      ...(this.state.traitLevels || {})
    };
    const preservedTutorial = {
      ...initGameState().tutorial,
      ...(this.state.tutorial || {})
    };
    const preservedTotalPlayTime = Number(this.state.totalPlayTimeSeconds) || 0;
    const preservedTotalScaledPlayTime = Number(this.state.totalScaledPlayTimeSeconds) || 0;

    const freshState = initGameState();
    freshState.characterLevel = Math.min(preservedLevel, GAME_CONSTANTS.MAX_CHARACTER_LEVEL);
    freshState.characterExp = freshState.characterLevel >= GAME_CONSTANTS.MAX_CHARACTER_LEVEL
      ? 0
      : preservedExp;
    freshState.traitPoints = preservedTraitPoints;
    freshState.traitLevels = preservedTraitLevels;
    freshState.tutorial = preservedTutorial;
    // 환생 직후에도 초보자 골드 버프는 다시 시작되도록 보장
    freshState.tutorial.beginnerBuffActive = true;
    freshState.tutorial.beginnerBuffElapsedSec = 0;
    freshState.tutorial.beginnerBuffDurationSec = GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_DURATION_SEC;
    freshState.tutorial.beginnerBuffRatePerSec = GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_RATE_PER_SEC;
    freshState.totalPlayTimeSeconds = preservedTotalPlayTime;
    freshState.totalScaledPlayTimeSeconds = preservedTotalScaledPlayTime;

    this.autoSaveSuspended = true;
    this.observableProxyCache = new WeakMap();
    this.state = this.makeObservableState(freshState);
    this.autoSaveSuspended = false;
    this.requestAutoSave();

    return {
      success: true,
      message: '환생 완료! 진행값이 초기화되었습니다.'
    };
  }

  /**
   * 최상위 고단 유닛부터 배치
   * 사냥터 슬롯을 효율적으로 활용
   */
  autoOptimizeDeploy() {
    // 현재 배치된 1단 유닛 모두 회수
    this.retrieveUnit(1, this.state.deployed[1]);
    
    // 최상위 단부터 배치
    let slotsRemaining = this.getCurrentSlotCap();
    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= 1 && slotsRemaining > 0; tier--) {
      const available = this.state.inventory[tier] || 0;
      const toDeploy = Math.min(available, slotsRemaining);
      if (toDeploy > 0) {
        this.deployUnit(tier, toDeploy);
        slotsRemaining -= toDeploy;
      }
    }
  }

  /**
   * 중간보스 도전에 사용될 상위 클론 유닛 계산
   */
  getMidBossCloneUnits(limit = GAME_CONSTANTS.MID_BOSS_CLONE_COUNT) {
    const clones = [];

    for (let tier = GAME_CONSTANTS.MAX_TIER; tier >= 1 && clones.length < limit; tier--) {
      const totalOwned = (this.state.inventory[tier] || 0) + (this.state.deployed[tier] || 0);
      if (totalOwned < 1) {
        continue;
      }

      const cloneCount = Math.min(totalOwned, limit - clones.length);
      for (let i = 0; i < cloneCount; i++) {
        clones.push({ tier, baseDps: GAME_CONSTANTS.getDPS(tier) });
      }
    }

    return clones;
  }

  /**
   * 중간보스 도전 스냅샷
   */
  getMidBossChallengeSnapshot() {
    const level = this.state.midBoss?.level || 0;
    const maxChallenges = GAME_CONSTANTS.MID_BOSS_MAX_CHALLENGES;
    const isCompleted = level >= maxChallenges;
    const dpsCut = GAME_CONSTANTS.getMidBossDpsCut(level);
    const attackPowerMultiplier = GAME_CONSTANTS.getAttackPowerMultiplier(this.state.traitLevels.attackPowerUpgrade || 0);
    const clones = this.getMidBossCloneUnits();
    const cloneTotalDps = clones.reduce((sum, clone) => sum + (clone.baseDps * attackPowerMultiplier), 0);

    return {
      level,
      maxChallenges,
      remainingChallenges: Math.max(0, maxChallenges - level),
      isCompleted,
      canChallenge: clones.length > 0 && !isCompleted,
      dpsCut,
      cloneTotalDps,
      durationSec: GAME_CONSTANTS.MID_BOSS_CHALLENGE_DURATION,
      clones: clones.map((clone) => ({
        tier: clone.tier,
        dps: Number((clone.baseDps * attackPowerMultiplier).toFixed(2))
      }))
    };
  }

  /**
   * 중간보스 도전 결과 확정
   */
  resolveMidBossChallenge(averageDps) {
    const snapshot = this.getMidBossChallengeSnapshot();
    if (snapshot.isCompleted) {
      return {
        success: false,
        reason: '중간보스 보상을 모두 획득했습니다. (완료)',
        ...snapshot,
        averageDps: Number(averageDps.toFixed(2))
      };
    }

    if (snapshot.clones.length < 1) {
      return {
        success: false,
        reason: '중간보스에 출전할 유닛이 부족합니다.',
        ...snapshot,
        averageDps: Number(averageDps.toFixed(2))
      };
    }

    const normalizedAverageDps = Number(Math.max(0, averageDps).toFixed(2));
    const success = normalizedAverageDps >= snapshot.dpsCut;

    let slotReward = 0;
    if (success) {
      this.state.midBoss.level += 1;
      slotReward = GAME_CONSTANTS.MID_BOSS_SLOT_REWARD_PER_CLEAR;
      this.state.maxSlots += slotReward;
    }

    const newLevel = this.state.midBoss.level || 0;
    const completed = newLevel >= GAME_CONSTANTS.MID_BOSS_MAX_CHALLENGES;

    this.state.midBoss.lastResult = {
      success,
      averageDps: normalizedAverageDps,
      dpsCut: snapshot.dpsCut,
      slotReward,
      completed,
      timestamp: Date.now()
    };

    return {
      success,
      averageDps: normalizedAverageDps,
      dpsCut: snapshot.dpsCut,
      slotReward,
      newLevel,
      completed
    };
  }
  
  /**
   * 오프라인 보상 계산
   * offlineSeconds: 오프라인 시간 (초)
   */
  getOfflineReward(offlineSeconds) {
    // 최대 오프라인 시간 제한
    const cappedSeconds = Math.min(offlineSeconds, GAME_CONSTANTS.MAX_OFFLINE_TIME);

    // 현재 배치 상태를 기준으로 액트 분리 수입을 적용
    const estimatedIncomePerSecond = this.getState().currentIncomePerSecond;
    const reward = estimatedIncomePerSecond * cappedSeconds * GAME_CONSTANTS.OFFLINE_REWARD_MULTIPLIER;
    
    return Math.floor(reward);
  }
  
  /**
   * 오프라인 보상 적용
   * offlineSeconds: 오프라인 시간 (초)
   */
  applyOfflineReward(offlineSeconds) {
    const reward = this.getOfflineReward(offlineSeconds);
    this.state.gold += reward;
    this.state.totalGoldEarned += reward;
    this.state.offlineGoldGenerated = reward;
    return reward;
  }
  
  /**
   * 게임 상태 스냅샷 반환
   */
  getState() {
    const splitDps = this.getSplitDpsByAct();
    const totalDps = splitDps.act1 + splitDps.act2;
    const currentIncomeMultiplier = GAME_CONSTANTS.getIncomeMultiplierFromDPS(splitDps.act1);
    const incomeAct1PerSecond = GAME_CONSTANTS.getActualIncomePerSecondFromDPS(splitDps.act1);
    const incomeAct2PerSecond = GAME_CONSTANTS.getActualIncomePerSecondFromDPS(splitDps.act2) * GAME_CONSTANTS.ACT2_INCOME_MULTIPLIER;
    const currentIncomePerSecond = incomeAct1PerSecond + incomeAct2PerSecond;
    const nextIncomeThreshold = GAME_CONSTANTS.getNextIncomeThreshold(splitDps.act1);
    const requiredExpForNextLevel = this.state.characterLevel >= GAME_CONSTANTS.MAX_CHARACTER_LEVEL
      ? 0
      : GAME_CONSTANTS.getRequiredExpForLevel(this.state.characterLevel);

    return {
      ...this.state,
      currentDPS: totalDps,
      currentDPSPrimary: splitDps.act1,
      currentDPSSecondary: splitDps.act2,
      currentIncomeMultiplier,
      currentIncomePerSecond,
      currentIncomePerSecondAct1: incomeAct1PerSecond,
      currentIncomePerSecondAct2: incomeAct2PerSecond,
      nextIncomeThreshold,
      requiredExpForNextLevel,
      slotCap: this.getCurrentSlotCap(),
      midBossCurrentDpsCut: GAME_CONSTANTS.getMidBossDpsCut(this.state.midBoss?.level || 0),
      deployedCount: this.getDeployedUnitCount(),
      inventoryCount: this.getInventoryUnitCount(),
      emergencyRecoveryAvailable: this.canUseEmergencyRecovery()
    };
  }
  
  /**
   * 게임 상태 저장 (LocalStorage)
   */
  save() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    const savedAt = Date.now();
    try {
      const serializableState = this.toSerializable(this.state);
      localStorage.setItem('dpsforge_gamestate', JSON.stringify(serializableState));
      localStorage.setItem('dpsforge_lastsave', savedAt.toString());
      this.lastSavedAt = savedAt;
      this.autoSavePending = false;
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  }
  
  /**
   * 게임 상태 로드 (LocalStorage)
   */
  load() {
    const saved = localStorage.getItem('dpsforge_gamestate');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const parsedRebirth = parsed?.rebirth;
        const { rebirth: _unusedRebirth, ...parsedWithoutRebirth } = parsed || {};
        void _unusedRebirth;
        const initialState = initGameState();
        const parsedTraitLevels = parsedWithoutRebirth.traitLevels || {};
        const {
          autoBuySpeedUpgrade,
          autoUpgradeSpeedUpgrade,
          autoSellSpeedUpgrade,
          enhanceProbabilityUpgrade: legacyEnhanceProbabilityUpgrade,
          automationSpeedUpgrade: removedAutomationSpeedUpgrade,
          slotCapacityUpgrade: removedSlotCapacityUpgrade,
          ...restTraitLevels
        } = parsedTraitLevels;
        const legacyAutomationTotal = [
          autoBuySpeedUpgrade,
          autoUpgradeSpeedUpgrade,
          autoSellSpeedUpgrade
        ].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
        const removedAutomationLevel = Math.max(
          0,
          Math.floor(
            Number.isFinite(removedAutomationSpeedUpgrade)
              ? removedAutomationSpeedUpgrade
              : legacyAutomationTotal
          )
        );
        const removedSlotLevel = Math.max(0, Math.floor(removedSlotCapacityUpgrade || 0));
        const legacyEnhanceLevel = Math.max(0, Math.floor(legacyEnhanceProbabilityUpgrade || 0));
        const enhancePlus1Level = Number.isFinite(restTraitLevels.enhanceProbabilityPlus1Upgrade)
          ? Math.max(0, Math.floor(restTraitLevels.enhanceProbabilityPlus1Upgrade || 0))
          : Math.min(
            GAME_CONSTANTS.TRAIT_SYSTEMS.enhanceProbabilityPlus1Upgrade.maxLevel,
            legacyEnhanceLevel
          );
        const refundedRemovedTraitPoints = (removedAutomationLevel * 2) + (removedSlotLevel * 1);
        const mergedState = {
          ...initialState,
          ...parsedWithoutRebirth,
          traitPoints: (Number.isFinite(parsedWithoutRebirth.traitPoints) ? parsedWithoutRebirth.traitPoints : initialState.traitPoints) + refundedRemovedTraitPoints,
          maxSlots: Number.isFinite(parsedWithoutRebirth.maxSlots) ? parsedWithoutRebirth.maxSlots : initialState.maxSlots,
          inventory: {
            ...initialState.inventory,
            ...(parsedWithoutRebirth.inventory || {})
          },
          deployed: {
            ...initialState.deployed,
            ...(parsedWithoutRebirth.deployed || {})
          },
          traitLevels: {
            ...initialState.traitLevels,
            ...restTraitLevels,
            enhanceProbabilityPlus1Upgrade: enhancePlus1Level
          },
          midBoss: {
            ...initialState.midBoss,
            ...(parsedWithoutRebirth.midBoss || {})
          },
          rebirth: {
            ...initialState.rebirth,
            ...(parsedRebirth && typeof parsedRebirth === 'object' ? parsedRebirth : {}),
            rewards: {
              ...initialState.rebirth.rewards,
              ...(parsedRebirth?.rewards && typeof parsedRebirth.rewards === 'object' ? parsedRebirth.rewards : {})
            }
          },
          tutorial: {
            ...(parsedWithoutRebirth && typeof parsedWithoutRebirth.tutorial === 'object'
              ? { ...initialState.tutorial, ...parsedWithoutRebirth.tutorial }
              : { ...initialState.tutorial, enabled: false, completed: true, beginnerBuffActive: false })
          }
        };

        const mergedGold = Math.max(0, Math.floor(Number(mergedState.gold) || 0));
        const mergedInventoryCount = Object.values(mergedState.inventory || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
        const mergedDeployedCount = Object.values(mergedState.deployed || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
        const tutorialState = mergedState.tutorial || {};
        const buffElapsed = Math.max(0, Number(tutorialState.beginnerBuffElapsedSec) || 0);
        const buffDuration = Math.max(0, Number(tutorialState.beginnerBuffDurationSec) || 0);
        const buffRate = Math.max(0, Number(tutorialState.beginnerBuffRatePerSec) || 0);
        const hasTutorialIncome = Boolean(tutorialState.beginnerBuffActive) && buffRate > 0 && buffElapsed < buffDuration;
        const isHardSoftLocked = mergedGold === 0 && mergedInventoryCount === 0 && mergedDeployedCount === 0 && !hasTutorialIncome;

        if (isHardSoftLocked) {
          const rescueGold = this.getEmergencyRecoveryGold();
          mergedState.gold += rescueGold;
          mergedState.totalGoldEarned += rescueGold;
        }

        this.autoSaveSuspended = true;
        this.observableProxyCache = new WeakMap();
        this.state = this.makeObservableState(mergedState);
        this.autoSaveSuspended = false;

        if (this.autoSaveTimer) {
          clearTimeout(this.autoSaveTimer);
          this.autoSaveTimer = null;
        }
        this.autoSavePending = false;
        return true;
      } catch (error) {
        this.autoSaveSuspended = false;
        console.error('Failed to load game state:', error);
        return false;
      }
    }
    return false;
  }
  
  /**
   * 오프라인 시간 계산 및 보상 적용
   */
  handleGameRestore() {
    const lastSave = localStorage.getItem('dpsforge_lastsave');
    if (!lastSave) return 0;
    
    const now = Date.now();
    const lastSaveTime = parseInt(lastSave);
    const offlineSeconds = (now - lastSaveTime) / 1000;
    
    if (offlineSeconds > 10) {  // 10초 이상만 오프라인으로 간주
      return this.applyOfflineReward(offlineSeconds);
    }
    return 0;
  }
}

// 글로벌 게임 인스턴스
let gameEngine = new GameEngine();
