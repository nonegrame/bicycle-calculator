import test from "node:test";
import assert from "node:assert/strict";
import {
  COURSE,
  DEFAULTS,
  airDensityKgM3,
  buildSegments,
  calculateOptimizedRide,
  calculatePlan,
  calculateRide,
  calculateScenarios,
  formatDuration,
} from "../calculator.js";

test("正規化後路線精確維持 53 km / 2,800 m", () => {
  const segments = buildSegments();
  const distance = segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
  const gain = segments.reduce((sum, segment) => sum + segment.gainM, 0);
  assert.ok(Math.abs(distance - COURSE.distanceKm) < 1e-9);
  assert.ok(Math.abs(gain - COURSE.gainM) < 1e-9);
  assert.equal(segments.at(-1).endAltitudeM, COURSE.finishAltitudeM);
});

test("高海拔空氣密度低於埔里", () => {
  const puli = airDensityKgM3(475, 20, 1013.25);
  const wuling = airDensityKgM3(3275, 2, 1013.25);
  assert.ok(wuling < puli);
  assert.ok(puli > 1 && puli < 1.3);
});

test("預設值產生合理且有限的完賽時間", () => {
  const result = calculateRide();
  assert.ok(Number.isFinite(result.totalSeconds));
  assert.ok(result.totalSeconds > 2.5 * 3600);
  assert.ok(result.totalSeconds < 7 * 3600);
  assert.equal(result.segments.length, 7);
});

test("功率增加會縮短時間，重量增加會延長時間", () => {
  const baseline = calculateRide();
  const stronger = calculateRide({ targetPowerW: 220 });
  const heavier = calculateRide({ riderKg: 70 });
  assert.ok(stronger.totalSeconds < baseline.totalSeconds);
  assert.ok(heavier.totalSeconds > baseline.totalSeconds);
});

test("迎風較慢，高海拔衰減較大也較慢", () => {
  const baseline = calculateRide();
  const windy = calculateRide({ headwindMs: 4 });
  const moreLoss = calculateRide({ altitudeLossPer1000: 0.1 });
  assert.ok(windy.totalSeconds > baseline.totalSeconds);
  assert.ok(moreLoss.totalSeconds > baseline.totalSeconds);
});

test("FTP 均瓦模式三種情境依序變快", () => {
  const scenarios = calculateScenarios({ ...DEFAULTS, pacingMode: "ftp" });
  assert.deepEqual(scenarios.map((scenario) => scenario.powerW), [140, 156, 166]);
  assert.ok(scenarios[0].result.totalSeconds > scenarios[1].result.totalSeconds);
  assert.ok(scenarios[1].result.totalSeconds > scenarios[2].result.totalSeconds);
});

test("AI 配瓦遵守負荷預算與當地 FTP 上限", () => {
  const result = calculateOptimizedRide(DEFAULTS);
  assert.ok(result.timeWeightedEffort <= DEFAULTS.targetIF + 0.005);
  assert.ok(result.timeWeightedEffort >= DEFAULTS.targetIF - 0.01);
  result.segments.forEach((segment) => {
    assert.ok(segment.effortFraction <= 1.000001);
    assert.ok(segment.effortFraction >= DEFAULTS.minimumIF - 0.000001);
    assert.ok(segment.powerW <= segment.localFtpW + 0.001);
  });
});

test("AI 配瓦讓平緩首段輕鬆，後段陡坡提高至 Z3 / Z4", () => {
  const result = calculateOptimizedRide(DEFAULTS);
  assert.ok(result.segments[0].effortFraction <= 0.60);
  assert.ok(result.segments[3].effortFraction > 0.75);
  assert.ok(result.segments.at(-1).effortFraction >= 0.90);
});

test("同負荷預算下 AI 配瓦快於均瓦，較高負荷預算也會更快", () => {
  const optimized = calculateOptimizedRide(DEFAULTS);
  const uniform = calculateRide({ ...DEFAULTS, pacingMode: "ftp" });
  const harder = calculatePlan({ ...DEFAULTS, pacingMode: "ai", targetIF: 0.83 });
  assert.ok(optimized.totalSeconds < uniform.totalSeconds);
  assert.ok(harder.totalSeconds < optimized.totalSeconds);
});

test("直接瓦數模式仍保留正負 10% 比較", () => {
  const scenarios = calculateScenarios({ pacingMode: "direct", targetPowerW: 200 });
  assert.deepEqual(scenarios.map((scenario) => scenario.powerW), [180, 200, 220]);
});

test("時間格式正確", () => {
  assert.equal(formatDuration(4 * 3600 + 3 * 60 + 9), "4:03:09");
});
