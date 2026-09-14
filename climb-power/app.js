import {
  DEFAULTS,
  GEAR_PRESETS,
  WHEEL_SIZES,
  cadenceForTargetPower,
  calculateClimb,
  formatDuration,
  recommendLowerGears,
} from "./calculator.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#climb-form");
const presetSelect = $("#gearPreset");
const frontSelect = $("#frontSelect");
const rearSelect = $("#rearSelect");
const manualFields = $("#manualGearFields");
const manualToggle = $("#manualGearToggle");
const wheelSelect = $("#wheelSize");
const wheelManual = $("#wheelCircumferenceM");

const formatNumber = (value, digits = 0) => new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value);

function option(value, label = value) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function selectedPreset() {
  return GEAR_PRESETS.find((preset) => preset.label === presetSelect.value);
}

function populateGearOptions(preserve = {}) {
  const preset = selectedPreset();
  frontSelect.replaceChildren(...preset.chainrings.map((teeth) => option(teeth, `${teeth}T`)));
  rearSelect.replaceChildren(...preset.cassette.map((teeth) => option(teeth, `${teeth}T`)));
  frontSelect.value = String(preset.chainrings.includes(Number(preserve.frontTeeth)) ? preserve.frontTeeth : preset.chainrings.at(-1));
  rearSelect.value = String(preset.cassette.includes(Number(preserve.rearTeeth)) ? preserve.rearTeeth : preset.cassette.at(-1));
  syncGearInputs();
}

function syncGearInputs() {
  $("#frontTeeth").value = frontSelect.value;
  $("#rearTeeth").value = rearSelect.value;
}

function setManualGearMode(enabled) {
  manualFields.hidden = !enabled;
  $("#presetGearFields").hidden = enabled;
  manualToggle.textContent = enabled ? "改用套件預設" : "手動輸入齒數";
  manualToggle.setAttribute("aria-pressed", String(enabled));
}

function setWheelCircumference() {
  const size = WHEEL_SIZES.find((item) => String(item.circumferenceM) === wheelSelect.value);
  const custom = wheelSelect.value === "custom";
  wheelManual.disabled = !custom;
  if (size) wheelManual.value = size.circumferenceM;
}

function numberInput(id) {
  return Number($("#" + id).value);
}

function settingsFromForm() {
  return {
    gradePercent: numberInput("gradePercent"),
    distanceKm: numberInput("distanceKm"),
    ftpW: numberInput("ftpW"),
    massKg: numberInput("massKg"),
    cadenceRpm: numberInput("cadenceRpm"),
    frontTeeth: numberInput("frontTeeth"),
    rearTeeth: numberInput("rearTeeth"),
    wheelCircumferenceM: numberInput("wheelCircumferenceM"),
    crr: numberInput("crr"),
    cda: numberInput("cda"),
    airDensity: numberInput("airDensity"),
    headwindMs: numberInput("headwindMs"),
    drivetrainEfficiency: numberInput("drivetrainPercent") / 100,
    targetFtpPercent: numberInput("targetFtpPercent"),
    presetLabel: presetSelect.value,
  };
}

function validate(settings) {
  const rules = [
    [settings.gradePercent, 0, 30, "坡度請填 0–30%"],
    [settings.distanceKm, 0.1, 300, "距離請填 0.1–300 km"],
    [settings.ftpW, 80, 600, "FTP 請填 80–600 W"],
    [settings.massKg, 35, 180, "總重量請填 35–180 kg"],
    [settings.cadenceRpm, 20, 140, "轉速請填 20–140 RPM"],
    [settings.frontTeeth, 20, 60, "前盤請填 20–60T"],
    [settings.rearTeeth, 10, 60, "飛輪請填 10–60T"],
    [settings.wheelCircumferenceM, 1.5, 2.5, "輪周長請填 1.5–2.5 m"],
    [settings.crr, 0.001, 0.02, "Crr 請填 0.001–0.020"],
    [settings.cda, 0.15, 0.8, "CdA 請填 0.15–0.80 m²"],
    [settings.airDensity, 0.7, 1.4, "空氣密度請填 0.7–1.4 kg/m³"],
    [settings.headwindMs, -15, 20, "風速請填 -15–20 m/s"],
    [settings.drivetrainEfficiency, 0.85, 1, "傳動效率請填 85–100%"],
    [settings.targetFtpPercent, 60, 100, "目標上限請填 60–100% FTP"],
  ];
  return rules.filter(([value, minimum, maximum]) => !Number.isFinite(value) || value < minimum || value > maximum).map(([, , , message]) => message);
}

function showErrors(errors) {
  const panel = $("#formErrors");
  panel.hidden = errors.length === 0;
  panel.textContent = errors.join("、");
}

function renderRecommendations(settings, result) {
  const targetPowerW = settings.ftpW * settings.targetFtpPercent / 100;
  const panel = $("#recommendations");
  const title = $("#recommendationTitle");
  const copy = $("#recommendationCopy");
  const list = $("#gearRecommendations");
  list.replaceChildren();

  if (result.powerW <= targetPowerW) {
    title.textContent = "目前設定已在目標上限內";
    copy.textContent = `所需功率低於 ${settings.targetFtpPercent}% FTP（${Math.round(targetPowerW)} W）；不必為了這個坡度降低齒比或轉速。`;
    panel.classList.remove("needs-change");
    return;
  }

  panel.classList.add("needs-change");
  title.textContent = `若要守住 ${settings.targetFtpPercent}% FTP`;
  const targetCadence = cadenceForTargetPower(settings, targetPowerW);
  copy.textContent = targetCadence
    ? `維持 ${settings.frontTeeth}/${settings.rearTeeth} 時，轉速約降至 ${Math.round(targetCadence)} RPM；或在 ${settings.cadenceRpm} RPM 改用下列更低齒比。`
    : "即使降至 20 RPM 仍超過目標，建議改用更低齒比或重新設定目標。";

  const gears = recommendLowerGears(settings);
  if (!gears.length) {
    const item = document.createElement("li");
    item.textContent = `在目前列出的 ${selectedPreset().brand} 預設中，沒有能在 ${settings.cadenceRpm} RPM 守住目標的更低齒比。`;
    list.append(item);
    return;
  }
  gears.forEach((gear) => {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${gear.frontTeeth}/${gear.rearTeeth}`;
    const detail = document.createElement("span");
    detail.textContent = `${gear.preset} · 約 ${Math.round(gear.powerW)} W`;
    item.append(strong, detail);
    list.append(item);
  });
}

function render() {
  const settings = settingsFromForm();
  const errors = validate(settings);
  showErrors(errors);
  if (errors.length) return;

  const result = calculateClimb(settings);
  $("#ratio").textContent = `${settings.frontTeeth}/${settings.rearTeeth} · ${result.ratio.toFixed(2)}`;
  $("#speed").textContent = `${formatNumber(result.speedKmh, 1)} km/h`;
  $("#power").textContent = `${formatNumber(result.powerW)} W`;
  $("#ftpPercent").textContent = `${formatNumber(result.ftpFraction * 100)}% FTP`;
  $("#time").textContent = formatDuration(result.seconds);
  $("#energy").textContent = `${formatNumber(result.energyKj)} kJ`;
  $("#cadenceDisplay").textContent = `${formatNumber(settings.cadenceRpm)} RPM`;
  const chip = $("#riskChip");
  chip.textContent = result.risk.label;
  chip.className = `risk-chip ${result.risk.key}`;
  const caution = $("#riskNote");
  if (result.risk.key === "z6" || result.risk.key === "z7") {
    caution.textContent = "Z6、Z7 可以在很短時間內使用，但不適合作為固定均勻坡的維持策略；請改用更低齒比或轉速。";
  } else if (result.risk.key === "z5") {
    caution.textContent = "Z5 是高強度區間；能維持多久高度依個人與當天狀態而異，不宜把它當作長爬坡配速。";
  } else if (result.risk.key === "z4") {
    caution.textContent = "Z4 接近 FTP；實際可維持性仍會受時長、疲勞、補給與環境影響。";
  } else {
    caution.textContent = "這是等速功率估算；實際道路的轉彎、加減速與路況會改變結果。";
  }
  renderRecommendations(settings, result);
}

GEAR_PRESETS.forEach((preset) => presetSelect.append(option(preset.label)));
WHEEL_SIZES.forEach((size) => wheelSelect.append(option(size.circumferenceM, size.label)));
wheelSelect.append(option("custom", "手動輸入輪周長"));
presetSelect.value = GEAR_PRESETS[0].label;
wheelSelect.value = String(DEFAULTS.wheelCircumferenceM);
populateGearOptions(DEFAULTS);
setManualGearMode(false);
setWheelCircumference();

presetSelect.addEventListener("change", () => { populateGearOptions(); render(); });
frontSelect.addEventListener("change", () => { syncGearInputs(); render(); });
rearSelect.addEventListener("change", () => { syncGearInputs(); render(); });
manualToggle.addEventListener("click", () => setManualGearMode(!manualFields.hidden));
wheelSelect.addEventListener("change", () => { setWheelCircumference(); render(); });
form.addEventListener("input", render);
form.addEventListener("change", render);
form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
$("#targetFtpPercent").addEventListener("input", render);
$("#resetButton").addEventListener("click", () => {
  form.reset();
  $("#targetFtpPercent").value = DEFAULTS.targetFtpPercent;
  presetSelect.value = GEAR_PRESETS[0].label;
  wheelSelect.value = String(DEFAULTS.wheelCircumferenceM);
  populateGearOptions(DEFAULTS);
  setManualGearMode(false);
  setWheelCircumference();
  render();
});

render();
