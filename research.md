# DPS Forge Research Spec

이 문서는 현재 코드베이스를 역공학한 구현 명세서다. 목표는 "다른 프로젝트/다른 AI"가 이 문서만으로 동일 규칙의 게임을 재현하도록 하는 것이다.

## 1. 시스템 개요

1. 장르: 브라우저 방치형 성장 게임.
2. 아키텍처: `상수층(constants) + 상태/규칙 엔진(gameLogic) + UI 제어(ui)`의 3분리.
3. 프레임워크: 순수 HTML/CSS/Vanilla JS.
4. 런타임: 단일 페이지, 전역 인스턴스 `gameEngine`, `gameUI` 사용.

## 2. 모듈별 책임

### 2.1 [js/constants.js](js/constants.js)

1. 밸런스 수치 단일 진실원(SSOT).
2. 계산 함수 제공.
3. 초기 상태 생성 함수 `initGameState()` 제공.

### 2.2 [js/gameLogic.js](js/gameLogic.js)

1. 상태 변경의 유일한 규칙 계층.
2. 저장/로드와 오프라인 보상 처리.
3. 중간보스 도전 판정.
4. Proxy 기반 자동저장 트리거.

### 2.3 [js/ui.js](js/ui.js)

1. 틱 루프 구동.
2. DOM 표시 갱신.
3. 입력 이벤트를 엔진 API로 연결.
4. 자동화(자동구매/자동강화/자동판매) 실행 스케줄러.

### 2.4 [index.html](index.html)

1. 화면 패널(상태/전투/관리) 배치.
2. 모든 제어 버튼의 ID 정의.
3. 유닛 테이블, 특성 카드, 중간보스 패널 구조 제공.

## 3. 데이터 모델(정확 스키마)

다음 구조는 `initGameState()` 기준이다.

```js
{
   gold: number,
   inventory: { 1..10: number },
   deployed: { 1..10: number },
   totalDamageDealt: number,
   totalGoldEarned: number,
   characterLevel: number,
   characterExp: number,
   traitPoints: number,
   maxSlots: number,
   traitLevels: {
      attackPowerUpgrade: number,
      enhanceProbabilityUpgrade: number,
      slotCapacityUpgrade: number,
      automationSpeedUpgrade: number
   },
   midBoss: {
      level: number,
      lastResult: null | {
         success: boolean,
         averageDps: number,
         dpsCut: number,
         slotReward: number,
         timestamp: number
      }
   },
   lastTickTime: number,
   offlineGoldGenerated: number
}
```

## 4. 상수와 수식(현재 기준 고정값)

### 4.1 전역 상수

1. `STARTING_GOLD = 10`
2. `UNIT_COST = 10`
3. `MAX_SLOTS_INITIAL = 10`
4. `TICK_INTERVAL = 0.1`
5. `AUTO_SAVE_INTERVAL_MS = 3000`
6. `AUTO_BASE_ACTIONS_PER_SEC = 25`
7. `OFFLINE_REWARD_MULTIPLIER = 0.7`
8. `MAX_OFFLINE_TIME = 28800`
9. `MAX_CHARACTER_LEVEL = 10000`

### 4.2 유닛 전투력

유닛별 DPS는 아래로 계산한다.

$$
	ext{unitDPS}(tier) = \frac{attackPower(tier)}{attackSpeed(tier)}
$$

전체 배치 DPS는 아래다.

$$
	ext{baseDPS} = \sum_{tier=1}^{10} deployed[tier] \times unitDPS(tier)
$$

공격력 특성 배수 적용 후 실제 전투 DPS는 아래다.

$$
	ext{effectiveDPS} = \text{baseDPS} \times (1 + attackPowerUpgradeLevel)
$$

### 4.3 수입 배율

1. `dps < 10`이면 배율은 1.
2. 그 외에는 $\lfloor \log_{10}(dps) \rfloor$를 레벨로 사용.
3. 최종 배율은 $2^{level}$.

즉,

$$
incomeMultiplier(dps)=
\begin{cases}
1,& dps<10 \\
2^{\lfloor\log_{10}(dps)\rfloor},& dps\ge10
\end{cases}
$$

초당 수입:

$$
incomePerSecond = effectiveDPS \times DAMAGE\_TO\_GOLD\_RATIO \times incomeMultiplier
$$

현재 `DAMAGE_TO_GOLD_RATIO = 1.0`이다.

### 4.4 강화 확률

기본 확률 테이블:

1. 1->2: 0.30
2. 2->3: 0.27
3. 3->4: 0.24
4. 4->5: 0.21
5. 5->6: 0.18
6. 6->7: 0.15
7. 7->8: 0.12
8. 8->9: 0.09
9. 9->10: 0.06

강화확률 특성 보정:

$$
bonus = 0.001 \times enhanceProbabilityUpgradeLevel
$$

강화확률 특성 보정은 1~10단 강화에만 적용된다.

최종 강화 성공확률은 `min(cap(tier), base + bonus)`이며, 11단 이상은 bonus가 0으로 처리된다.

### 4.5 직접 구매 가격

1. 3단: 185
2. 4단: 771
3. 5단: 3674
4. 7단: 195108

설계 의도 규칙:

1. 하위 자동구매 단가로 상위 자동구매 단수를 생산할 기대비용 계산.
2. 해당 기대비용의 50% 프리미엄 적용.
3. 7단은 4단(771) 기반 기대생산비용에 맞춘 값이다.

### 4.6 판매 경험치

1. 5단: +1
2. 6단: +3
3. 7단: +9
4. 8단: +27
5. 9단: +90
6. 10단: +320

### 4.7 레벨업 요구 경험치

레벨 $L \to L+1$ 요구 경험치:

$$
requiredExp(L)=2L^2-2L+5
$$

## 5. 규칙 엔진 동작 상세

### 5.1 `tick(deltaTime)`

1. 배치 유닛 합산 DPS 계산.
2. 공격력 특성 배수 적용.
3. 수입 배율 계산.
4. `gold += incomePerSecond * deltaTime`.
5. `totalDamageDealt += effectiveDPS * deltaTime`.
6. `totalGoldEarned += generatedGold`.

### 5.2 `buyUnit(tier=1, quantity=1)`

1. 실제 구현은 `tier` 인자를 받지만 비용은 항상 `UNIT_COST`를 사용한다.
2. 현재 UI에서는 1단 구매에만 사용한다.
3. 골드 부족이면 실패 false.

### 5.3 `buyHighTierUnit(tier, quantity=1)`

1. 허용 tier는 가격 테이블 존재 여부로 판정.
2. 골드 충분하면 인벤토리 증가.
3. UI상 수동 구매 버튼은 없고 자동구매 토글(4단/7단)에서 사용한다.

### 5.4 `deployUnit(tier, quantity=1)`

1. 인벤토리 부족이면 실패.
2. 슬롯 여유가 있으면 즉시 배치.
3. 슬롯이 꽉 차면 더 낮은 tier 1기를 찾아 회수 후 교체.
4. 같은 tier 또는 더 높은 tier만 남아 있으면 교체하지 않고 종료.

### 5.5 `retrieveUnit(tier, quantity=1)`

1. 배치 수량 검사.
2. 배치에서 감소, 인벤토리에 증가.

### 5.6 `attemptUpgrade(tier)`

1. 강화 가능 범위는 1~9.
2. 인벤토리 1개를 성공/실패와 무관하게 소비.
3. 성공 시 `tier+1` 인벤토리 1개 증가.
4. 실패 시 아무 생성 없음.

### 5.7 `sellUnit(tier, quantity=1)`

1. 판매 가능 범위는 5~10.
2. 판매하면 골드가 아니라 EXP를 준다.
3. 내부적으로 `addCharacterExp` 호출.

### 5.8 `addCharacterExp(expAmount)`

1. 만렙(10000)면 경험치를 더 받지 않는다.
2. 루프 기반 연속 레벨업 처리.
3. 레벨업 1회당 특성포인트 +1.

### 5.9 `spendTraitPoints(traitType, levels=1)`

1. 특성 존재 여부 검증.
2. 비용/최대레벨 검증.
3. 성공 시 포인트 차감 후 특성레벨 증가.

### 5.10 `resetTrait(traitType)`

1. 현재 레벨 * 특성비용만큼 환불.
2. `slotCapacityUpgrade` 리셋 시 특수 처리.
3. 슬롯 감소량만큼 하위 tier부터 자동 회수.
4. 리셋 시점에 이미 과밀 배치가 되지 않도록 보정.

### 5.11 `autoOptimizeDeploy()`

1. 먼저 배치된 1단 유닛을 전량 회수.
2. 10단부터 역순으로 가능한 만큼 배치.
3. 슬롯 한도는 특성/보상 반영값 사용.

## 6. 자동화 스케줄러(UI 레이어) 상세

### 6.1 실행 순서

`runAutomation(delta)` 순서:

1. 간격 동기화.
2. 1단 자동구매.
3. 4단 자동구매.
4. 7단 자동구매.
5. 자동판매.
6. 자동강화.

### 6.2 자동구매 상호배타

토글 제약:

1. 1단 자동구매 ON -> 4단, 7단 OFF.
2. 4단 자동구매 ON -> 1단, 7단 OFF.
3. 7단 자동구매 ON -> 1단, 4단 OFF.

### 6.3 자동판매 vs 자동강화 단수 충돌 규칙

핵심 규칙:

1. 전역 정지가 아니라 "같은 단수"만 정지한다.
2. 자동강화 루프에서 `autoSellTiers.has(tier)`이면 해당 tier 강화를 건너뛴다.
3. 건너뛸 때 강화 누적기(`autoUpgradeAccumulatorSecByTier[tier]`)를 0으로 리셋한다.

효과:

1. 4단 강화 ON, 5단 강화+판매 ON이면 4단 강화는 진행된다.
2. 5단은 판매만 진행되어 6단 생성이 방지된다.

### 6.4 자동화 속도

각 자동 행동의 간격:

$$
interval = \frac{1}{25 + traitLevel}
$$

행동별 trait:

1. 자동화 공통 속도: `automationSpeedUpgrade`
2. 이 특성은 자동구매, 자동강화, 자동판매에 동시에 적용된다.
3. 자동화 행동속도는 기본 25회/초에 레벨당 5회/초가 추가된다.

## 7. 중간보스 시스템

### 7.1 클론 선발

1. 전체 보유량은 `inventory + deployed` 합으로 본다.
2. 10단부터 1단까지 역순으로 최대 5기 선발.

### 7.2 도전

1. 도전 시간은 3초.
2. 실시간 클론 DPS를 누적해 평균 DPS를 계산.
3. 평균 DPS가 컷 이상이면 성공.

### 7.3 컷 증가와 보상

레벨 `n`의 컷:

$$
dpsCut(n)=10 \times 2^n
$$

성공 보상:

1. 중간보스 레벨 +1.
2. 슬롯 최대치 `maxSlots` +5.

## 8. 저장/복구 명세

### 8.1 저장 키

1. `dpsforge_gamestate`
2. `dpsforge_lastsave`
3. `dpsforge_automation`

### 8.2 자동저장 구조

1. 상태는 Proxy로 감싸져 있다.
2. `set` 또는 `deleteProperty`가 발생하면 저장 요청.
3. 최소 간격 3000ms 스로틀.
4. 저장 시 Proxy 객체를 직렬화 가능 객체로 변환.

### 8.3 로드 구조

1. 기본 초기 상태 생성.
2. 저장된 상태와 병합(누락 필드 방어).
3. `inventory`, `deployed`, `traitLevels`, `midBoss`는 하위 병합.

### 8.4 오프라인 보상

1. `lastsave` 기반으로 오프라인 초 계산.
2. 10초 이하 이탈은 무시.
3. 최대 8시간까지만 인정.
4. 계산은 "현재 배치 상태의 DPS" 기준.

## 9. UI/DOM 계약

재구현 시 아래 계약을 유지하면 현재 `ui.js`를 거의 그대로 이식할 수 있다.

1. 인벤토리 카운트 ID: `inventory-tier-{1..10}-count`
2. 배치 카운트 ID: `deployed-tier-{1..10}`
3. 강화 버튼 ID: `upgrade-tier-{1..9}`
4. 판매 버튼 ID: `sell-tier-{5..10}`
5. 자동판매 버튼 ID: `auto-sell-tier-{5..10}`
6. 배치 버튼 ID: `deploy-tier-{1..10}`
7. 회수 버튼 ID: `retrieve-tier-{1..10}`
8. 자동구매 버튼 ID: `auto-buy-toggle`, `auto-buy-tier-4-toggle`, `auto-buy-tier-7-toggle`
9. 구매가격 툴팁 ID: `purchase-price-tooltip`, `purchase-price-tooltip-text`
10. 특성 UI ID: `trait-...` 접두의 각 레벨/비용/효과 엘리먼트

## 10. 알려진 동작 특성 및 주의점

1. 강화 성공확률은 상한 clamp가 없다.
2. `buyUnit`은 인자로 어떤 tier를 받아도 단가가 10으로 동일하다.
3. 수동 고단 구매 핸들러는 존재하지만 현재 UI 버튼은 자동구매 토글 중심이다.
4. 자동구매 누적기는 골드 부족 시 interval 이하로 클립되어 다음 틱 재시도된다.
5. 슬롯 리셋 자동회수는 하위 단수부터 진행한다.

## 11. 재구현 절차(권장)

1. 상수/수식 모듈부터 복제한다.
2. 상태 스키마를 정확히 만든다.
3. 엔진 API를 동일 시그니처로 구현한다.
4. UI 이벤트 ID 매핑을 맞춘다.
5. 틱 루프 순서를 동일하게 맞춘다.
6. 자동화 충돌 규칙을 마지막에 집중 테스트한다.
7. 저장/복구 병합과 오프라인 보상을 검증한다.

## 12. 최소 회귀 테스트 시나리오

1. 시작 직후: 골드 10, 슬롯 10, 레벨 1, 특성포인트 1.
2. 1단 1기 배치 후 2초: 골드가 약 1 증가.
3. 1단 강화 1회: 인벤토리 1단 1개 소비, 확률적으로 2단 생성.
4. 5단 판매 1회: 골드 변화 없음, EXP +1.
5. 자동구매 1단 ON 뒤 4단 ON: 1단 자동이 OFF로 전환.
6. 4단 강화 ON + 5단 강화 ON + 5단 판매 ON: 4단 강화 진행, 5단은 판매만.
7. 슬롯특성 +N 후 리셋: 감소량만큼 하위 단수 자동 회수.
8. 중간보스 성공: `maxSlots`가 +5 증가.
9. 저장 후 새로고침: 게임상태와 자동화상태가 복원.
10. 오프라인 1분 이탈 후 복귀: 골드 보상 적용.
