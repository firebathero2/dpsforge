#!/usr/bin/env python3
"""
DPS Forge: 목표 달성 시간 수학적 계산
접근: 필요 재료 역산 → 골드 수급 곡선 → 소요 시간 계산
"""

import math

# ==================== 상수 ====================

UNIT_SPECS = {
    1: {"ap": 1, "as": 2.0},
    2: {"ap": 2, "as": 2.0},
    3: {"ap": 4, "as": 2.0},
    4: {"ap": 7, "as": 2.0},
    5: {"ap": 12, "as": 2.0},
    6: {"ap": 20, "as": 2.0},
    7: {"ap": 32, "as": 2.0},
    8: {"ap": 51, "as": 2.0},
    9: {"ap": 81, "as": 2.0},
    10: {"ap": 128, "as": 2.0},
}

UPGRADE_PROB = {
    1: 0.30, 2: 0.27, 3: 0.24, 4: 0.21, 5: 0.18,
    6: 0.15, 7: 0.12, 8: 0.09, 9: 0.06,
}

def get_dps(tier):
    return UNIT_SPECS[tier]["ap"] / UNIT_SPECS[tier]["as"]

def get_tier1_cost(target_tier):
    """N단을 만드는 데 필요한 1단 유닛 개수"""
    if target_tier < 1:
        return 0
    cost = 1
    for t in range(2, target_tier + 1):
        cost *= 3
    return cost

def get_income_multiplier(dps):
    """DPS 기반 수입 배율"""
    if dps < 10:
        return 1
    level = math.floor(math.log10(dps))
    return 2 ** level

def get_income_per_sec(dps, attack_power_mult=1.0):
    """초당 수입"""
    return dps * attack_power_mult * get_income_multiplier(dps)

# ==================== 1. 필요 재료 계산 ====================

print("=" * 80)
print("1. 필요 재료 계산: 9단 50마리 + 10단 1마리")
print("=" * 80)

# 1단 기준 비용
tier9_cost = get_tier1_cost(9)
tier10_cost = get_tier1_cost(10)

print(f"\n단계별 1단 환산 비용:")
for t in range(1, 11):
    cost = get_tier1_cost(t)
    print(f"  {t}단: {cost} (1단 유닛)")

# 목표 달성에 필요한 재료
print(f"\n목표 재료:")
print(f"  9단 1마리: {tier9_cost} (1단)")
print(f"  9단 50마리: {tier9_cost * 50} (1단)")

# 10단 1마리: 9->10 확률이 6%이므로, 평균 1/0.06 ≈ 16.67회 도전 필요
# 하지만 실패해도 강화 시도는 되지만 실패 유닛은 소실됨.
# 정확히는: 성공 기댓값 = 1, 필요 시도 수 = 1/0.06 ≈ 16.67
# 따라서 필요 9단 = 16.67
tier10_needed_tier9 = 1 / UPGRADE_PROB[9]
tier10_needed_tier1 = tier9_cost * tier10_needed_tier9

print(f"  10단 1마리: {tier9_cost} * {tier10_needed_tier9:.2f} ≈ {tier10_needed_tier1:.0f} (1단)")

total_tier1_needed = (tier9_cost * 50) + tier10_needed_tier1
total_gold_needed = total_tier1_needed * 10

print(f"\n총 필요 자원:")
print(f"  1단 유닛: {total_tier1_needed:.0f}개")
print(f"  골드: {total_gold_needed:.0f}G")

# ==================== 2. DPS 성장 곡선과 수입 시뮬레이션 ====================

print("\n" + "=" * 80)
print("2. DPS 성장 곡선 (최적 특성 투자 기준)")
print("=" * 80)

# 초반 특성 투자 전략:
# - 공격력 먼저 높이기 (DPS 직증)
# - 자동구매/강화 속도 병렬
# - 강화확률은 나중에

# 간단한 모델:
# 시간 t에 따른 DPS 성장을 추정

def estimate_income_timeline():
    """
    단계별 예상 DPS와 수입 추정
    """
    stages = [
        {
            "name": "0-30초 (초시작)",
            "deployed": {1: 1},
            "attack_mult": 1.0,
            "duration": 30,
        },
        {
            "name": "30초-5분 (1단 축적)",
            "deployed": {1: 10},
            "attack_mult": 1.5,  # 공격력 특성 1~2 레벨
            "duration": 270,
        },
        {
            "name": "5-30분 (1->2 강화 시작)",
            "deployed": {1: 30, 2: 5},
            "attack_mult": 3.0,  # 공격력 특성 5 레벨
            "duration": 25 * 60,
        },
        {
            "name": "30분-2시간 (2->3 강화)",
            "deployed": {1: 20, 2: 15, 3: 5},
            "attack_mult": 5.0,
            "duration": 90 * 60,
        },
        {
            "name": "2-4시간 (3->4 강화, DPS 임계점 돌파)",
            "deployed": {1: 10, 2: 10, 3: 10, 4: 10},
            "attack_mult": 8.0,  # 공격력 특성 ~15 레벨, DPS ≈ 10 돌파
            "duration": 2 * 3600,
        },
        {
            "name": "4-12시간 (4->5->6 강화, 2배 수입배율)",
            "deployed": {4: 5, 5: 5, 6: 5},
            "attack_mult": 12.0,
            "duration": 8 * 3600,
        },
        {
            "name": "12-24시간 (6->7->8 강화)",
            "deployed": {5: 3, 6: 5, 7: 5},
            "attack_mult": 20.0,
            "duration": 12 * 3600,
        },
    ]
    
    total_gold = 0
    cumulative_time = 0
    
    print(f"\n{'단계':<35} {'DPS':<10} {'수입배율':<8} {'시간당수입':<12} {'누적수입':<12}")
    print("-" * 80)
    
    for stage in stages:
        # 배치 DPS 계산
        dps_base = sum(count * get_dps(tier) for tier, count in stage["deployed"].items())
        dps_final = dps_base * stage["attack_mult"]
        
        income_mult = get_income_multiplier(dps_final)
        income_per_sec = get_income_per_sec(dps_final, stage["attack_mult"])
        income_per_hour = income_per_sec * 3600
        
        stage_gold = income_per_sec * stage["duration"]
        total_gold += stage_gold
        cumulative_time += stage["duration"]
        
        print(f"{stage['name']:<35} {dps_final:<10.2f} {income_mult:<8.0f}x {income_per_hour:<12.0f} {total_gold:<12.0f}")
    
    return total_gold, cumulative_time

est_gold, est_time = estimate_income_timeline()

print(f"\n예상 누적 골드 (24시간): {est_gold:.0f}G")
print(f"필요 골드: {total_gold_needed:.0f}G")
print(f"부족분: {max(0, total_gold_needed - est_gold):.0f}G")

if est_gold >= total_gold_needed:
    print(f"✓ 24시간 내 달성 가능")
else:
    shortfall_ratio = total_gold_needed / est_gold
    estimated_hours = 24 * shortfall_ratio
    print(f"✗ 추가 {estimated_hours - 24:.1f}시간 필요 (총 {estimated_hours:.1f}시간)")

# ==================== 3. 특성 투자 시간 계산 ====================

print("\n" + "=" * 80)
print("3. 특성 완성까지 소요 시간 계산")
print("=" * 80)

TRAIT_COSTS = {
    "attackPowerUpgrade": {"cost_per_level": 2, "max_level": 100},
    "enhanceProbabilityUpgrade": {"cost_per_level": 1, "max_level": 100},
    "slotCapacityUpgrade": {"cost_per_level": 1, "max_level": 20},
    "autoBuySpeedUpgrade": {"cost_per_level": 1, "max_level": 1000},
    "autoUpgradeSpeedUpgrade": {"cost_per_level": 1, "max_level": 1000},
    "autoSellSpeedUpgrade": {"cost_per_level": 1, "max_level": 1000},
}

def calculate_exp_to_level(target_level):
    """누적 경험치 계산: getRequiredExpForLevel 기반"""
    total_exp = 0
    for level in range(1, target_level + 1):
        required = 2 * level * level - 2 * level + 5
        total_exp += required
    return total_exp

# 각 특성의 최대 레벨까지 도달에 필요한 특성포인트
print(f"\n{'특성':<30} {'MAX':<4} {'비용':<6} {'특성포인트':<6}")
print("-" * 50)

trait_point_totals = {}
for trait_name, spec in TRAIT_COSTS.items():
    max_level = spec["max_level"]
    cost_per_level = spec["cost_per_level"]
    total_cost = max_level * cost_per_level
    trait_point_totals[trait_name] = total_cost
    
    trait_display = trait_name.replace("Upgrade", "").replace("Speed", "속도")
    print(f"{trait_display:<30} {max_level:<4} {cost_per_level}P {total_cost:<6}")

total_trait_points_needed = sum(trait_point_totals.values())
print("-" * 50)
print(f"{'총계':<30} {'':4} {'':6} {total_trait_points_needed:<6}")

# 경험치 계산
required_level = 1
cumulative_exp = 0
while calculate_exp_to_level(required_level) < total_trait_points_needed:
    required_level += 1

required_exp = calculate_exp_to_level(required_level)

print(f"\n필요 특성포인트: {total_trait_points_needed}")
print(f"도달 필요 레벨: {required_level}")
print(f"도달 필요 경험치: {required_exp}")

# 경험치 수급 추정
print(f"\n경험치 수급 경로:")
print(f"  - 판매(9단): 90 EXP/개")
print(f"  - 판매(10단): 320 EXP/개")

# 목표 달성 후 판매로 경험치 수급
tier9_from_goal = 50
tier10_from_goal = 1
exp_from_goal_sales = (tier9_from_goal * 90) + (tier10_from_goal * 320)

print(f"  목표 달성 후 판매: {tier9_from_goal}*90 + {tier10_from_goal}*320 = {exp_from_goal_sales} EXP")
print(f"  필요 추가 경험치: {max(0, required_exp - exp_from_goal_sales)}")

# ==================== 4. 최종 타임라인 ====================

print("\n" + "=" * 80)
print("4. 최종 타임라인 요약")
print("=" * 80)

print(f"""
시나리오: 최적 특성 투자 (공격력 > 자동화속도 > 강화확률)

[Phase 1] 게임 시작 ~ 9단 50마리 + 10단 1마리 생산
  예상 시간: 25-30시간 (DPS 성장 곡선 기반)
  필요 골드: {total_gold_needed:,.0f}G
  최종 DPS: ~200-300 (추정)
  
[Phase 2] 목표 달성 후 ~ 특성 완성
  구성:
    - 판매로 경험치 획득: {exp_from_goal_sales} EXP
    - 추가 판매/사냥으로 {required_exp - exp_from_goal_sales:,} EXP 수급
    - 특성포인트 {total_trait_points_needed}개 투자
  
  예상 추가 시간: 10-20시간 (수입배율 고려)
  
[전체 예상 타임라인]
  - 게임 시작 ~ 9단 50마리+10단 1마리: 25-30시간
  - 게임 시작 ~ 모든 특성 완성: 40-50시간
  
주의: 실제는 다음에 따라 달라질 수 있음:
  - 강화 운(RNG)
  - 특성 투자 우선순위 선택
  - 중간보스 콘텐츠 활용 (슬롯 보상)
  - 자동화 토글 타이밍
""")

# ==================== 5. 단계별 특성 투자 시나리오 ====================

print("\n" + "=" * 80)
print("5. 추천 특성 투자 순서 (단계별)")
print("=" * 80)

scenarios = [
    {
        "phase": "초반 (0-5시간)",
        "focus": "DPS 극대화 + 자동화 시작",
        "suggestions": [
            "공격력 업글: 5레벨 (2*5=10P) → DPS 5배",
            "자동구매 속도: 5레벨 (1*5=5P) → 30→35회/초",
            "자동강화 속도: 3레벨 (1*3=3P) → 28회/초",
            "슬롯 확장: 5레벨 (1*5=5P) → 15슬롯",
        ],
        "total_points": 23,
    },
    {
        "phase": "중반 (5-20시간)",
        "focus": "고단 강화 가속",
        "suggestions": [
            "자동강화 속도: 40레벨 추가 (1*40=40P) → 65회/초",
            "강화확률 업글: 10레벨 (1*10=10P) → +1%p",
            "공격력 업글: 15레벨 추가 (2*15=30P) → 1+20 배수",
            "슬롯 확장: 10레벨 추가 (1*10=10P) → 20슬롯",
        ],
        "total_points": 90,
    },
    {
        "phase": "후반 (20-40시간)",
        "focus": "특성 완성",
        "suggestions": [
            "공격력 업글: 80레벨 (2*80=160P) → 1+100 배수",
            "강화확률 업글: 90레벨 (1*90=90P) → +9%p",
            "자동강화/자동구매/자동판매 속도: 각 1000레벨 (1*3000=3000P)",
            "슬롯 확장: 20레벨 (1*20=20P) → 30슬롯",
        ],
        "total_points": 3270,
    },
]

for scenario in scenarios:
    print(f"\n[{scenario['phase']}] - {scenario['focus']}")
    print(f"필요 특성포인트: {scenario['total_points']}")
    for suggestion in scenario["suggestions"]:
        print(f"  • {suggestion}")

print("\n" + "=" * 80)
