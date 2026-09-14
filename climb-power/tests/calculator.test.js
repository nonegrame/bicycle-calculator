import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  cadenceForTargetPower,
  calculateClimb,
  ftpRisk,
  gearSpeedKmh,
  recommendLowerGears,
} from "../calculator.js";

test("齒比、轉速與輪周長換算正確地速", () => {
  const speed = gearSpeedKmh({ cadenceRpm: 70, frontTeeth: 34, rearTeeth: 34, wheelCircumferenceM: 2.136 });
  assert.equal(speed, 8.9712);
});

test("坡度、重量與迎風提高時，所需功率增加", () => {
  const baseline = calculateClimb();
  assert.ok(calculateClimb({ gradePercent: 10 }).powerW > baseline.powerW);
  assert.ok(calculateClimb({ massKg: 80 }).powerW > baseline.powerW);
  assert.ok(calculateClimb({ headwindMs: 4 }).powerW > baseline.powerW);
});

test("較低齒比與較低轉速會降低速度和所需功率", () => {
  const baseline = calculateClimb();
  const lowerGear = calculateClimb({ rearTeeth: 36 });
  const lowerCadence = calculateClimb({ cadenceRpm: 60 });
  assert.ok(lowerGear.speedKmh < baseline.speedKmh);
  assert.ok(lowerGear.powerW < baseline.powerW);
  assert.ok(lowerCadence.speedKmh < baseline.speedKmh);
  assert.ok(lowerCadence.powerW < baseline.powerW);
});

test("距離換算時間與能量，FTP Z1–Z7 分區邊界正確", () => {
  const result = calculateClimb({ distanceKm: 10 });
  assert.ok(result.seconds > 0);
  assert.equal(result.energyKj, result.powerW * result.seconds / 1000);
  assert.equal(ftpRisk(0.55).key, "z1");
  assert.equal(ftpRisk(0.56).key, "z2");
  assert.equal(ftpRisk(0.76).key, "z3");
  assert.equal(ftpRisk(0.91).key, "z4");
  assert.equal(ftpRisk(1.06).key, "z5");
  assert.equal(ftpRisk(1.21).key, "z6");
  assert.equal(ftpRisk(1.51).key, "z7");
});

test("反推轉速與較低齒比皆符合目標 FTP 上限", () => {
  const settings = { ...DEFAULTS, gradePercent: 8, cadenceRpm: 85, targetFtpPercent: 88, presetLabel: "Compact 50/34 · 11–34" };
  const targetPowerW = settings.ftpW * settings.targetFtpPercent / 100;
  const cadence = cadenceForTargetPower(settings, targetPowerW);
  assert.ok(cadence < settings.cadenceRpm);
  assert.ok(calculateClimb({ ...settings, cadenceRpm: cadence }).powerW <= targetPowerW + 0.001);
  const gears = recommendLowerGears(settings);
  assert.ok(gears.length > 0);
  gears.forEach((gear) => {
    assert.ok(gear.ratio < settings.frontTeeth / settings.rearTeeth);
    assert.ok(gear.powerW <= targetPowerW);
  });
});
