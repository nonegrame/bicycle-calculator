export const DEFAULTS = {
  gradePercent: 8,
  distanceKm: 5,
  ftpW: 200,
  massKg: 70,
  cadenceRpm: 70,
  frontTeeth: 34,
  rearTeeth: 34,
  wheelCircumferenceM: 2.136,
  crr: 0.0045,
  cda: 0.32,
  airDensity: 1.225,
  headwindMs: 0,
  drivetrainEfficiency: 0.97,
  targetFtpPercent: 85,
};

export const WHEEL_SIZES = [
  { label: "700×25", circumferenceM: 2.105 },
  { label: "700×28", circumferenceM: 2.136 },
  { label: "700×30", circumferenceM: 2.147 },
  { label: "700×32", circumferenceM: 2.155 },
];

export const GEAR_PRESETS = [
  { brand: "Shimano", label: "Compact 50/34 · 11–34", chainrings: [50, 34], cassette: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34] },
  { brand: "Shimano", label: "Compact 50/34 · 11–36", chainrings: [50, 34], cassette: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34, 36] },
  { brand: "Shimano", label: "Semi-compact 52/36 · 11–34", chainrings: [52, 36], cassette: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34] },
  { brand: "SRAM", label: "Compact 48/35 · 10–36", chainrings: [48, 35], cassette: [10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 28, 32, 36] },
  { brand: "SRAM", label: "Sub-compact 46/33 · 10–36", chainrings: [46, 33], cassette: [10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 28, 32, 36] },
];

const G = 9.80665;

export function gearRatio(frontTeeth, rearTeeth) {
  return frontTeeth / rearTeeth;
}

export function gearSpeedKmh({ cadenceRpm, frontTeeth, rearTeeth, wheelCircumferenceM }) {
  return cadenceRpm * gearRatio(frontTeeth, rearTeeth) * wheelCircumferenceM * 0.06;
}

export function requiredPowerW({
  speedKmh,
  gradePercent,
  massKg,
  crr,
  cda,
  airDensity,
  headwindMs,
  drivetrainEfficiency,
}) {
  const speedMs = speedKmh / 3.6;
  const theta = Math.atan(gradePercent / 100);
  const gravityForce = massKg * G * Math.sin(theta);
  const rollingForce = massKg * G * Math.cos(theta) * crr;
  const relativeAirSpeed = speedMs + headwindMs;
  const aeroForce = 0.5 * airDensity * cda * relativeAirSpeed * Math.abs(relativeAirSpeed);
  const wheelPower = (gravityForce + rollingForce + aeroForce) * speedMs;
  return Math.max(0, wheelPower / drivetrainEfficiency);
}

export function calculateClimb(input = {}) {
  const settings = { ...DEFAULTS, ...input };
  const speedKmh = gearSpeedKmh(settings);
  const powerW = requiredPowerW({ ...settings, speedKmh });
  const seconds = settings.distanceKm * 1000 / (speedKmh / 3.6);
  const ftpFraction = powerW / settings.ftpW;
  return {
    settings,
    ratio: gearRatio(settings.frontTeeth, settings.rearTeeth),
    speedKmh,
    powerW,
    seconds,
    energyKj: powerW * seconds / 1000,
    ftpFraction,
    risk: ftpRisk(ftpFraction),
  };
}

export function ftpRisk(ftpFraction) {
  if (ftpFraction <= 0.55) return { key: "z1", zone: "Z1", label: "Z1 恢復" };
  if (ftpFraction <= 0.75) return { key: "z2", zone: "Z2", label: "Z2 耐力" };
  if (ftpFraction <= 0.90) return { key: "z3", zone: "Z3", label: "Z3 節奏" };
  if (ftpFraction <= 1.05) return { key: "z4", zone: "Z4", label: "Z4 閾值" };
  if (ftpFraction <= 1.20) return { key: "z5", zone: "Z5", label: "Z5 VO₂max" };
  if (ftpFraction <= 1.50) return { key: "z6", zone: "Z6", label: "Z6 無氧" };
  return { key: "z7", zone: "Z7", label: "Z7 神經肌力" };
}

export function cadenceForTargetPower(input = {}, targetPowerW) {
  const settings = { ...DEFAULTS, ...input };
  const powerAt = (cadenceRpm) => calculateClimb({ ...settings, cadenceRpm }).powerW;
  const minimumCadence = 20;
  const maximumCadence = 140;
  if (powerAt(minimumCadence) > targetPowerW) return null;
  if (powerAt(maximumCadence) <= targetPowerW) return maximumCadence;

  let low = minimumCadence;
  let high = maximumCadence;
  for (let index = 0; index < 70; index += 1) {
    const midpoint = (low + high) / 2;
    if (powerAt(midpoint) > targetPowerW) high = midpoint;
    else low = midpoint;
  }
  return (low + high) / 2;
}

export function recommendLowerGears(input = {}, presets = GEAR_PRESETS) {
  const settings = { ...DEFAULTS, ...input };
  const targetPowerW = settings.ftpW * settings.targetFtpPercent / 100;
  const currentRatio = gearRatio(settings.frontTeeth, settings.rearTeeth);
  const currentBrand = presets.find((preset) => preset.label === settings.presetLabel)?.brand;
  const candidates = presets
    .filter((preset) => !currentBrand || preset.brand === currentBrand)
    .flatMap((preset) => preset.chainrings.flatMap((frontTeeth) => preset.cassette.map((rearTeeth) => ({
      preset: preset.label,
      frontTeeth,
      rearTeeth,
      ratio: gearRatio(frontTeeth, rearTeeth),
    }))))
    .filter((candidate) => candidate.ratio < currentRatio - 0.0001)
    .map((candidate) => ({
      ...candidate,
      powerW: calculateClimb({ ...settings, ...candidate }).powerW,
    }))
    .filter((candidate) => candidate.powerW <= targetPowerW)
    .sort((a, b) => b.powerW - a.powerW || b.ratio - a.ratio);

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.frontTeeth}/${candidate.rearTeeth}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

export function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
