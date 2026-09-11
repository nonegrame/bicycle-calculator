export const COURSE = {
  name: "西進武嶺",
  start: "埔里地理中心碑",
  finish: "武嶺",
  startAltitudeM: 475,
  finishAltitudeM: 3275,
  distanceKm: 53,
  gainM: 2800,
};

export const RAW_SEGMENTS = [
  { from: "地理中心碑", to: "人止關", distanceKm: 16, publishedGrade: 0.021 },
  { from: "人止關", to: "霧社", distanceKm: 6, publishedGrade: 0.064 },
  { from: "霧社", to: "清境", distanceKm: 7.5, publishedGrade: 0.058 },
  { from: "清境", to: "翠峰", distanceKm: 11.5, publishedGrade: 0.072 },
  { from: "翠峰", to: "鳶峰", distanceKm: 6, publishedGrade: 0.08 },
  { from: "鳶峰", to: "昆陽", distanceKm: 5, publishedGrade: 0.074 },
  { from: "昆陽", to: "武嶺", distanceKm: 2, publishedGrade: 0.083 },
];

export const DEFAULTS = {
  pacingMode: "ai",
  ftpW: 200,
  targetIF: 0.78,
  minimumIF: 0.55,
  riderKg: 60,
  bikeKg: 10,
  targetPowerW: 156,
  cda: 0.32,
  crr: 0.0045,
  drivetrainEfficiency: 0.97,
  seaLevelPressureHpa: 1013.25,
  startTempC: 20,
  lapseRateCPerKm: 6.5,
  headwindMs: 0,
  altitudeThresholdM: 1500,
  altitudeLossPer1000: 0.05,
  stoppedMinutes: 0,
  startTime: "06:00",
};

const G = 9.80665;
const AIR_GAS_CONSTANT = 287.0528;
const ISA_T0 = 288.15;
const ISA_LAPSE = 0.0065;
const ISA_PRESSURE = 101325;
const ISA_EXPONENT = 5.25588;

export function buildSegments() {
  const rawDistance = RAW_SEGMENTS.reduce((sum, segment) => sum + segment.distanceKm, 0);
  const distanceScale = COURSE.distanceKm / rawDistance;
  const scaledDistance = RAW_SEGMENTS.map((segment) => segment.distanceKm * distanceScale);
  const rawGainAfterDistanceScaling = RAW_SEGMENTS.reduce(
    (sum, segment, index) => sum + scaledDistance[index] * 1000 * segment.publishedGrade,
    0,
  );
  const gradeScale = COURSE.gainM / rawGainAfterDistanceScaling;

  let cumulativeKm = 0;
  let altitudeM = COURSE.startAltitudeM;

  return RAW_SEGMENTS.map((segment, index) => {
    const distanceKm = scaledDistance[index];
    const grade = segment.publishedGrade * gradeScale;
    const gainM = distanceKm * 1000 * grade;
    const startAltitudeM = altitudeM;
    const endAltitudeM = index === RAW_SEGMENTS.length - 1
      ? COURSE.finishAltitudeM
      : altitudeM + gainM;
    const result = {
      ...segment,
      id: `${segment.from}-${segment.to}`,
      label: `${segment.from} → ${segment.to}`,
      distanceKm,
      grade,
      gainM: endAltitudeM - startAltitudeM,
      startKm: cumulativeKm,
      endKm: cumulativeKm + distanceKm,
      startAltitudeM,
      endAltitudeM,
      midpointAltitudeM: (startAltitudeM + endAltitudeM) / 2,
    };
    cumulativeKm = result.endKm;
    altitudeM = result.endAltitudeM;
    return result;
  });
}

export function isaPressurePa(altitudeM, seaLevelPressureHpa = DEFAULTS.seaLevelPressureHpa) {
  const base = Math.max(0.01, 1 - (ISA_LAPSE * altitudeM) / ISA_T0);
  return ISA_PRESSURE * (seaLevelPressureHpa / 1013.25) * Math.pow(base, ISA_EXPONENT);
}

export function airDensityKgM3(altitudeM, temperatureC, seaLevelPressureHpa) {
  const pressure = isaPressurePa(altitudeM, seaLevelPressureHpa);
  return pressure / (AIR_GAS_CONSTANT * (temperatureC + 273.15));
}

export function availablePowerAtAltitude(basePowerW, altitudeM, thresholdM, lossPer1000) {
  const elevationAboveThreshold = Math.max(0, altitudeM - thresholdM);
  const multiplier = Math.max(0.55, 1 - lossPer1000 * elevationAboveThreshold / 1000);
  return basePowerW * multiplier;
}

export function solveSpeedMs({
  riderPowerW,
  massKg,
  grade,
  crr,
  cda,
  airDensity,
  headwindMs,
  drivetrainEfficiency,
}) {
  const theta = Math.atan(grade);
  const gravityForce = massKg * G * Math.sin(theta);
  const rollingForce = massKg * G * Math.cos(theta) * crr;
  const wheelPower = riderPowerW * drivetrainEfficiency;

  const requiredPower = (speedMs) => {
    const relativeAirSpeed = speedMs + headwindMs;
    const aeroForce = 0.5 * airDensity * cda * relativeAirSpeed * Math.abs(relativeAirSpeed);
    return (gravityForce + rollingForce + aeroForce) * speedMs;
  };

  let low = 0.15;
  let high = 40;
  for (let i = 0; i < 90; i += 1) {
    const mid = (low + high) / 2;
    if (requiredPower(mid) > wheelPower) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

export function calculateRide(input = {}) {
  const settings = { ...DEFAULTS, ...input };
  const massKg = settings.riderKg + settings.bikeKg;
  const segments = buildSegments();
  let elapsedSeconds = 0;

  const calculatedSegments = segments.map((segment, index) => {
    const tempC = settings.startTempC
      - settings.lapseRateCPerKm * (segment.midpointAltitudeM - COURSE.startAltitudeM) / 1000;
    const airDensity = airDensityKgM3(
      segment.midpointAltitudeM,
      tempC,
      settings.seaLevelPressureHpa,
    );
    const localFtpW = availablePowerAtAltitude(
      settings.ftpW,
      segment.midpointAltitudeM,
      settings.altitudeThresholdM,
      settings.altitudeLossPer1000,
    );
    const plannedIntensity = Array.isArray(settings.segmentIntensities)
      ? settings.segmentIntensities[index]
      : null;
    const powerW = plannedIntensity === null
      ? availablePowerAtAltitude(
        settings.targetPowerW,
        segment.midpointAltitudeM,
        settings.altitudeThresholdM,
        settings.altitudeLossPer1000,
      )
      : localFtpW * plannedIntensity;
    const speedMs = solveSpeedMs({
      riderPowerW: powerW,
      massKg,
      grade: segment.grade,
      crr: settings.crr,
      cda: settings.cda,
      airDensity,
      headwindMs: settings.headwindMs,
      drivetrainEfficiency: settings.drivetrainEfficiency,
    });
    const seconds = segment.distanceKm * 1000 / speedMs;
    elapsedSeconds += seconds;
    return {
      ...segment,
      tempC,
      airDensity,
      localFtpW,
      effortFraction: powerW / localFtpW,
      powerW,
      speedKmh: speedMs * 3.6,
      seconds,
      cumulativeSeconds: elapsedSeconds,
    };
  });

  const movingSeconds = calculatedSegments.reduce((sum, segment) => sum + segment.seconds, 0);
  const totalSeconds = movingSeconds + settings.stoppedMinutes * 60;
  const energyKj = calculatedSegments.reduce(
    (sum, segment) => sum + segment.powerW * segment.seconds / 1000,
    0,
  );
  const timeWeightedEffort = calculatedSegments.reduce(
    (sum, segment) => sum + segment.effortFraction * segment.seconds,
    0,
  ) / movingSeconds;

  return {
    settings,
    segments: calculatedSegments,
    massKg,
    movingSeconds,
    totalSeconds,
    averageSpeedKmh: COURSE.distanceKm / (movingSeconds / 3600),
    energyKj,
    timeWeightedEffort,
    verticalRateMPerHour: COURSE.gainM / (movingSeconds / 3600),
  };
}

function optimizerOptions(settings) {
  const massKg = settings.riderKg + settings.bikeKg;
  const minimumIF = Math.min(settings.minimumIF, settings.targetIF);
  const intensities = [];
  for (let intensity = minimumIF; intensity < 1.0001; intensity += 0.005) {
    intensities.push(Math.min(1, intensity));
  }
  if (intensities.at(-1) < 1) intensities.push(1);

  return buildSegments().map((segment) => {
    const tempC = settings.startTempC
      - settings.lapseRateCPerKm * (segment.midpointAltitudeM - COURSE.startAltitudeM) / 1000;
    const airDensity = airDensityKgM3(
      segment.midpointAltitudeM,
      tempC,
      settings.seaLevelPressureHpa,
    );
    const localFtpW = availablePowerAtAltitude(
      settings.ftpW,
      segment.midpointAltitudeM,
      settings.altitudeThresholdM,
      settings.altitudeLossPer1000,
    );

    return intensities.map((intensity) => {
      const powerW = localFtpW * intensity;
      const speedMs = solveSpeedMs({
        riderPowerW: powerW,
        massKg,
        grade: segment.grade,
        crr: settings.crr,
        cda: settings.cda,
        airDensity,
        headwindMs: settings.headwindMs,
        drivetrainEfficiency: settings.drivetrainEfficiency,
      });
      const seconds = segment.distanceKm * 1000 / speedMs;
      return {
        intensity,
        seconds,
        budgetDelta: (intensity - settings.targetIF) * seconds,
      };
    });
  });
}

export function calculateOptimizedRide(input = {}) {
  const settings = { ...DEFAULTS, ...input, pacingMode: "ai" };
  const options = optimizerOptions(settings);

  const selectForPenalty = (penalty) => options.map((segmentOptions) => (
    segmentOptions.reduce((best, candidate) => {
      const bestScore = best.seconds + penalty * best.budgetDelta;
      const candidateScore = candidate.seconds + penalty * candidate.budgetDelta;
      return candidateScore < bestScore ? candidate : best;
    })
  ));

  let lowPenalty = 0;
  let highPenalty = 100;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const penalty = (lowPenalty + highPenalty) / 2;
    const selected = selectForPenalty(penalty);
    const budgetDelta = selected.reduce((sum, option) => sum + option.budgetDelta, 0);
    if (budgetDelta > 0) lowPenalty = penalty;
    else highPenalty = penalty;
  }

  const selected = selectForPenalty(highPenalty);
  const segmentIntensities = selected.map((option) => option.intensity);
  const result = calculateRide({ ...settings, segmentIntensities });
  return {
    ...result,
    optimization: {
      method: "time-minimization-with-load-budget",
      targetEffort: settings.targetIF,
      achievedEffort: result.timeWeightedEffort,
      minimumEffort: settings.minimumIF,
      maximumEffort: 1,
      step: 0.005,
    },
  };
}

export function calculatePlan(input = {}) {
  const settings = { ...DEFAULTS, ...input };
  return settings.pacingMode === "ai" ? calculateOptimizedRide(settings) : calculateRide(settings);
}

export function calculateScenarios(input = {}) {
  if (input.pacingMode === "ai" || (!input.pacingMode && DEFAULTS.pacingMode === "ai")) {
    const targetIF = Number(input.targetIF ?? DEFAULTS.targetIF);
    const zoneFor = (intensity) => intensity <= 0.75 ? "負荷預算" : intensity <= 0.90 ? "負荷預算" : "高負荷";
    return [
      { key: "steady", label: "保守", intensity: Math.max(0.55, targetIF - 0.05) },
      { key: "target", label: "目標", intensity: targetIF },
      { key: "stretch", label: "進取", intensity: Math.min(0.95, targetIF + 0.05) },
    ].map((scenario) => ({
      ...scenario,
      zone: zoneFor(scenario.intensity),
      powerW: Math.round(Number(input.ftpW ?? DEFAULTS.ftpW) * scenario.intensity),
      result: calculateOptimizedRide({ ...input, targetIF: scenario.intensity }),
    }));
  }

  if (input.pacingMode === "ftp" || (!input.pacingMode && DEFAULTS.pacingMode === "ftp")) {
    const ftpW = Number(input.ftpW ?? DEFAULTS.ftpW);
    const targetIF = Number(input.targetIF ?? DEFAULTS.targetIF);
    const zoneFor = (intensity) => intensity <= 0.55 ? "Z1" : intensity <= 0.75 ? "Z2" : intensity <= 0.90 ? "Z3" : "Z4";
    return [
      { key: "steady", label: "保守", intensity: Math.max(0.55, targetIF - 0.08) },
      { key: "target", label: "目標", intensity: targetIF },
      { key: "stretch", label: "進取", intensity: Math.min(0.95, targetIF + 0.05) },
    ].map((scenario) => {
      const powerW = ftpW * scenario.intensity;
      return {
        ...scenario,
        zone: zoneFor(scenario.intensity),
        powerW: Math.round(powerW),
        result: calculateRide({ ...input, targetPowerW: powerW }),
      };
    });
  }

  const basePower = Number(input.targetPowerW ?? DEFAULTS.targetPowerW);
  return [
    { key: "steady", label: "保守", factor: 0.9 },
    { key: "target", label: "目標", factor: 1 },
    { key: "stretch", label: "進取", factor: 1.1 },
  ].map((scenario) => {
    const powerW = basePower * scenario.factor;
    return {
      ...scenario,
      powerW: Math.round(powerW),
      result: calculateRide({ ...input, targetPowerW: powerW }),
    };
  });
}

export function formatDuration(totalSeconds) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function clockTime(startTime, elapsedSeconds) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + Math.round(elapsedSeconds / 60);
  const dayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(dayMinutes / 60)).padStart(2, "0")}:${String(dayMinutes % 60).padStart(2, "0")}`;
}
