#!/usr/bin/env python3
"""
DPS Forge 시뮬레이션: 9단 50마리 + 10단 1마리 생산까지 소요 시간 계산
"""

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List
from enum import Enum

# ==================== 상수 ====================

class GameConstants:
    STARTING_GOLD = 10
    UNIT_COST = 10
    
    UNIT_SPECS = {
        1: {"attackPower": 1, "attackSpeed": 2.0},
        2: {"attackPower": 2, "attackSpeed": 2.0},
        3: {"attackPower": 4, "attackSpeed": 2.0},
        4: {"attackPower": 7, "attackSpeed": 2.0},
        5: {"attackPower": 12, "attackSpeed": 2.0},
        6: {"attackPower": 20, "attackSpeed": 2.0},
        7: {"attackPower": 32, "attackSpeed": 2.0},
        8: {"attackPower": 51, "attackSpeed": 2.0},
        9: {"attackPower": 81, "attackSpeed": 2.0},
        10: {"attackPower": 128, "attackSpeed": 2.0},
    }
    
    UPGRADE_PROBABILITY = {
        1: 0.30, 2: 0.27, 3: 0.24, 4: 0.21, 5: 0.18,
        6: 0.15, 7: 0.12, 8: 0.09, 9: 0.06,
    }
    
    DAMAGE_TO_GOLD_RATIO = 1.0
    TICK_INTERVAL = 0.1
    AUTO_BASE_ACTIONS_PER_SEC = 25
    SLOT_CAP_INITIAL = 10
    
    @staticmethod
    def getDPS(tier):
        if tier not in GameConstants.UNIT_SPECS:
            return 0
        spec = GameConstants.UNIT_SPECS[tier]
        return spec["attackPower"] / spec["attackSpeed"]
    
    @staticmethod
    def getIncomeMultiplierFromDPS(dps):
        if dps < 10:
            return 1
        level = max(0, math.floor(math.log10(dps)))
        return 2 ** level
    
    @staticmethod
    def getActualIncomePerSecond(dps):
        return dps * GameConstants.DAMAGE_TO_GOLD_RATIO * GameConstants.getIncomeMultiplierFromDPS(dps)
    
    @staticmethod
    def getTier1CostToReach(targetTier):
        if targetTier < 1:
            return 0
        costs = {1: 1}
        for t in range(2, targetTier + 1):
            costs[t] = costs[t - 1] * 3
        return costs[targetTier]

# ==================== 게임 상태 ====================

@dataclass
class GameState:
    # 리소스
    gold: float = GameConstants.STARTING_GOLD
    inventory: Dict[int, int] = field(default_factory=lambda: {i: 0 for i in range(1, 11)})
    deployed: Dict[int, int] = field(default_factory=lambda: {i: 0 for i in range(1, 11)})
    
    # 경험 및 특성
    characterLevel: int = 1
    characterExp: float = 0
    traitPoints: int = 1
    
    # 특성 레벨
    attackPowerUpgrade: int = 0
    enhanceProbabilityUpgrade: int = 0
    slotCapacityUpgrade: int = 0
    autoBuySpeedUpgrade: int = 0
    autoUpgradeSpeedUpgrade: int = 0
    autoSellSpeedUpgrade: int = 0
    
    # 통계
    totalGoldEarned: float = 0
    totalTime: float = 0  # 초 단위
    
    def getCurrentDPS(self):
        total_dps = 0
        for tier in range(1, 11):
            total_dps += self.deployed[tier] * GameConstants.getDPS(tier)
        attackPowerMult = 1 + self.attackPowerUpgrade
        return total_dps * attackPowerMult
    
    def getCurrentIncomePerSecond(self):
        dps = self.getCurrentDPS()
        return GameConstants.getActualIncomePerSecond(dps)
    
    def getUpgradeProbability(self, tier):
        base_prob = GameConstants.UPGRADE_PROBABILITY.get(tier, 0)
        bonus = self.enhanceProbabilityUpgrade * 0.001  # +0.1%p per level
        return min(base_prob + bonus, 1.0)
    
    def getSlotCap(self):
        return GameConstants.SLOT_CAP_INITIAL + self.slotCapacityUpgrade
    
    def getAutomationActionsPerSecond(self, action_type):
        """자동화 속도 계산"""
        base = GameConstants.AUTO_BASE_ACTIONS_PER_SEC
        if action_type == "buy":
            return base + self.autoBuySpeedUpgrade
        elif action_type == "upgrade":
            return base + self.autoUpgradeSpeedUpgrade
        elif action_type == "sell":
            return base + self.autoSellSpeedUpgrade
        return base

# ==================== 시뮬레이션 엔진 ====================

class Simulator:
    def __init__(self):
        self.state = GameState()
        self.log = []
        self.checkpoints = []
    
    def log_action(self, time_s, action):
        self.log.append(f"[{time_s:.1f}s] {action}")
    
    def tick(self, delta_time=0.1):
        """틱 처리"""
        income = self.state.getCurrentIncomePerSecond()
        self.state.gold += income * delta_time
        self.state.totalGoldEarned += income * delta_time
        self.state.totalTime += delta_time
    
    def auto_buy(self, tier):
        """자동 구매"""
        cost = GameConstants.UNIT_COST
        if self.state.gold < cost:
            return False
        self.state.gold -= cost
        self.state.inventory[tier] += 1
        return True
    
    def auto_upgrade(self, tier):
        """자동 강화"""
        if self.state.inventory[tier] < 1:
            return False
        if tier >= 10:
            return False
        
        success_prob = self.state.getUpgradeProbability(tier)
        if random.random() < success_prob:
            self.state.inventory[tier] -= 1
            self.state.inventory[tier + 1] += 1
            return True
        else:
            self.state.inventory[tier] -= 1
            return False
    
    def deploy_unit(self, tier, count=1):
        """유닛 배치"""
        if self.state.inventory[tier] < count:
            return False
        slot_cap = self.state.getSlotCap()
        current_slots = sum(self.state.deployed.values())
        
        if current_slots + count > slot_cap:
            # 낮은 단수부터 회수해서 배치
            needed = current_slots + count - slot_cap
            recovered = 0
            for t in range(1, tier):
                if recovered >= needed:
                    break
                recover_count = min(self.state.deployed[t], needed - recovered)
                self.state.deployed[t] -= recover_count
                self.state.inventory[t] += recover_count
                recovered += recover_count
        
        self.state.inventory[tier] -= count
        self.state.deployed[tier] += count
        return True
    
    def upgrade_trait(self, trait_name, levels=1):
        """특성 업그레이드"""
        cost_per_level = {"attackPowerUpgrade": 2, "enhanceProbabilityUpgrade": 1,
                         "slotCapacityUpgrade": 1, "autoBuySpeedUpgrade": 1,
                         "autoUpgradeSpeedUpgrade": 1, "autoSellSpeedUpgrade": 1}[trait_name]
        
        total_cost = cost_per_level * levels
        if self.state.traitPoints < total_cost:
            return False
        
        self.state.traitPoints -= total_cost
        current = getattr(self.state, trait_name, 0)
        setattr(self.state, trait_name, current + levels)
        return True
    
    def gain_exp(self, amount):
        """경험치 획득"""
        self.state.characterExp += amount
        # 레벨 요구 경험치: 2*n^2 - 2*n + 5
        while True:
            required = 2 * self.state.characterLevel * self.state.characterLevel - 2 * self.state.characterLevel + 5
            if self.state.characterExp >= required:
                self.state.characterExp -= required
                self.state.characterLevel += 1
                self.state.traitPoints += 1
            else:
                break
    
    def simulate(self, target_goal, duration_limit_hours=10000):
        """메인 시뮬레이션"""
        duration_limit_s = duration_limit_hours * 3600
        
        # 초반: 1단 1마리 구매 후 배치
        self.auto_buy(1)
        self.deploy_unit(1, 1)
        self.log_action(0, "1단 1마리 구매 및 배치")
        
        # 초반 특성 투자 전략
        phase = "early"  # early, mid, late
        auto_buy_enabled = True
        auto_upgrade_enabled = True
        
        checkpoint_count = 0
        last_checkpoint_time = 0
        
        while self.state.totalTime < duration_limit_s:
            # 매 초마다 처리
            for _ in range(10):  # 0.1초 * 10 = 1초
                self.tick(0.1)
            
            current_time = self.state.totalTime
            
            # === 페이즈 결정 ===
            if self.state.getCurrentDPS() >= 10:
                phase = "mid"
            if self.state.getCurrentDPS() >= 100:
                phase = "late"
            
            # === 특성 투자 ===
            while self.state.traitPoints > 0:
                if phase == "early":
                    # 초반: 공격력 업글이 가장 효율적
                    if self.state.attackPowerUpgrade < 5:
                        self.upgrade_trait("attackPowerUpgrade", 1)
                    elif self.state.autoBuySpeedUpgrade < 10:
                        self.upgrade_trait("autoBuySpeedUpgrade", 1)
                    elif self.state.autoUpgradeSpeedUpgrade < 10:
                        self.upgrade_trait("autoUpgradeSpeedUpgrade", 1)
                    else:
                        break
                elif phase == "mid":
                    # 중반: 자동화 속도 > 강화확률 > 공격력
                    if self.state.autoUpgradeSpeedUpgrade < 50:
                        self.upgrade_trait("autoUpgradeSpeedUpgrade", 1)
                    elif self.state.enhanceProbabilityUpgrade < 10:
                        self.upgrade_trait("enhanceProbabilityUpgrade", 1)
                    elif self.state.autoBuySpeedUpgrade < 50:
                        self.upgrade_trait("autoBuySpeedUpgrade", 1)
                    else:
                        break
                else:  # late
                    # 후반: 강화확률 > 자동강화 속도
                    if self.state.enhanceProbabilityUpgrade < 50:
                        self.upgrade_trait("enhanceProbabilityUpgrade", 1)
                    elif self.state.autoUpgradeSpeedUpgrade < 200:
                        self.upgrade_trait("autoUpgradeSpeedUpgrade", 1)
                    else:
                        break
            
            # === 자동 구매 (1단만) ===
            if auto_buy_enabled:
                actions_per_sec = self.state.getAutomationActionsPerSecond("buy")
                for _ in range(max(1, int(actions_per_sec / 10))):  # 0.1초마다
                    self.auto_buy(1)
            
            # === 자동 강화 (전체 단) ===
            if auto_upgrade_enabled:
                actions_per_sec = self.state.getAutomationActionsPerSecond("upgrade")
                for _ in range(max(1, int(actions_per_sec / 10))):  # 0.1초마다
                    for tier in range(1, 10):
                        if self.auto_upgrade(tier):
                            break
            
            # === 배치 최적화 ===
            # 고단 유닛이 생기면 배치
            for tier in range(10, 0, -1):
                if self.state.inventory[tier] > 0 and sum(self.state.deployed.values()) < self.state.getSlotCap():
                    self.deploy_unit(tier, 1)
            
            # === 체크포인트 로깅 ===
            if current_time - last_checkpoint_time >= 60:  # 매 60초
                checkpoint_count += 1
                last_checkpoint_time = current_time
                dps = self.state.getCurrentDPS()
                inv_str = ", ".join([f"{t}단:{self.state.inventory[t]}" for t in range(1, 11) if self.state.inventory[t] > 0])
                deploy_str = ", ".join([f"{t}단:{self.state.deployed[t]}" for t in range(1, 11) if self.state.deployed[t] > 0])
                
                checkpoint = {
                    "time": current_time,
                    "dps": dps,
                    "gold": self.state.gold,
                    "inventory": inv_str,
                    "deployed": deploy_str,
                    "level": self.state.characterLevel,
                    "traits": {
                        "attackPower": self.state.attackPowerUpgrade,
                        "enhanceProb": self.state.enhanceProbabilityUpgrade,
                        "autoBuySpeed": self.state.autoBuySpeedUpgrade,
                        "autoUpgradeSpeed": self.state.autoUpgradeSpeedUpgrade,
                    }
                }
                self.checkpoints.append(checkpoint)
            
            # === 목표 달성 확인 ===
            total_tier9 = self.state.inventory[9] + self.state.deployed[9]
            total_tier10 = self.state.inventory[10] + self.state.deployed[10]
            if total_tier9 >= 50 and total_tier10 >= 1:
                return True, current_time
        
        return False, duration_limit_s

# ==================== 실행 ====================

if __name__ == "__main__":
    print("=" * 80)
    print("DPS Forge 시뮬레이션: 9단 50마리 + 10단 1마리 생산")
    print("=" * 80)
    
    # 최단 루트 시뮬레이션 (5회 평균)
    times = []
    for attempt in range(5):
        print(f"\n[시도 {attempt + 1}/5]")
        random.seed(42 + attempt)  # 재현성을 위해 시드 고정
        
        sim = Simulator()
        success, time_taken = sim.simulate("goal")
        
        if success:
            hours = time_taken / 3600
            minutes = (time_taken % 3600) / 60
            seconds = time_taken % 60
            
            times.append(time_taken)
            print(f"✓ 성공! 소요 시간: {int(hours)}h {int(minutes)}m {seconds:.1f}s")
            print(f"\n최종 상태:")
            print(f"  DPS: {sim.state.getCurrentDPS():.2f}")
            print(f"  골드: {sim.state.gold:.0f}")
            print(f"  총 획득 골드: {sim.state.totalGoldEarned:.0f}")
            print(f"  캐릭터 레벨: {sim.state.characterLevel}")
            print(f"  특성포인트: {sim.state.traitPoints}")
            
            print(f"\n특성 상태:")
            print(f"  공격력: {sim.state.attackPowerUpgrade}")
            print(f"  강화확률: {sim.state.enhanceProbabilityUpgrade}")
            print(f"  자동구매 속도: {sim.state.autoBuySpeedUpgrade}")
            print(f"  자동강화 속도: {sim.state.autoUpgradeSpeedUpgrade}")
            
            print(f"\n최종 인벤토리:")
            inv = [f"{t}단:{sim.state.inventory[t]}" for t in range(1, 11) if sim.state.inventory[t] > 0]
            print(f"  {', '.join(inv) if inv else '비었음'}")
            
            print(f"\n최종 배치:")
            dep = [f"{t}단:{sim.state.deployed[t]}" for t in range(1, 11) if sim.state.deployed[t] > 0]
            print(f"  {', '.join(dep) if dep else '비었음'}")
            
            # 주요 체크포인트
            print(f"\n진행 로그 (60초 간격):")
            for i, cp in enumerate(sim.checkpoints[-10:]):  # 마지막 10개만
                print(f"  [{cp['time']/60:.1f}분] DPS={cp['dps']:.2f}, Lv={cp['level']}, " +
                      f"공격{cp['traits']['attackPower']} 강화{cp['traits']['enhanceProb']} " +
                      f"구매{cp['traits']['autoBuySpeed']} 강화속{cp['traits']['autoUpgradeSpeed']}")
        else:
            print(f"✗ 실패 (시간 초과)")
    
    if times:
        avg_time = sum(times) / len(times)
        avg_hours = avg_time / 3600
        avg_minutes = (avg_time % 3600) / 60
        avg_seconds = avg_time % 60
        print(f"\n평균 소요 시간 (5회): {int(avg_hours)}h {int(avg_minutes)}m {avg_seconds:.1f}s")
        print(f"범위: {min(times)/60:.1f}분 ~ {max(times)/60:.1f}분")
    
    print("\n" + "=" * 80)
