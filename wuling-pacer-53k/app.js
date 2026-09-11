import {
  COURSE,
  DEFAULTS,
  buildSegments,
  calculatePlan,
  calculateScenarios,
  clockTime,
  formatDuration,
} from "./calculator.js?v=1.1";

const form = document.querySelector("#pace-form");
const errorsBox = document.querySelector("#form-errors");

const fieldRules = {
  ftpW: [80, 500, "FTP 請填 80–500 W"],
  targetIFPercent: [55, 95, "目標強度請填 55–95% FTP"],
  minimumIFPercent: [40, 75, "最低區間強度請填 40–75% FTP"],
  riderKg: [35, 150, "體重請填 35–150 kg"],
  bikeKg: [5, 25, "車重＋裝備請填 5–25 kg"],
  targetPowerW: [80, 500, "目標功率請填 80–500 W"],
  startTempC: [-5, 40, "埔里氣溫請填 -5–40°C"],
  headwindMs: [-5, 15, "風速請填 -5–15 m/s"],
  seaLevelPressureHpa: [950, 1050, "海平面氣壓請填 950–1050 hPa"],
  lapseRateCPerKm: [3, 10, "氣溫遞減率請填 3–10°C/km"],
  altitudeThresholdM: [0, 3000, "衰減起點請填 0–3000 m"],
  altitudeLossPercent: [0, 12, "功率衰減請填 0–12%/km"],
  cda: [0.18, 0.6, "CdA 請填 0.18–0.60 m²"],
  crr: [0.002, 0.015, "Crr 請填 0.002–0.015"],
  drivetrainPercent: [85, 100, "傳動效率請填 85–100%"],
  stoppedMinutes: [0, 120, "停留時間請填 0–120 分鐘"],
};

function readSettings() {
  const values = {};
  const errors = [];
  const pacingMode = form.elements.pacingMode.value;
  const inactiveFields = pacingMode === "ai"
    ? new Set(["targetPowerW"])
    : pacingMode === "ftp"
      ? new Set(["targetPowerW", "minimumIFPercent"])
      : new Set(["ftpW", "targetIFPercent", "minimumIFPercent"]);
  Object.entries(fieldRules).forEach(([name, [min, max, message]]) => {
    const input = form.elements[name];
    const value = Number(input.value);
    input.removeAttribute("aria-invalid");
    if (!inactiveFields.has(name) && (!Number.isFinite(value) || value < min || value > max)) {
      errors.push(message);
      input.setAttribute("aria-invalid", "true");
    }
    values[name] = value;
  });
  values.altitudeLossPer1000 = values.altitudeLossPercent / 100;
  values.drivetrainEfficiency = values.drivetrainPercent / 100;
  values.pacingMode = pacingMode;
  values.targetIF = values.targetIFPercent / 100;
  values.minimumIF = values.minimumIFPercent / 100;
  if (values.pacingMode === "ftp" || values.pacingMode === "ai") {
    values.targetPowerW = values.ftpW * values.targetIF;
  }
  if (values.pacingMode === "ai" && values.minimumIF > values.targetIF) {
    errors.push("平緩路段最低強度不可高於全程負荷預算");
    form.elements.minimumIFPercent.setAttribute("aria-invalid", "true");
  }
  values.startTime = form.elements.startTime.value || DEFAULTS.startTime;
  return { values, errors };
}

function intensityLabel(intensity) {
  if (intensity <= 0.72) return "保守";
  if (intensity <= 0.80) return "穩健";
  if (intensity <= 0.85) return "進取";
  return "高風險";
}

function updateDerivedPower() {
  const ftp = Number(form.elements.ftpW.value);
  const intensity = Number(form.elements.targetIFPercent.value) / 100;
  const power = ftp * intensity;
  const mode = form.elements.pacingMode.value;
  document.querySelector("#derived-label").textContent = mode === "ai" ? "AI 配瓦範圍" : "低海拔計畫功率";
  document.querySelector("#derived-power").textContent = mode === "ai"
    ? "自動計算"
    : Number.isFinite(power) ? `${Math.round(power)} W` : "—";
  document.querySelector("#intensity-badge").textContent = mode === "ai"
    ? "FTP 封頂"
    : Number.isFinite(intensity) ? intensityLabel(intensity) : "—";
}

function setPacingMode(mode) {
  form.elements.pacingMode.value = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-pacing-panel]").forEach((panel) => {
    panel.hidden = !panel.dataset.pacingPanel.split(/\s+/).includes(mode);
  });
  document.querySelector("#target-if-label").textContent = mode === "ai" ? "全程負荷預算" : "目標強度 IF";
  document.querySelector("#ftp-mode-hint").textContent = mode === "ai"
    ? "負荷預算是時間加權的相對強度，不是叫每段都騎同一百分比；最佳化器會自動把瓦數留給陡坡。"
    : "FTP 均瓦模式讓每一段維持相同計畫 IF，再套用高海拔衰減；實騎 IF 仍應由 NP ÷ FTP 計算。";
  document.querySelector(".primary-button").innerHTML = `${mode === "ai" ? "計算最佳配瓦" : "重新計算配速"} <span>→</span>`;
}

function renderProfile() {
  const svg = document.querySelector("#profile-chart");
  const labels = document.querySelector("#profile-labels");
  const segments = buildSegments();
  const points = [{ distanceKm: 0, altitudeM: COURSE.startAltitudeM, label: "埔里" }];
  segments.forEach((segment) => points.push({
    distanceKm: segment.endKm,
    altitudeM: segment.endAltitudeM,
    label: segment.to,
  }));

  const x = (km) => 30 + (km / COURSE.distanceKm) * 940;
  const y = (alt) => 210 - ((alt - 300) / 3150) * 180;
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.distanceKm)},${y(point.altitudeM)}`).join(" ");
  const area = `${line} L970,222 L30,222 Z`;
  const gridLines = [1000, 2000, 3000].map((altitude) => `
    <line x1="30" y1="${y(altitude)}" x2="970" y2="${y(altitude)}" class="grid-line" />
    <text x="31" y="${y(altitude) - 7}" class="grid-text">${altitude.toLocaleString()}M</text>`).join("");
  const dots = points.map((point) => `<circle cx="${x(point.distanceKm)}" cy="${y(point.altitudeM)}" r="4.5" />`).join("");
  svg.innerHTML = `
    <defs>
      <linearGradient id="mountain-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#c8ff3d" stop-opacity=".34" />
        <stop offset="1" stop-color="#c8ff3d" stop-opacity=".02" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${area}" class="profile-area" />
    <path d="${line}" class="profile-line" />
    <g class="profile-dots">${dots}</g>`;
  labels.innerHTML = points.map((point, index) => `
    <span style="left:${(point.distanceKm / COURSE.distanceKm) * 100}%" class="${index === 0 ? "first" : index === points.length - 1 ? "last" : ""}">${point.label}</span>`).join("");
}

function renderScenarios(settings) {
  const scenarios = calculateScenarios(settings);
  document.querySelector("#scenario-grid").innerHTML = scenarios.map((scenario) => `
    <div class="scenario ${scenario.key === "target" ? "active" : ""}">
      <div><span>${scenario.label}</span><strong>${settings.pacingMode === "ai" ? `${Math.round(scenario.intensity * 100)}% 負荷` : `${scenario.powerW} W`}</strong></div>
      ${scenario.intensity ? `<small>${settings.pacingMode === "ai" ? `${Math.round(Math.min(...scenario.result.segments.map((segment) => segment.powerW)))}–${Math.round(Math.max(...scenario.result.segments.map((segment) => segment.powerW)))} W` : `${Math.round(scenario.intensity * 100)}% FTP · ${scenario.zone}`}</small>` : ""}
      <b>${formatDuration(scenario.result.totalSeconds)}</b>
    </div>`).join("");
}

function formatGoalDelta(seconds) {
  const roundedMinutes = Math.max(1, Math.round(Math.abs(seconds) / 60));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return hours ? `${hours} 小時 ${minutes} 分` : `${minutes} 分`;
}

function renderResult(settings) {
  const result = calculatePlan(settings);
  const diff = result.totalSeconds - 4 * 3600;
  const chip = document.querySelector("#goal-chip");
  document.querySelector("#total-time").textContent = formatDuration(result.totalSeconds);
  document.querySelector("#avg-speed").textContent = `${result.averageSpeedKmh.toFixed(1)} km/h`;
  document.querySelector("#intensity-label").textContent = settings.pacingMode === "ai"
    ? "平均相對負荷"
    : settings.pacingMode === "ftp" ? "計畫強度" : "起始 W/kg";
  document.querySelector("#intensity-value").textContent = settings.pacingMode === "ai"
    ? `${result.timeWeightedEffort.toFixed(2)} · FTP 封頂`
    : settings.pacingMode === "ftp"
      ? `${settings.targetIF.toFixed(2)} IF · ${(settings.targetPowerW / result.massKg).toFixed(2)} W/kg`
      : `${(settings.targetPowerW / result.massKg).toFixed(2)} W/kg`;
  document.querySelector("#finish-clock").textContent = clockTime(settings.startTime, result.totalSeconds);
  document.querySelector("#vam").textContent = `${Math.round(result.verticalRateMPerHour)} m/h`;
  document.querySelector("#energy").textContent = `${Math.round(result.energyKj).toLocaleString()} kJ`;
  if (settings.pacingMode === "ai") {
    const powers = result.segments.map((segment) => segment.powerW);
    document.querySelector("#derived-power").textContent = `${Math.round(Math.min(...powers))}–${Math.round(Math.max(...powers))} W`;
    document.querySelector("#intensity-badge").textContent = `${Math.round(result.timeWeightedEffort * 100)}% 負荷`;
  }

  chip.className = `goal-chip ${diff <= 0 ? "under" : "over"}`;
  chip.textContent = diff <= 0
    ? `快於 4 小時 ${formatGoalDelta(diff)}`
    : `超過 4 小時 ${formatGoalDelta(diff)}`;

  document.querySelector("#split-table").innerHTML = result.segments.map((segment, index) => {
    const allocatedStop = result.segments.length === index + 1 ? settings.stoppedMinutes * 60 : 0;
    const arrival = segment.cumulativeSeconds + allocatedStop;
    return `<tr>
      <td><span class="split-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${segment.from}</strong><span>至 ${segment.to} · ${Math.round(segment.endAltitudeM).toLocaleString()}m</span></div></td>
      <td><strong>${segment.distanceKm.toFixed(1)} km</strong><span>${(segment.grade * 100).toFixed(1)}%</span></td>
      <td><strong>${Math.round(segment.powerW)} W</strong><span>${settings.pacingMode === "ai" ? `${Math.round(segment.effortFraction * 100)}% 當地 FTP · ${segment.effortFraction > 0.90 ? "Z4" : segment.effortFraction > 0.75 ? "Z3" : segment.effortFraction > 0.55 ? "Z2" : "Z1"}` : settings.pacingMode === "ftp" ? `${segment.effortFraction.toFixed(2)} 計畫 IF` : segment.midpointAltitudeM > settings.altitudeThresholdM ? "已套用海拔" : "未衰減"}</span></td>
      <td><strong>${segment.speedKmh.toFixed(1)}</strong><span>km/h</span></td>
      <td><strong>${formatDuration(segment.seconds)}</strong><span>h:mm:ss</span></td>
      <td><strong>${clockTime(settings.startTime, arrival)}</strong><span>累計 ${formatDuration(segment.cumulativeSeconds)}</span></td>
    </tr>`;
  }).join("");
  renderScenarios(settings);
}

function submitForm(event) {
  event?.preventDefault();
  const { values, errors } = readSettings();
  if (errors.length) {
    errorsBox.hidden = false;
    errorsBox.innerHTML = `<strong>請先修正 ${errors.length} 個欄位</strong><ul>${errors.map((error) => `<li>${error}</li>`).join("")}</ul>`;
    errorsBox.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  errorsBox.hidden = true;
  renderResult(values);
}

function resetForm() {
  form.reset();
  Object.entries(DEFAULTS).forEach(([name, value]) => {
    const translatedName = name === "altitudeLossPer1000"
      ? "altitudeLossPercent"
      : name === "drivetrainEfficiency"
        ? "drivetrainPercent"
        : name === "targetIF"
          ? "targetIFPercent"
        : name === "minimumIF"
          ? "minimumIFPercent"
        : name;
    const input = form.elements[translatedName];
    if (!input) return;
    input.value = name === "altitudeLossPer1000" || name === "drivetrainEfficiency" || name === "targetIF" || name === "minimumIF"
      ? value * 100
      : name === "targetPowerW"
        ? 200
        : value;
  });
  errorsBox.hidden = true;
  setPacingMode(DEFAULTS.pacingMode);
  updateDerivedPower();
  submitForm();
}

form.addEventListener("submit", submitForm);
form.addEventListener("input", (event) => {
  event.target.removeAttribute("aria-invalid");
  if (event.target.name === "ftpW" || event.target.name === "targetIFPercent") updateDerivedPower();
});
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setPacingMode(button.dataset.mode);
    updateDerivedPower();
    submitForm();
  });
});
document.querySelector("#reset-button").addEventListener("click", resetForm);

renderProfile();
setPacingMode(DEFAULTS.pacingMode);
updateDerivedPower();
submitForm();
