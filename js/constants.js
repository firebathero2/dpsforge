/**
 * DPS Forge - Game Constants
 * 모든 게임 밸런스 파라미터를 여기에 정의
 */

const GAME_CONSTANTS = {
  MAX_TIER: 40,
  MIN_SELL_TIER: 15,
  ACT2_TIER_START: 26,
  ACT2_INCOME_MULTIPLIER: 100000,

  // 기본 리소스
  STARTING_GOLD: 0,
  UNIT_COST: 1500,
  
  // 사냥터 (Hunting Ground)
  SLOT_CAP: 10,
  MAX_SLOTS_INITIAL: 10,

  // 중간보스 시스템
  MID_BOSS_CLONE_COUNT: 5,
  MID_BOSS_CHALLENGE_DURATION: 3,
  MID_BOSS_BASE_DPS_CUT: 10,
  MID_BOSS_DPS_CUT_GROWTH: 2,
  MID_BOSS_MAX_CHALLENGES: 8,
  MID_BOSS_SLOT_REWARD_PER_CLEAR: 5,
  
  // 고단위 유닛 직접 구매 가격 (하위 자동구매 기준 50% 추가 프리미엄)
  HIGH_TIER_PURCHASE_PRICES: {
    7: 40000,
    11: 700000,
    15: 8000000,
    18: 100000000,
    20: 600000000,
    22: 3500000000,
    24: 20000000000,
    26: 100000000000,
    28: 600000000000,
    30: 3500000000000,
    32: 20000000000000,
    34: 120000000000000,
    36: 800000000000000,
  },
  
  // 유닛 사양 (1~40단)
  // attackSpeed는 "초"가 아닌 "회/초" 기준
  UNIT_SPECS: {
    1: { attackPower: 1, attackSpeed: 1.0 },
    2: { attackPower: 10, attackSpeed: 0.4528301887 },
    3: { attackPower: 20, attackSpeed: 0.4528301887 },
    4: { attackPower: 20, attackSpeed: 0.6 },
    5: { attackPower: 30, attackSpeed: 0.6 },
    6: { attackPower: 50, attackSpeed: 0.6 },
    7: { attackPower: 80, attackSpeed: 0.6 },
    8: { attackPower: 40, attackSpeed: 1.358490566 },
    9: { attackPower: 80, attackSpeed: 1.2 },
    10: { attackPower: 250, attackSpeed: 0.6 },
    11: { attackPower: 250, attackSpeed: 0.9056603774 },
    12: { attackPower: 400, attackSpeed: 0.6 },
    13: { attackPower: 550, attackSpeed: 0.6 },
    14: { attackPower: 1000, attackSpeed: 0.4528301887 },
    15: { attackPower: 1300, attackSpeed: 0.4528301887 },
    16: { attackPower: 1000, attackSpeed: 0.6 },
    17: { attackPower: 1300, attackSpeed: 0.6 },
    18: { attackPower: 1800, attackSpeed: 0.6 },
    19: { attackPower: 600, attackSpeed: 1.8461538462 },
    20: { attackPower: 2000, attackSpeed: 1.0 },
    21: { attackPower: 2700, attackSpeed: 1.0 },
    22: { attackPower: 3500, attackSpeed: 1.0 },
    23: { attackPower: 5000, attackSpeed: 1.0 },
    24: { attackPower: 6500, attackSpeed: 1.0 },
    25: { attackPower: 5000, attackSpeed: 1.8461538462 },
    26: { attackPower: 10, attackSpeed: 1.0 },
    27: { attackPower: 30, attackSpeed: 0.6 },
    28: { attackPower: 20, attackSpeed: 1.0 },
    29: { attackPower: 30, attackSpeed: 1.0 },
    30: { attackPower: 100, attackSpeed: 0.6 },
    31: { attackPower: 80, attackSpeed: 1.0 },
    32: { attackPower: 150, attackSpeed: 1.0 },
    33: { attackPower: 700, attackSpeed: 0.4528301887 },
    34: { attackPower: 350, attackSpeed: 1.0 },
    35: { attackPower: 1200, attackSpeed: 0.6 },
    36: { attackPower: 1500, attackSpeed: 1.8 },
    37: { attackPower: 2000, attackSpeed: 1.0 },
    38: { attackPower: 4000, attackSpeed: 1.0 },
    39: { attackPower: 3500, attackSpeed: 1.8461538462 },
    40: { attackPower: 4000, attackSpeed: 3.4285714286 },
  },
  
  // 강화 성공 확률 (tier -> tier+1), 40단은 최종단으로 강화 불가
  UPGRADE_PROBABILITY: {
    1: 0.60,
    2: 0.60,
    3: 0.575,
    4: 0.543,
    5: 0.50,
    6: 0.50,
    7: 0.50,
    8: 0.50,
    9: 0.47,
    10: 0.465,
    11: 0.463,
    12: 0.452,
    13: 0.45,
    14: 0.45,
    15: 0.44,
    16: 0.44,
    17: 0.44,
    18: 0.43,
    19: 0.42,
    20: 0.38,
    21: 0.38,
    22: 0.36,
    23: 0.36,
    24: 0.35,
    25: 0.30,
    26: 0.25,
    27: 0.25,
    28: 0.25,
    29: 0.25,
    30: 0.25,
    31: 0.25,
    32: 0.20,
    33: 0.20,
    34: 0.20,
    35: 0.20,
    36: 0.16,
    37: 0.12,
    38: 0.10,
    39: 0.05,
  },
  
  // 데미지-골드 변환
  DAMAGE_TO_GOLD_RATIO: 1.0,  // 1 damage = 1 gold
  
  // 오프라인 보상
  OFFLINE_REWARD_MULTIPLIER: 1.0,  // 100% of estimated earnings
  MAX_OFFLINE_TIME: 8 * 60 * 60,  // 8 hours in seconds
  
  // UI 업데이트 틱
  TICK_INTERVAL: 0.1,  // 100ms per tick

  // 자동 저장 최소 간격 (상태 변경 감지 기반)
  AUTO_SAVE_INTERVAL_MS: 3000,
  TUTORIAL_BEGINNER_GOLD_RATE_PER_SEC: 600,
  TUTORIAL_BEGINNER_GOLD_DURATION_SEC: 60,

  // 캐릭터 성장
  MAX_CHARACTER_LEVEL: 10000,

  // 자동화 기본 속도 (초당 시도 횟수)
  AUTO_BASE_ACTIONS_PER_SEC: 25,

  // 환생 시스템 (현재는 기능 비활성 유지)
  REBIRTH_ENABLED: false,
  REBIRTH_TEMP_DISABLED_MESSAGE: '환생 시스템은 현재 비활성화 상태입니다. 추후 업데이트에서 다시 오픈될 예정입니다.',
  REBIRTH_UNLOCK_TIER: 10,
  REBIRTH_POINT_NAME: '환생 포인트',
  REBIRTH_REWARDS: {
    automationStartPass: {
      name: '자동화 개시 패스',
      maxLevel: 5,
      costs: [1, 2, 3, 5, 8]
    },
    trainingManual: {
      name: '훈련 교본',
      maxLevel: 5,
      costs: [1, 2, 4, 6, 10]
    },
    breakthroughMemory: {
      name: '돌파 기억',
      maxLevel: 5,
      costs: [1, 4, 7, 10, 13]
    },
    vanguardGrant: {
      name: '선발대 지급',
      maxLevel: 5,
      costs: [1, 2, 4, 7, 11]
    },
    pioneerSlots: {
      name: '개척자 슬롯',
      maxLevel: 5,
      costs: [1, 3, 5, 8, 13]
    }
  },


  // 판매 경험치 (15단부터 판매 가능)
  SELL_EXP_BY_TIER: {
    15: 1,
    16: 2,
    17: 5,
    18: 10,
    19: 15,
    20: 27,
    21: 45,
    22: 80,
    23: 160,
    24: 335,
    25: 750,
    26: 7500,
    27: 10500,
    28: 18750,
    29: 30000,
    30: 51000,
    31: 94000,
    32: 150000,
    33: 250000,
    34: 500000,
    35: 800000,
    36: 2500000,
    37: 4000000,
    38: 6000000,
    39: 10000000,
    40: 25000000
  },

  // 특성 시스템
  TRAIT_SYSTEMS: {
    attackPowerUpgrade: {
      name: '공격력 업글',
      cost: 4,
      maxLevel: 50,
      description: '최종 공격력 배수 +10%p/레벨'
    },
    enhanceProbabilityPlus1Upgrade: {
      name: '+1강 강화확률 증가',
      cost: 2,
      maxLevel: 100,
      description: '+1강 강화확률 +0.1%p'
    },
    enhanceProbabilityPlus2Upgrade: {
      name: '+2강 강화확률 증가',
      cost: 40,
      maxLevel: 50,
      description: '+2강 강화확률 +0.1%p'
    },
    enhanceProbabilityPlus3Upgrade: {
      name: '+3강 강화확률 증가',
      cost: 200,
      maxLevel: 30,
      description: '+3강 강화확률 +0.1%p'
    }
  },

  // 공격력 배수 계산 (레벨당 +10%)
  getAttackPowerMultiplier(upgradeLevel) {
    const baseMultiplier = 1 + (Math.max(0, Math.floor(upgradeLevel || 0)) * 0.1);
    return baseMultiplier;
  },

  // 강화확률 보너스 계산 (+0.1%p = +0.001, 1~39단만 적용)
  getEnhanceProbabilityBonus(upgradeLevel, targetTier = 1) {
    if (Math.max(1, Math.floor(targetTier || 1)) > 39) {
      return 0;
    }
    return upgradeLevel * 0.001;
  },

  // 단수별 강화확률 상한 (1~10단은 100% 허용)
  getEnhanceProbabilityCap(tier) {
    if (tier <= 10) return 1.0;
    if (tier <= 20) return 0.9;
    return 0.8;
  },

  // DPS 계산 헬퍼 (공격력 × 회/초)
  getDPS(tier) {
    if (!this.UNIT_SPECS[tier]) return 0;
    return this.UNIT_SPECS[tier].attackPower * this.UNIT_SPECS[tier].attackSpeed;
  },
  
  getDPSFromDeployed(deployed) {
    let totalDPS = 0;
    for (const [tier, count] of Object.entries(deployed)) {
      totalDPS += count * this.getDPS(parseInt(tier));
    }
    return totalDPS;
  },

  // 수입 배율: DPS가 10의 거듭제곱 구간을 넘을 때마다 2배 누적
  getIncomeMultiplierFromDPS(dps) {
    if (dps < 10) return 1;
    const level = Math.max(0, Math.floor(Math.log10(dps)));
    return 2 ** level;
  },

  // 실제 초당 수입 = DPS * 데미지-골드 비율 * 수입 배율
  getActualIncomePerSecondFromDPS(dps) {
    return dps * this.DAMAGE_TO_GOLD_RATIO * this.getIncomeMultiplierFromDPS(dps);
  },

  // 다음 수입 배율 구간의 DPS 목표
  getNextIncomeThreshold(dps) {
    if (dps < 1) return 10;
    const level = Math.max(0, Math.floor(Math.log10(dps)));
    return 10 ** (level + 1);
  },

  // 레벨 x -> x+1 요구 경험치
  getRequiredExpForLevel(level) {
    const clampedLevel = Math.max(1, Math.floor(level));
    return (clampedLevel * clampedLevel) - clampedLevel + 5;
  },

  // 단수 판매 시 획득 경험치
  getSellExpByTier(tier) {
    return this.SELL_EXP_BY_TIER[tier] || 0;
  },

  // 환생 시 획득 환생 포인트 계산
  getRebirthPointsFromTier(maxTierReached) {
    const tier = Math.max(1, Math.floor(Number(maxTierReached) || 1));
    if (tier < this.REBIRTH_UNLOCK_TIER) {
      return 0;
    }
    return Math.max(0, tier - this.REBIRTH_UNLOCK_TIER + 1);
  },

  // 환생 보상 다음 레벨 비용
  getRebirthRewardCost(rewardKey, currentLevel) {
    const rewardMeta = this.REBIRTH_REWARDS?.[rewardKey];
    if (!rewardMeta) {
      return null;
    }

    const level = Math.max(0, Math.floor(Number(currentLevel) || 0));
    if (level >= rewardMeta.maxLevel) {
      return null;
    }

    const costs = rewardMeta.costs || [];
    return Number.isFinite(costs[level]) ? costs[level] : null;
  },

  // 중간보스 레벨별 DPS 컷
  getMidBossDpsCut(level) {
    const normalizedLevel = Math.max(0, Math.floor(level));
    const fixedCuts = [90, 200, 360, 650, 1200, 2100, 3800, 6800];

    if (normalizedLevel < fixedCuts.length) {
      return fixedCuts[normalizedLevel];
    }

    const dpsCut = this.MID_BOSS_BASE_DPS_CUT * (this.MID_BOSS_DPS_CUT_GROWTH ** normalizedLevel);
    return Number(dpsCut.toFixed(2));
  },
  
  // 누적 강화 필요 1단 유닛 계산
  getTier1CostToReach(targetTier) {
    if (targetTier < 1) return 0;
    const costs = { 1: 1 };
    for (let t = 2; t <= targetTier; t++) {
      costs[t] = costs[t - 1] * 2 + costs[t - 1];
    }
    return costs[targetTier];
  }
};

// 게임 상태 초기화 헬퍼
function initGameState() {
  const emptyTierCounts = Object.fromEntries(
    Array.from({ length: GAME_CONSTANTS.MAX_TIER }, (_, i) => [i + 1, 0])
  );

  return {
    gold: GAME_CONSTANTS.STARTING_GOLD,
    inventory: { ...emptyTierCounts },
    deployed: { ...emptyTierCounts },
    totalDamageDealt: 0,
    totalGoldEarned: 0,
    playTimeSeconds: 0,
    totalPlayTimeSeconds: 0,
    scaledPlayTimeSeconds: 0,
    totalScaledPlayTimeSeconds: 0,
    characterLevel: 1,
    characterExp: 0,
    traitPoints: 0,
    maxSlots: GAME_CONSTANTS.MAX_SLOTS_INITIAL,
    traitLevels: {
      attackPowerUpgrade: 0,
      enhanceProbabilityPlus1Upgrade: 0,
      enhanceProbabilityPlus2Upgrade: 0,
      enhanceProbabilityPlus3Upgrade: 0
    },
    midBoss: {
      level: 0,
      lastResult: null
    },
    rebirth: {
      points: 0,
      totalRebirthCount: 0,
      cumulativePointsEarned: 0,
      highestTierReached: 1,
      lastRebirthTier: 1,
      bestTierReached: 1,
      rewards: {
        automationStartPass: 0,
        trainingManual: 0,
        breakthroughMemory: 0,
        vanguardGrant: 0,
        pioneerSlots: 0
      }
    },
    tutorial: {
      enabled: true,
      completed: false,
      step: 0,
      beginnerBuffActive: true,
      beginnerBuffElapsedSec: 0,
      beginnerBuffDurationSec: GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_DURATION_SEC,
      beginnerBuffRatePerSec: GAME_CONSTANTS.TUTORIAL_BEGINNER_GOLD_RATE_PER_SEC
    },
    act2: {
      unlocked: false,
      noticeShown: false
    },
    lastTickTime: Date.now(),
    offlineGoldGenerated: 0
  };
}
