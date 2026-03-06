const OVERRIDES_KEY = "gymLoadoutPlanner.targetOverrides.v1";
const BAND_OVERRIDES_KEY = "gymLoadoutPlanner.bandTargetOverrides.v1";
const BAND_CHOSEN_COMBO_KEY = "gymLoadoutPlanner.bandChosenCombo.v1";
const WEIGHT_CHOSEN_SETUP_KEY = "gymLoadoutPlanner.weightChosenSetup.v1";
const DB_BASE_IMPLEMENT_KEY = "gymLoadoutPlanner.dbBaseImplement.v1";
const AVAILABLE_DAYS = [1, 2, 4, 5, 6];
const MAX_BANDS_PER_COMBO = 12;
const MAX_DISPLAY_OPTIONS = 4;
const MAX_CANDIDATES = 12;
const SOLVER_TIME_BUDGET_MS = 60;
const DAY_SOLVER_TIME_BUDGET_MS = 80;
const DAY_WEIGHT_SOLVER_TIME_BUDGET_MS = 120;

const state = {
  gear: null,
  program: null,
  selectedPhase: 1,
  selectedDay: 1,
  exerciseById: new Map(),
  overrides: loadOverrides(OVERRIDES_KEY),
  bandTargetOverrides: loadOverrides(BAND_OVERRIDES_KEY),
  bandChosenCombo: loadOverrides(BAND_CHOSEN_COMBO_KEY),
  weightChosenSetup: loadOverrides(WEIGHT_CHOSEN_SETUP_KEY),
  dbBaseImplement: loadOverrides(DB_BASE_IMPLEMENT_KEY)
};

const phaseSelect = document.getElementById("phaseSelect");
const daySelect = document.getElementById("daySelect");
const statusLine = document.getElementById("statusLine");
const exerciseList = document.getElementById("exerciseList");
const resetOverridesBtn = document.getElementById("resetOverridesBtn");
const exerciseCardTemplate = document.getElementById("exerciseCardTemplate");

init().catch((error) => {
  console.error(error);
  statusLine.textContent = "Failed to load data. Check console for details.";
});

async function init() {
  const [gear, program] = await Promise.all([
    fetchJson("./data/gear.json"),
    fetchJson("./data/program.json")
  ]);

  state.gear = gear;
  state.program = program;
  buildExerciseMap(program);
  setupControls(program);
  render();
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }
  return response.json();
}

function setupControls(program) {
  populatePhaseSelect(program.phases);
  populateDaySelect();
  ensureResetSavedChoicesButton();

  phaseSelect.addEventListener("change", () => {
    state.selectedPhase = Number(phaseSelect.value);
    render();
  });

  daySelect.addEventListener("change", () => {
    state.selectedDay = Number(daySelect.value);
    render();
  });

  resetOverridesBtn.addEventListener("click", () => {
    localStorage.removeItem(OVERRIDES_KEY);
    localStorage.removeItem(BAND_OVERRIDES_KEY);
    localStorage.removeItem(BAND_CHOSEN_COMBO_KEY);
    localStorage.removeItem(WEIGHT_CHOSEN_SETUP_KEY);
    localStorage.removeItem(DB_BASE_IMPLEMENT_KEY);
    state.overrides = {};
    state.bandTargetOverrides = {};
    state.bandChosenCombo = {};
    state.weightChosenSetup = {};
    state.dbBaseImplement = {};
    render();
  });

  const resetSavedChoicesBtn = document.getElementById("resetSavedChoicesBtn");
  if (resetSavedChoicesBtn) {
    resetSavedChoicesBtn.addEventListener("click", () => {
      clearGymPlannerLocalStorage();
      state.overrides = loadOverrides(OVERRIDES_KEY);
      state.bandTargetOverrides = loadOverrides(BAND_OVERRIDES_KEY);
      state.bandChosenCombo = loadOverrides(BAND_CHOSEN_COMBO_KEY);
      state.weightChosenSetup = loadOverrides(WEIGHT_CHOSEN_SETUP_KEY);
      state.dbBaseImplement = loadOverrides(DB_BASE_IMPLEMENT_KEY);
      render();
    });
  }
}

function ensureResetSavedChoicesButton() {
  if (document.getElementById("resetSavedChoicesBtn")) {
    return;
  }
  const controls = resetOverridesBtn?.parentElement;
  if (!controls) {
    return;
  }
  const btn = document.createElement("button");
  btn.id = "resetSavedChoicesBtn";
  btn.type = "button";
  btn.textContent = "Reset saved choices";
  controls.insertBefore(btn, resetOverridesBtn.nextSibling);
}

function clearGymPlannerLocalStorage() {
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("gymLoadoutPlanner.")) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    localStorage.removeItem(key);
  }
}

function populatePhaseSelect(phases) {
  phaseSelect.innerHTML = "";
  const knownPhases = new Set(phases.map((phaseBlock) => phaseBlock.phase));

  for (let phase = 1; phase <= 4; phase += 1) {
    const option = document.createElement("option");
    option.value = String(phase);
    option.textContent = `Phase ${phase}`;
    option.disabled = !knownPhases.has(phase);
    phaseSelect.append(option);
  }

  const firstAvailablePhase =
    phases.find((phaseBlock) => phaseBlock.phase >= 1 && phaseBlock.phase <= 4)?.phase ?? 1;
  state.selectedPhase = firstAvailablePhase;
  phaseSelect.value = String(firstAvailablePhase);
}

function populateDaySelect() {
  daySelect.innerHTML = "";
  for (const day of AVAILABLE_DAYS) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = `Day ${day}`;
    daySelect.append(option);
  }
  state.selectedDay = AVAILABLE_DAYS[0];
  daySelect.value = String(state.selectedDay);
}

function buildExerciseMap(program) {
  state.exerciseById.clear();

  for (const phaseBlock of program.phases) {
    for (const dayBlock of phaseBlock.days) {
      for (const exercise of dayBlock.exercises) {
        state.exerciseById.set(exercise.id, exercise);
      }
    }
  }
}

function render() {
  const exercises = getExercisesForSelection(state.selectedPhase, state.selectedDay);
  const dayBandPlan = solveDayBandPlan(exercises);
  const dayWeightPlan = solveDayWeightPlan(exercises);
  statusLine.textContent = `Phase ${state.selectedPhase} - Day ${state.selectedDay} (${exercises.length} exercise${exercises.length === 1 ? "" : "s"})`;

  exerciseList.innerHTML = "";
  if (exercises.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No exercises in the starter data for this phase/day yet.";
    exerciseList.append(empty);
    return;
  }

  for (const exercise of exercises) {
    const card = createExerciseCard(exercise, dayBandPlan, dayWeightPlan);
    exerciseList.append(card);
  }
}

function getExercisesForSelection(phaseNumber, dayNumber) {
  const phaseBlock = state.program.phases.find((phase) => phase.phase === phaseNumber);
  if (!phaseBlock) {
    return [];
  }

  const dayBlock = phaseBlock.days.find((day) => day.day === dayNumber);
  return dayBlock ? dayBlock.exercises : [];
}

function createExerciseCard(exercise, dayBandPlan, dayWeightPlan) {
  const node = exerciseCardTemplate.content.firstElementChild.cloneNode(true);
  const isBandExercise = isBandExerciseType(exercise);
  const targetValue = isBandExercise ? getBandTargetValue(exercise) : getTargetValue(exercise);

  node.querySelector(".exercise-name").textContent = exercise.name;
  node.querySelector(".type-badge").textContent = exercise.kind;

  const targetRow = node.querySelector(".target-row");
  const targetLabel = node.querySelector(".target-label");
  const displayBtn = node.querySelector(".target-display");
  const input = node.querySelector(".target-input");
  const editor = node.querySelector(".target-editor");

  if (isBandExercise) {
    configureBandTargetEditor({
      exercise,
      targetRow,
      targetLabel,
      displayBtn,
      input,
      editor,
      targetValue,
      node,
      dayBandPlan
    });
  } else {
    configureKgTargetEditor({
      exercise,
      displayBtn,
      input,
      editor,
      targetValue
    });

    const weightUi = buildWeightSetupUi(exercise, targetValue, dayWeightPlan);
    if (weightUi) {
      node.insertBefore(weightUi, node.querySelector(".meta"));
    }
  }

  const meta = node.querySelector(".meta");
  if (meta) {
    meta.remove();
  }
  const placeholder = node.querySelector(".loadout-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  return node;
}

function configureKgTargetEditor({ exercise, displayBtn, input, editor, targetValue }) {
  displayBtn.textContent = formatKg(targetValue);
  input.value = String(targetValue);
  input.step = "0.5";

  displayBtn.addEventListener("click", () => {
    editor.classList.add("editing");
    input.focus();
    input.select();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    } else if (event.key === "Escape") {
      input.value = String(targetValue);
      editor.classList.remove("editing");
    }
  });

  input.addEventListener("blur", () => {
    editor.classList.remove("editing");
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      input.value = String(targetValue);
      return;
    }
    saveOverride(exercise.id, parsed);
    render();
  });
}

function configureBandTargetEditor({ exercise, targetLabel, displayBtn, input, editor, targetValue, node, dayBandPlan }) {
  targetLabel.textContent = "Target (lb)";
  displayBtn.remove();
  editor.classList.add("editing", "band-editor");
  input.value = String(targetValue);
  input.step = "1";
  input.classList.add("band-target-input");

  const commitBandTarget = () => {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      input.value = String(targetValue);
      return;
    }
    saveBandTargetOverride(exercise.id, parsed);
    render();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitBandTarget();
    } else if (event.key === "Escape") {
      input.value = String(targetValue);
    }
  });

  input.addEventListener("change", commitBandTarget);
  input.addEventListener("blur", commitBandTarget);

  const setupUi = buildBandSetupUi(exercise, targetValue, dayBandPlan);
  node.insertBefore(setupUi, node.querySelector(".meta"));
}

function getTargetValue(exercise) {
  return state.overrides[exercise.id] ?? exercise.targetPlatesOnlyKg;
}

function saveOverride(exerciseId, value) {
  state.overrides[exerciseId] = value;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides));
}

function getBandTargetValue(exercise) {
  if (state.bandTargetOverrides[exercise.id] !== undefined) {
    return state.bandTargetOverrides[exercise.id];
  }
  if (!exercise.bandRecipe || !Array.isArray(exercise.bandRecipe.items)) {
    return 0;
  }

  return exercise.bandRecipe.items.reduce((sum, item) => {
    const itemSystem = resolveItemSystem(exercise, item);
    const band = resolveBandById(item.bandId, itemSystem);
    if (!band) {
      return sum;
    }
    return sum + band.resistanceLb * Number(item.qty || 0);
  }, 0);
}

function saveBandTargetOverride(exerciseId, value) {
  state.bandTargetOverrides[exerciseId] = value;
  localStorage.setItem(BAND_OVERRIDES_KEY, JSON.stringify(state.bandTargetOverrides));
}

function saveBandChosenCombo(exerciseId, signature) {
  if (!signature) {
    delete state.bandChosenCombo[exerciseId];
  } else {
    state.bandChosenCombo[exerciseId] = signature;
  }
  localStorage.setItem(BAND_CHOSEN_COMBO_KEY, JSON.stringify(state.bandChosenCombo));
}

function saveWeightChosenSetup(exerciseId, signature) {
  if (!signature) {
    delete state.weightChosenSetup[exerciseId];
  } else {
    state.weightChosenSetup[exerciseId] = signature;
  }
  localStorage.setItem(WEIGHT_CHOSEN_SETUP_KEY, JSON.stringify(state.weightChosenSetup));
}

function saveDbBaseImplement(exerciseId, implementId) {
  if (!implementId) {
    delete state.dbBaseImplement[exerciseId];
  } else {
    state.dbBaseImplement[exerciseId] = implementId;
  }
  localStorage.setItem(DB_BASE_IMPLEMENT_KEY, JSON.stringify(state.dbBaseImplement));
}

function loadOverrides(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function formatKg(value) {
  return `${Number(value)} kg`;
}

function formatLb(value) {
  return `${Number(value)} lb`;
}

function buildWeightSetupUi(exercise, targetKg, dayWeightPlan) {
  if (!isWeightExerciseType(exercise.kind)) {
    return null;
  }

  const candidates = dayWeightPlan.candidatesByExercise.get(exercise.id) || solveWeightExercise(exercise, targetKg, 4).candidates;
  if (!candidates || candidates.length === 0) {
    const wrapper = document.createElement("div");
    wrapper.className = "band-setup";
    const empty = document.createElement("p");
    empty.className = "band-setup-empty";
    empty.textContent = "No feasible plate setup found.";
    wrapper.append(empty);
    return wrapper;
  }

  const chosen = dayWeightPlan.chosenByExercise.get(exercise.id) || candidates[0];
  const pinnedSignature = state.weightChosenSetup[exercise.id];
  const hasPinned = Boolean(pinnedSignature);
  maybePersistDbBaseFromChosen(exercise, chosen);

  const wrapper = document.createElement("div");
  wrapper.className = "band-setup";

  const chosenLine = document.createElement("p");
  chosenLine.className = "chosen-setup-line";
  const chosenDisplayText = formatWeightSetupMain(chosen);
  chosenLine.textContent = `Chosen setup: ${chosenDisplayText}`;
  wrapper.append(chosenLine);

  const chosenMeta = document.createElement("p");
  chosenMeta.className = "weight-setup-meta";
  chosenMeta.textContent = `Total plates used: ${chosen.totalPlatesCount}`;
  wrapper.append(chosenMeta);

  if (
    hasPinned
    && !dayWeightPlan.strictPinsSatisfied
    && chosen.signature !== pinnedSignature
    && dayWeightPlan.pinUnavailableByExercise.has(exercise.id)
  ) {
    const hint = document.createElement("p");
    hint.className = "band-setup-empty";
    hint.textContent = "Pinned option unavailable with current day plate inventory - using best feasible.";
    wrapper.append(hint);
  }

  const seen = new Set();
  const alternatives = [];
  for (const candidate of candidates) {
    const candidateDisplayText = formatWeightSetupMain(candidate);
    if (!candidate.signature || candidate.signature === chosen.signature) {
      continue;
    }
    if (candidateDisplayText === chosenDisplayText || seen.has(candidateDisplayText)) {
      continue;
    }
    seen.add(candidateDisplayText);
    alternatives.push(candidate);
    if (alternatives.length >= 3) {
      break;
    }
  }
  if (alternatives.length > 0) {
    const details = document.createElement("details");
    details.className = "alternatives";
    const summary = document.createElement("summary");
    summary.textContent = "Alternatives";
    details.append(summary);

    alternatives.forEach((candidate, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alternative-option";
      btn.dataset.signature = candidate.signature;
      btn.textContent = `Option #${idx + 2}: ${formatWeightSetupMain(candidate)}`;
      btn.addEventListener("click", (event) => {
        const signature = event.currentTarget?.dataset?.signature || "";
        if (!signature) {
          return;
        }
        saveWeightChosenSetup(exercise.id, signature);
        render();
      });
      details.append(btn);
    });
    wrapper.append(details);
  } else {
    const noAlt = document.createElement("p");
    noAlt.className = "band-setup-empty";
    noAlt.textContent = "No other feasible alternatives.";
    wrapper.append(noAlt);
  }

  const details = buildWeightDetailsSection(exercise, targetKg, chosen);
  if (details) {
    wrapper.append(details);
  }

  return wrapper;
}

function solveWeightExercise(exercise, targetKg, maxResults = 4) {
  const implementOptions = getImplementOptionsForWeightExercise(exercise);
  if (implementOptions.length === 0 && exercise.kind !== "plateOnly") {
    return { candidates: [] };
  }

  const candidates = [];
  const targetTotal = Number(targetKg) || 0;
  const toleranceTotal = 0.5;
  const configuredBaseDb = exercise.kind === "db" ? resolveConfiguredDbBase(exercise) : null;

  const plans = exercise.kind === "plateOnly"
    ? [{ implement: null, overallSides: 1, perSideTargetKg: targetTotal, label: "Plate only" }]
    : implementOptions.map((implement) => {
      if (exercise.kind === "db") {
        const dbCount = exercise.dbCount || 1;
        const baseForCompensation = configuredBaseDb || implement;
        const effectiveTotalTargetKgPerDB = targetTotal + Number(baseForCompensation.emptyWeightKg || 0);
        const adjustedPlatesTargetKg = effectiveTotalTargetKgPerDB - Number(implement.emptyWeightKg || 0);
        return {
          implement,
          overallSides: 2 * dbCount,
          perSideTargetKg: adjustedPlatesTargetKg / 2,
          label: `${implement.name}`,
          dbCount,
          adjustedPlatesTargetKg,
          effectiveTotalTargetKgPerDB,
          baseImplement: baseForCompensation
        };
      }
      return {
        implement,
        overallSides: 2,
        perSideTargetKg: targetTotal / 2,
        label: `${implement.name}`
      };
    });

  for (const plan of plans) {
    const tolerancePerSide = plan.overallSides > 1 ? toleranceTotal / plan.overallSides : toleranceTotal;
    const oneSideCombos = solveOneSidePlateCombos({
      exercise,
      implement: plan.implement,
      perSideTargetKg: plan.perSideTargetKg,
      overallSides: plan.overallSides,
      tolerancePerSide
    });

    for (const combo of oneSideCombos) {
      const totalDiff = combo.absDiffPerSide * plan.overallSides;
      const usesMixed = false;
      const setup = {
        implementId: plan.implement?.id || "plate_only",
        implementLabel: plan.label,
        kind: exercise.kind,
        perSidePlates: combo.plates,
        totalPlatesCount: combo.totalPerSideCount * plan.overallSides,
        totalPlatesKg: combo.totalPerSideWeight * plan.overallSides,
        maxDiameterUsed: combo.maxDiameterUsed,
        uses10kgDbPlate: combo.uses10kgDbPlate,
        uses10kgDb26_7: combo.uses10kgDb26_7,
        dbLongRedPenalty: plan.implement?.id === "db_long_red" ? 1 : 0,
        baseMismatchPenalty: exercise.kind === "db" && configuredBaseDb && plan.implement?.id !== configuredBaseDb.id ? 1 : 0,
        absDiffKg: totalDiff,
        mixedPenalty: usesMixed ? 1 : 0,
        signature: buildWeightSetupSignature(plan.implement?.id || "plate_only", combo.plates),
        overallSides: plan.overallSides,
        usage: buildWeightUsageMap(combo.plates, plan.overallSides),
        adjustedPlatesPerDBKg: plan.adjustedPlatesTargetKg,
        effectiveTotalPerDBKg: plan.effectiveTotalTargetKgPerDB,
        baseImplementId: plan.baseImplement?.id || null,
        baseImplementLabel: plan.baseImplement?.name || null,
        baseImplementEmptyWeightKg: plan.baseImplement?.emptyWeightKg ?? null
      };
      setup.softPenalty = (setup.dbLongRedPenalty * 100) + (setup.uses10kgDbPlate * 30) - (setup.uses10kgDb26_7 * 5) + (setup.baseMismatchPenalty * 300);
      candidates.push(setup);
    }
  }

  const exactExists = candidates.some((candidate) => candidate.absDiffKg < 0.0001);
  const filtered = exactExists
    ? candidates.filter((candidate) => candidate.absDiffKg < 0.0001)
    : candidates.filter((candidate) => candidate.absDiffKg <= toleranceTotal + 0.0001);

  const uniqueBySig = new Map();
  for (const candidate of filtered) {
    const prev = uniqueBySig.get(candidate.signature);
    if (!prev || isWeightCandidateBetter(candidate, prev)) {
      uniqueBySig.set(candidate.signature, candidate);
    }
  }

  const deduped = Array.from(uniqueBySig.values());
  const hasBaseFeasible = exercise.kind === "db" && configuredBaseDb
    ? deduped.some((candidate) => candidate.implementId === configuredBaseDb.id)
    : false;

  const ranked = deduped
    .sort((a, b) => {
      if (a.absDiffKg !== b.absDiffKg) return a.absDiffKg - b.absDiffKg;
      if (hasBaseFeasible && a.baseMismatchPenalty !== b.baseMismatchPenalty) {
        return a.baseMismatchPenalty - b.baseMismatchPenalty;
      }
      if (a.totalPlatesCount !== b.totalPlatesCount) return a.totalPlatesCount - b.totalPlatesCount;
      if (a.softPenalty !== b.softPenalty) return a.softPenalty - b.softPenalty;
      if (a.maxDiameterUsed !== b.maxDiameterUsed) return a.maxDiameterUsed - b.maxDiameterUsed;
      return a.signature.localeCompare(b.signature);
    })
    .slice(0, maxResults);

  return { candidates: ranked };
}

function solveOneSidePlateCombos({ exercise, implement, perSideTargetKg, overallSides, tolerancePerSide }) {
  const allowedPlates = (state.gear.plates || []).filter((plate) => {
    if (exercise.maxPlateDiameterCm && Number(plate.diameterCm) > Number(exercise.maxPlateDiameterCm)) {
      return false;
    }
    if (!implement) {
      return true;
    }
    if (Number(plate.boreCm) < Number(implement.sleeveDiameterCm)) {
      return false;
    }
    return true;
  });

  if (allowedPlates.length === 0) {
    return [];
  }

  const maxByPlate = allowedPlates.map((plate) => Math.floor(Number(plate.qty || 0) / overallSides));
  const results = [];
  const counts = new Array(allowedPlates.length).fill(0);
  const maxThickness = implement ? Number(implement.sleeveLengthPerSideCm || 0) : Infinity;

  function backtrack(index, currentWeight, currentThickness) {
    if (implement && currentThickness - maxThickness > 1e-9) {
      return;
    }
    if (index === allowedPlates.length) {
      const diff = Math.abs(currentWeight - perSideTargetKg);
      if (diff <= tolerancePerSide + 1e-9) {
        const plates = [];
        let totalCount = 0;
        let maxDiameter = 0;
        let uses10kgDb = 0;
        let uses10kgDb267 = 0;
        for (let i = 0; i < counts.length; i += 1) {
          if (counts[i] <= 0) continue;
          const plate = allowedPlates[i];
          plates.push({ id: plate.id, weightKg: Number(plate.weightKg), qty: counts[i], diameterCm: Number(plate.diameterCm) });
          totalCount += counts[i];
          maxDiameter = Math.max(maxDiameter, Number(plate.diameterCm) || 0);
          if (exercise.kind === "db" && Math.abs(Number(plate.weightKg) - 10) < 0.0001) {
            uses10kgDb = 1;
            if (Math.abs(Number(plate.diameterCm) - 26.7) < 0.25) {
              uses10kgDb267 = 1;
            }
          }
        }
        results.push({
          plates,
          totalPerSideWeight: currentWeight,
          totalPerSideCount: totalCount,
          maxDiameterUsed: maxDiameter,
          absDiffPerSide: diff,
          uses10kgDbPlate: uses10kgDb,
          uses10kgDb26_7: uses10kgDb267
        });
      }
      return;
    }

    const plate = allowedPlates[index];
    const maxQty = maxByPlate[index];
    for (let qty = 0; qty <= maxQty; qty += 1) {
      counts[index] = qty;
      backtrack(
        index + 1,
        currentWeight + qty * Number(plate.weightKg || 0),
        currentThickness + qty * Number(plate.thicknessCm || 0)
      );
    }
    counts[index] = 0;
  }

  backtrack(0, 0, 0);
  return results;
}

function getImplementOptionsForWeightExercise(exercise) {
  const all = state.gear.implements || [];
  const excluded = new Set(exercise.excludeImplementIds || []);

  if (exercise.kind === "db") {
    return all
      .filter((item) => item.kind === "dumbbell" && !excluded.has(item.id))
      .filter((item) => Number(item.qty || 0) >= (exercise.dbCount || 1));
  }
  if (exercise.kind === "barbell") {
    return all.filter((item) => item.kind === "barbell" && !excluded.has(item.id)).slice(0, 1);
  }
  if (exercise.kind === "curlbar") {
    return all.filter((item) => item.kind === "curlbar" && !excluded.has(item.id)).slice(0, 1);
  }
  return [];
}

function isWeightExerciseType(kind) {
  return kind === "db" || kind === "barbell" || kind === "curlbar" || kind === "plateOnly";
}

function buildWeightSetupSignature(implementId, perSidePlates) {
  const parts = perSidePlates
    .map((plate) => `${plate.id}x${plate.qty}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  return `${implementId}|${parts}`;
}

function formatWeightSetupMain(setup) {
  const orderedPerSide = [...setup.perSidePlates].sort((a, b) => {
    if (Number(b.weightKg) !== Number(a.weightKg)) {
      return Number(b.weightKg) - Number(a.weightKg);
    }
    return String(a.id).localeCompare(String(b.id));
  });
  const expanded = [];
  for (const plate of orderedPerSide) {
    for (let i = 0; i < plate.qty; i += 1) {
      expanded.push(String(plate.weightKg));
    }
  }
  const perSide = expanded.length > 0 ? expanded.join(" + ") : "none";
  if (setup.kind === "db") {
    const platesPerDb = Number(setup.adjustedPlatesPerDBKg || 0);
    return `${setup.implementLabel} - each side: ${perSide} - plates per DB: ${platesPerDb.toFixed(1)}kg`;
  }
  return `${setup.implementLabel} - each side: ${perSide}`;
}

function isWeightCandidateBetter(a, b) {
  if (a.absDiffKg !== b.absDiffKg) return a.absDiffKg < b.absDiffKg;
  if (a.baseMismatchPenalty !== b.baseMismatchPenalty) return a.baseMismatchPenalty < b.baseMismatchPenalty;
  if (a.dbLongRedPenalty !== b.dbLongRedPenalty) return a.dbLongRedPenalty < b.dbLongRedPenalty;
  if (a.uses10kgDbPlate !== b.uses10kgDbPlate) return a.uses10kgDbPlate < b.uses10kgDbPlate;
  if (a.uses10kgDb26_7 !== b.uses10kgDb26_7) return a.uses10kgDb26_7 > b.uses10kgDb26_7;
  if (a.totalPlatesCount !== b.totalPlatesCount) return a.totalPlatesCount < b.totalPlatesCount;
  return a.maxDiameterUsed < b.maxDiameterUsed;
}

function resolveConfiguredDbBase(exercise, fallbackImplementId = null) {
  const byExercise = exercise.baseImplementId || null;
  const byStored = state.dbBaseImplement[exercise.id] || null;
  const chosenId = byExercise || byStored || fallbackImplementId;
  if (!chosenId) {
    return null;
  }
  return findDumbbellImplementById(chosenId);
}

function findDumbbellImplementById(implementId) {
  if (!implementId) {
    return null;
  }
  const match = (state.gear.implements || []).find((item) => item.id === implementId && item.kind === "dumbbell");
  return match || null;
}

function maybePersistDbBaseFromChosen(exercise, chosenSetup) {
  if (exercise.kind !== "db") {
    return;
  }
  if (exercise.baseImplementId || state.dbBaseImplement[exercise.id]) {
    return;
  }
  const chosenId = chosenSetup?.implementId;
  const chosenImpl = findDumbbellImplementById(chosenId);
  if (chosenImpl) {
    saveDbBaseImplement(exercise.id, chosenImpl.id);
  }
}

function buildWeightDetailsSection(exercise, targetPlatesOnlyKg, chosenSetup) {
  const details = document.createElement("details");
  details.className = "alternatives";

  const summary = document.createElement("summary");
  summary.textContent = "Details";
  details.append(summary);

  const rows = [];

  if (exercise.kind === "db") {
    const fallbackId = findDumbbellImplementById(chosenSetup?.implementId) ? chosenSetup.implementId : null;
    const baseImpl = resolveConfiguredDbBase(exercise, fallbackId);
    if (baseImpl) {
      const effectiveTotal = Number(targetPlatesOnlyKg || 0) + Number(baseImpl.emptyWeightKg || 0);
      rows.push(`Base DB: ${baseImpl.name} (${Number(baseImpl.emptyWeightKg).toFixed(3)}kg) - Effective total target: ${effectiveTotal.toFixed(3)}kg`);
      if (chosenSetup?.effectiveTotalPerDBKg !== undefined) {
        rows.push(`Total per DB in chosen setup: ${Number(chosenSetup.effectiveTotalPerDBKg).toFixed(3)}kg`);
      }
    }
  }

  if (exercise.maxPlateDiameterCm) {
    rows.push(`Max plate diameter: ${exercise.maxPlateDiameterCm} cm`);
  }
  if (exercise.excludeImplementIds?.length) {
    rows.push(`Excluded implements: ${exercise.excludeImplementIds.join(", ")}`);
  }
  if (exercise.notes) {
    rows.push(`Notes: ${exercise.notes}`);
  }

  if (rows.length === 0) {
    const none = document.createElement("p");
    none.className = "weight-details-line";
    none.textContent = "No extra details.";
    details.append(none);
    return details;
  }

  for (const text of rows) {
    const line = document.createElement("p");
    line.className = "weight-details-line";
    line.textContent = text;
    details.append(line);
  }

  return details;
}

function buildWeightUsageMap(perSidePlates, overallSides) {
  const usage = {};
  for (const plate of perSidePlates) {
    usage[plate.id] = (usage[plate.id] || 0) + (plate.qty * overallSides);
  }
  return usage;
}

function solveDayWeightPlan(dayExercises) {
  const weightExercises = dayExercises.filter((exercise) => isWeightExerciseType(exercise.kind));
  const candidatesByExercise = new Map();
  const chosenByExercise = new Map();
  const pinUnavailableByExercise = new Set();

  if (weightExercises.length === 0) {
    return { candidatesByExercise, chosenByExercise, pinUnavailableByExercise, strictPinsSatisfied: true };
  }

  const inventory = buildDayPlateInventory();
  const tasks = weightExercises.map((exercise) => {
    const targetKg = getTargetValue(exercise);
    const pinnedSignature = state.weightChosenSetup[exercise.id] || null;
    const candidates = buildWeightCandidatesForDayExercise(exercise, targetKg, pinnedSignature);
    candidatesByExercise.set(exercise.id, candidates);
    return {
      exercise,
      candidates,
      pinnedSignature
    };
  });

  const strictPass = runDayWeightSolvePass(tasks, inventory, true);
  const relaxedPass = strictPass.best ? strictPass : runDayWeightSolvePass(tasks, inventory, false);
  const solved = relaxedPass;

  if (!solved.best) {
    const usageFallback = {};
    for (const task of tasks) {
      let fallback = task.candidates.find((candidate) => canApplyWeightCandidate(candidate, usageFallback, inventory));
      if (!fallback) {
        fallback = task.candidates[0];
      }
      applyWeightCandidateUsage(fallback, usageFallback, +1);
      chosenByExercise.set(task.exercise.id, fallback);
    }
  } else {
    for (const [exerciseId, candidate] of solved.best.chosen.entries()) {
      chosenByExercise.set(exerciseId, candidate);
    }
  }

  for (const task of tasks) {
    const chosen = chosenByExercise.get(task.exercise.id) || task.candidates[0];
    chosenByExercise.set(task.exercise.id, chosen);
    if (task.pinnedSignature && chosen.signature !== task.pinnedSignature) {
      pinUnavailableByExercise.add(task.exercise.id);
    }
  }

  return {
    candidatesByExercise,
    chosenByExercise,
    pinUnavailableByExercise,
    timedOut: solved.timedOut,
    strictPinsSatisfied: Boolean(strictPass.best)
  };
}

function runDayWeightSolvePass(tasks, inventory, requirePinned) {
  const orderedTasks = [...tasks].sort((a, b) => a.candidates.length - b.candidates.length);
  const usage = {};
  const current = new Map();
  const startTime = nowMs();
  let timedOut = false;
  let best = null;

  for (const task of orderedTasks) {
    if (requirePinned && task.pinnedSignature) {
      const hasPinnedCandidate = task.candidates.some((candidate) => candidate.signature === task.pinnedSignature);
      if (!hasPinnedCandidate) {
        return { best: null, timedOut: false };
      }
    }
  }

  const remainingMinAbsDiff = new Array(orderedTasks.length).fill(0);
  const remainingMinPlates = new Array(orderedTasks.length).fill(0);
  const remainingMinSoft = new Array(orderedTasks.length).fill(0);
  for (let i = orderedTasks.length - 1; i >= 0; i -= 1) {
    const minAbs = Math.min(...orderedTasks[i].candidates.map((candidate) => candidate.absDiffKg));
    const minPlates = Math.min(...orderedTasks[i].candidates.map((candidate) => candidate.totalPlatesCount));
    const minSoft = Math.min(...orderedTasks[i].candidates.map((candidate) => candidate.softPenalty || 0));
    remainingMinAbsDiff[i] = minAbs + (remainingMinAbsDiff[i + 1] || 0);
    remainingMinPlates[i] = minPlates + (remainingMinPlates[i + 1] || 0);
    remainingMinSoft[i] = minSoft + (remainingMinSoft[i + 1] || 0);
  }

  function isBetter(a, b) {
    if (!b) return true;
    if (a.totalAbsDiff !== b.totalAbsDiff) return a.totalAbsDiff < b.totalAbsDiff;
    if (a.totalPlates !== b.totalPlates) return a.totalPlates < b.totalPlates;
    return a.totalSoftPenalty < b.totalSoftPenalty;
  }

  function shouldPrune(index, metrics) {
    if (!best) return false;
    const lowerBound = {
      totalAbsDiff: metrics.totalAbsDiff + (remainingMinAbsDiff[index] || 0),
      totalPlates: metrics.totalPlates + (remainingMinPlates[index] || 0),
      totalSoftPenalty: metrics.totalSoftPenalty + (remainingMinSoft[index] || 0)
    };
    return !isBetter(lowerBound, best);
  }

  function dfs(index, metrics) {
    if (nowMs() - startTime > DAY_WEIGHT_SOLVER_TIME_BUDGET_MS) {
      timedOut = true;
      return;
    }
    if (shouldPrune(index, metrics)) {
      return;
    }
    if (index === orderedTasks.length) {
      const candidateBest = {
        ...metrics,
        chosen: new Map(current)
      };
      if (isBetter(candidateBest, best)) {
        best = candidateBest;
      }
      return;
    }

    const task = orderedTasks[index];
    const candidateOrder = orderWeightCandidatesForTask(task, requirePinned);
    for (const candidate of candidateOrder) {
      if (!canApplyWeightCandidate(candidate, usage, inventory)) {
        continue;
      }
      applyWeightCandidateUsage(candidate, usage, +1);
      current.set(task.exercise.id, candidate);

      dfs(index + 1, {
        totalAbsDiff: metrics.totalAbsDiff + candidate.absDiffKg,
        totalPlates: metrics.totalPlates + candidate.totalPlatesCount,
        totalSoftPenalty: metrics.totalSoftPenalty + (candidate.softPenalty || 0)
      });

      current.delete(task.exercise.id);
      applyWeightCandidateUsage(candidate, usage, -1);
      if (timedOut) {
        break;
      }
    }
  }

  dfs(0, { totalAbsDiff: 0, totalPlates: 0, totalSoftPenalty: 0 });
  return { best, timedOut };
}

function buildDayPlateInventory() {
  const inventory = {};
  for (const plate of state.gear.plates || []) {
    inventory[plate.id] = Number(plate.qty || 0);
  }
  return inventory;
}

function buildWeightCandidatesForDayExercise(exercise, targetKg, pinnedSignature) {
  const base = solveWeightExercise(exercise, targetKg, MAX_CANDIDATES).candidates;
  if (!pinnedSignature || base.some((candidate) => candidate.signature === pinnedSignature)) {
    return base;
  }

  const pinned = solveWeightExercise(exercise, targetKg, 200).candidates
    .find((candidate) => candidate.signature === pinnedSignature);
  if (!pinned) {
    return base;
  }
  const merged = [pinned, ...base.filter((candidate) => candidate.signature !== pinned.signature)];
  const unique = [];
  const seen = new Set();
  for (const candidate of merged) {
    if (!candidate?.signature || seen.has(candidate.signature)) {
      continue;
    }
    seen.add(candidate.signature);
    unique.push(candidate);
  }
  return unique;
}

function orderWeightCandidatesForTask(task, requirePinned = false) {
  if (!task.pinnedSignature) {
    return task.candidates;
  }
  const pinned = task.candidates.find((candidate) => candidate.signature === task.pinnedSignature);
  if (!pinned) {
    return requirePinned ? [] : task.candidates;
  }
  if (requirePinned) {
    return [pinned];
  }
  return [pinned, ...task.candidates.filter((candidate) => candidate.signature !== task.pinnedSignature)];
}

function canApplyWeightCandidate(candidate, usage, inventory) {
  for (const [plateId, qty] of Object.entries(candidate.usage || {})) {
    const nextQty = (usage[plateId] || 0) + qty;
    if (nextQty > (inventory[plateId] || 0)) {
      return false;
    }
  }
  return true;
}

function applyWeightCandidateUsage(candidate, usage, direction) {
  for (const [plateId, qty] of Object.entries(candidate.usage || {})) {
    const nextQty = (usage[plateId] || 0) + (direction * qty);
    if (nextQty <= 0) {
      delete usage[plateId];
    } else {
      usage[plateId] = nextQty;
    }
  }
}

function buildBandSetupUi(exercise, targetLb, dayBandPlan) {
  const bands = getBandsForExercise(exercise);
  const wrapper = document.createElement("div");
  wrapper.className = "band-setup";

  if (bands.length === 0) {
    const empty = document.createElement("p");
    empty.className = "band-setup-empty";
    empty.textContent = "No compatible bands available in gear.json.";
    wrapper.append(empty);
    return wrapper;
  }

  const combos = dayBandPlan.candidatesByExercise.get(exercise.id) || solveBandCombos(bands, targetLb, MAX_CANDIDATES);
  if (combos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "band-setup-empty";
    empty.textContent = `No valid combo found within the ${MAX_BANDS_PER_COMBO}-band limit.`;
    wrapper.append(empty);
    return wrapper;
  }

  const chosenCombo = dayBandPlan.chosenByExercise.get(exercise.id) || combos[0];
  const hasPinned = Boolean(state.bandChosenCombo[exercise.id]);

  const chosenLine = document.createElement("p");
  chosenLine.className = "chosen-setup-line";
  chosenLine.textContent = `Chosen setup: ${comboSummary(chosenCombo)}`;
  wrapper.append(chosenLine);

  if (
    hasPinned
    && !dayBandPlan.strictPinsSatisfied
    && chosenCombo.signature !== state.bandChosenCombo[exercise.id]
    && dayBandPlan.pinUnavailableByExercise.has(exercise.id)
  ) {
    const hint = document.createElement("p");
    hint.className = "band-setup-empty";
    hint.textContent = "Pinned option unavailable with current day inventory - using best feasible.";
    wrapper.append(hint);
  }

  const alternatives = getDisplayAlternatives(exercise, dayBandPlan, chosenCombo);
  if (alternatives.length > 0) {
    const details = document.createElement("details");
    details.className = "alternatives";

    const summary = document.createElement("summary");
    summary.textContent = "Alternatives";
    details.append(summary);

    alternatives.forEach((combo, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alternative-option";
      btn.dataset.signature = combo.signature;
      btn.textContent = `Option #${idx + 2}: ${comboSummary(combo)}`;
      btn.addEventListener("click", (event) => {
        const signature = event.currentTarget?.dataset?.signature || "";
        if (!signature) {
          return;
        }
        saveBandChosenCombo(exercise.id, signature);
        render();
      });
      details.append(btn);
    });

    wrapper.append(details);
  } else {
    const noAlt = document.createElement("p");
    noAlt.className = "band-setup-empty";
    noAlt.textContent = "No other feasible alternatives.";
    wrapper.append(noAlt);
  }

  return wrapper;
}

function getBandsForExercise(exercise) {
  const useMixedPool = shouldUseMixedPool(exercise);

  if (!useMixedPool && exercise.kind === "loopBands") {
    return (state.gear.loopBands || []).map((band) => ({
      id: band.id,
      system: "loop",
      label: `${band.color || `Unknown(${band.id})`} (${band.resistanceLb}lb)`,
      resistanceLb: Number(band.resistanceLb || 0),
      qty: Number(band.qty || 0)
    }));
  }

  if (!useMixedPool && exercise.kind === "handledBands") {
    return (state.gear.handledBands || []).map((band) => ({
      id: band.id,
      system: "handled",
      label: `${band.name || `Unknown(${band.id})`} (${band.resistanceLb}lb)`,
      resistanceLb: Number(band.resistanceLb || 0),
      qty: Number(band.qty || 0)
    }));
  }

  if (useMixedPool) {
    const loop = (state.gear.loopBands || []).map((band) => ({
      id: band.id,
      system: "loop",
      label: `${band.color || `Unknown(${band.id})`} (${band.resistanceLb}lb)`,
      resistanceLb: Number(band.resistanceLb || 0),
      qty: Number(band.qty || 0)
    }));
    const handled = (state.gear.handledBands || []).map((band) => ({
      id: band.id,
      system: "handled",
      label: `${band.name || `Unknown(${band.id})`} (${band.resistanceLb}lb)`,
      resistanceLb: Number(band.resistanceLb || 0),
      qty: Number(band.qty || 0)
    }));
    return [...loop, ...handled];
  }

  return [];
}

function solveDayBandPlan(dayExercises) {
  const bandExercises = dayExercises.filter((exercise) => isBandExerciseType(exercise));
  const candidatesByExercise = new Map();
  const chosenByExercise = new Map();
  const pinUnavailableByExercise = new Set();

  if (bandExercises.length === 0) {
    return { candidatesByExercise, chosenByExercise, pinUnavailableByExercise, strictPinsSatisfied: true };
  }

  const inventory = buildDayBandInventory();
  const tasks = bandExercises.map((exercise) => {
    const targetLb = getBandTargetValue(exercise);
    const pinnedSignature = state.bandChosenCombo[exercise.id] || null;
    const candidates = buildCandidatesForExercise(exercise, targetLb, pinnedSignature);
    candidatesByExercise.set(exercise.id, candidates);
    return {
      exercise,
      candidates,
      pinnedSignature
    };
  });

  const strictPass = runDayBandSolvePass(tasks, inventory, true);
  const relaxedPass = strictPass.best ? strictPass : runDayBandSolvePass(tasks, inventory, false);
  const solved = relaxedPass;

  if (!solved.best) {
    const usageFallback = new Map();
    for (const task of tasks) {
      let fallback = task.candidates.find((combo) => canApplyCombo(combo, usageFallback, inventory));
      if (!fallback) {
        fallback = task.candidates[task.candidates.length - 1];
      }
      applyComboUsage(fallback, usageFallback, +1);
      chosenByExercise.set(task.exercise.id, fallback);
    }
  } else {
    for (const [exerciseId, combo] of solved.best.chosen.entries()) {
      chosenByExercise.set(exerciseId, combo);
    }
  }

  for (const task of tasks) {
    const chosen = chosenByExercise.get(task.exercise.id) || task.candidates[0];
    chosenByExercise.set(task.exercise.id, chosen);
    if (task.pinnedSignature && chosen.signature !== task.pinnedSignature) {
      pinUnavailableByExercise.add(task.exercise.id);
    }
  }

  return {
    candidatesByExercise,
    chosenByExercise,
    pinUnavailableByExercise,
    timedOut: solved.timedOut,
    strictPinsSatisfied: Boolean(strictPass.best)
  };
}

function runDayBandSolvePass(tasks, inventory, requirePinned) {
  const orderedTasks = [...tasks].sort((a, b) => a.candidates.length - b.candidates.length);
  const startTime = nowMs();
  let timedOut = false;
  const usage = new Map();
  const current = new Map();
  let best = null;

  for (const task of orderedTasks) {
    if (requirePinned && task.pinnedSignature) {
      const hasPinnedCandidate = task.candidates.some((combo) => combo.signature === task.pinnedSignature);
      if (!hasPinnedCandidate) {
        return { best: null, timedOut: false };
      }
    }
  }

  const remainingMinAbsDiff = new Array(orderedTasks.length).fill(0);
  const remainingMinItems = new Array(orderedTasks.length).fill(0);
  const remainingMinMixed = new Array(orderedTasks.length).fill(0);
  for (let i = orderedTasks.length - 1; i >= 0; i -= 1) {
    const minAbs = Math.min(...orderedTasks[i].candidates.map((combo) => combo.absDiff));
    const minItems = Math.min(...orderedTasks[i].candidates.map((combo) => combo.totalItems));
    const minMixed = Math.min(...orderedTasks[i].candidates.map((combo) => (usesMixedSystems(combo.parts) ? 1 : 0)));
    remainingMinAbsDiff[i] = minAbs + (remainingMinAbsDiff[i + 1] || 0);
    remainingMinItems[i] = minItems + (remainingMinItems[i + 1] || 0);
    remainingMinMixed[i] = minMixed + (remainingMinMixed[i + 1] || 0);
  }

  function isBetter(a, b) {
    if (!b) return true;
    if (a.totalAbsDiff !== b.totalAbsDiff) return a.totalAbsDiff < b.totalAbsDiff;
    if (a.totalItems !== b.totalItems) return a.totalItems < b.totalItems;
    return a.mixedCount < b.mixedCount;
  }

  function shouldPrune(index, metrics) {
    if (!best) return false;
    const lowerBound = {
      totalAbsDiff: metrics.totalAbsDiff + (remainingMinAbsDiff[index] || 0),
      totalItems: metrics.totalItems + (remainingMinItems[index] || 0),
      mixedCount: metrics.mixedCount + (remainingMinMixed[index] || 0)
    };
    return !isBetter(lowerBound, best);
  }

  function dfs(index, metrics) {
    if (nowMs() - startTime > DAY_SOLVER_TIME_BUDGET_MS) {
      timedOut = true;
      return;
    }
    if (shouldPrune(index, metrics)) {
      return;
    }
    if (index === orderedTasks.length) {
      const candidateBest = {
        ...metrics,
        chosen: new Map(current)
      };
      if (isBetter(candidateBest, best)) {
        best = candidateBest;
      }
      return;
    }

    const task = orderedTasks[index];
    const candidateOrder = orderCandidatesForTask(task, requirePinned);
    for (const combo of candidateOrder) {
      if (!canApplyCombo(combo, usage, inventory)) {
        continue;
      }

      applyComboUsage(combo, usage, +1);
      current.set(task.exercise.id, combo);

      dfs(index + 1, {
        totalAbsDiff: metrics.totalAbsDiff + combo.absDiff,
        totalItems: metrics.totalItems + combo.totalItems,
        mixedCount: metrics.mixedCount + (usesMixedSystems(combo.parts) ? 1 : 0)
      });

      current.delete(task.exercise.id);
      applyComboUsage(combo, usage, -1);

      if (timedOut) {
        break;
      }
    }
  }

  dfs(0, { totalAbsDiff: 0, totalItems: 0, mixedCount: 0 });
  return { best, timedOut };
}

function buildCandidatesForExercise(exercise, targetLb, pinnedSignature) {
  const bands = getBandsForExercise(exercise);
  const ranked = solveBandCombos(bands, targetLb, MAX_CANDIDATES);
  const candidates = addEmergencyCandidate(ranked, targetLb);

  if (!pinnedSignature || candidates.some((combo) => combo.signature === pinnedSignature)) {
    return candidates;
  }

  const pinnedCombo = tryBuildComboFromSignature(pinnedSignature, bands, targetLb);
  if (!pinnedCombo) {
    return candidates;
  }
  return [pinnedCombo, ...candidates];
}

function tryBuildComboFromSignature(signature, bands, targetLb) {
  if (!signature || signature === "none:emptyx0") {
    return null;
  }

  const bandByKey = new Map(bands.map((band) => [`${band.system}:${band.id}`, band]));
  const totals = new Map();
  const parts = [];
  let totalItems = 0;
  let totalLb = 0;

  const chunks = signature.split("|").filter(Boolean);
  for (const chunk of chunks) {
    const match = chunk.match(/^([^:]+):(.+)x(\d+)$/);
    if (!match) {
      return null;
    }
    const [, system, bandId, qtyRaw] = match;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return null;
    }
    const band = bandByKey.get(`${system}:${bandId}`);
    if (!band) {
      return null;
    }
    const used = (totals.get(`${system}:${bandId}`) || 0) + qty;
    if (used > band.qty) {
      return null;
    }
    totals.set(`${system}:${bandId}`, used);
    totalItems += qty;
    totalLb += qty * band.resistanceLb;
  }

  if (totalItems > MAX_BANDS_PER_COMBO) {
    return null;
  }

  for (const [key, qty] of totals.entries()) {
    const [system, bandId] = key.split(":");
    const band = bandByKey.get(key);
    parts.push({
      id: bandId,
      system,
      label: band.label,
      qty,
      resistanceLb: band.resistanceLb
    });
  }

  parts.sort((a, b) => `${a.system}:${a.id}`.localeCompare(`${b.system}:${b.id}`));

  return {
    parts,
    totalLb,
    diff: totalLb - targetLb,
    absDiff: Math.abs(totalLb - targetLb),
    totalItems,
    mixedSystemPenalty: usesMixedSystems(parts) ? 0.001 : 0,
    signature: buildComboSignature(parts)
  };
}

function buildDayBandInventory() {
  const inventory = new Map();
  for (const band of state.gear.loopBands || []) {
    inventory.set(`loop:${band.id}`, Number(band.qty || 0));
  }
  for (const band of state.gear.handledBands || []) {
    inventory.set(`handled:${band.id}`, Number(band.qty || 0));
  }
  return inventory;
}

function addEmergencyCandidate(candidates, targetLb) {
  const emergency = {
    parts: [],
    totalLb: 0,
    diff: 0 - targetLb,
    absDiff: Math.abs(targetLb),
    totalItems: 0,
    mixedSystemPenalty: 0,
    signature: "none:emptyx0"
  };
  if (candidates.length === 0) {
    return [emergency];
  }
  if (candidates.some((combo) => combo.signature === emergency.signature)) {
    return candidates;
  }
  return [...candidates, emergency];
}

function orderCandidatesForTask(task, requirePinned = false) {
  if (!task.pinnedSignature) {
    return task.candidates;
  }
  const pinned = task.candidates.find((combo) => combo.signature === task.pinnedSignature);
  if (!pinned) {
    return requirePinned ? [] : task.candidates;
  }
  if (requirePinned) {
    return [pinned];
  }
  return [pinned, ...task.candidates.filter((combo) => combo.signature !== task.pinnedSignature)];
}

function canApplyCombo(combo, usage, inventory) {
  for (const part of combo.parts) {
    const key = `${part.system}:${part.id}`;
    const nextQty = (usage.get(key) || 0) + part.qty;
    if (nextQty > (inventory.get(key) || 0)) {
      return false;
    }
  }
  return true;
}

function applyComboUsage(combo, usage, direction) {
  for (const part of combo.parts) {
    const key = `${part.system}:${part.id}`;
    const nextQty = (usage.get(key) || 0) + direction * part.qty;
    if (nextQty <= 0) {
      usage.delete(key);
    } else {
      usage.set(key, nextQty);
    }
  }
}

function getDisplayAlternatives(exercise, dayBandPlan, chosenCombo) {
  const allCandidates = dayBandPlan.candidatesByExercise.get(exercise.id) || [];
  const chosenDisplayText = comboSummary(chosenCombo);
  const withoutChosen = allCandidates.filter(
    (combo) => combo.signature && combo.signature !== chosenCombo.signature
  );
  if (withoutChosen.length === 0) {
    return [];
  }

  const feasible = withoutChosen.filter((combo) => isAlternativeFeasible(exercise.id, combo, dayBandPlan));
  const selected = [];
  const seen = new Set();
  const pushUnique = (combo) => {
    const displayText = comboSummary(combo);
    if (!combo?.signature || combo.signature === chosenCombo.signature) {
      return false;
    }
    if (displayText === chosenDisplayText || seen.has(displayText)) {
      return false;
    }
    seen.add(displayText);
    selected.push(combo);
    return true;
  };

  for (const combo of feasible) {
    pushUnique(combo);
  }

  if (selected.length < MAX_DISPLAY_OPTIONS - 1) {
    for (const combo of withoutChosen) {
      pushUnique(combo);
      if (selected.length >= MAX_DISPLAY_OPTIONS - 1) {
        break;
      }
    }
  }

  return selected.slice(0, MAX_DISPLAY_OPTIONS - 1);
}

function isAlternativeFeasible(exerciseId, alternativeCombo, dayBandPlan) {
  const inventory = buildDayBandInventory();
  const usage = new Map();

  for (const [otherExerciseId, chosenCombo] of dayBandPlan.chosenByExercise.entries()) {
    const comboToUse = otherExerciseId === exerciseId ? alternativeCombo : chosenCombo;
    if (!canApplyCombo(comboToUse, usage, inventory)) {
      return false;
    }
    applyComboUsage(comboToUse, usage, +1);
  }
  return true;
}

function solveBandCombos(bands, targetLb, maxResults = MAX_CANDIDATES) {
  const results = [];
  const selectedCounts = new Array(bands.length).fill(0);
  const startTime = nowMs();
  let shouldStop = false;

  function backtrack(index, itemsUsed, totalLb) {
    if (shouldStop || nowMs() - startTime > SOLVER_TIME_BUDGET_MS) {
      shouldStop = true;
      return;
    }

    if (index === bands.length) {
      if (itemsUsed === 0 && Number(targetLb) !== 0) {
        return;
      }

      const parts = [];
      for (let i = 0; i < bands.length; i += 1) {
        const qty = selectedCounts[i];
        if (qty > 0) {
          parts.push({
            id: bands[i].id,
            system: bands[i].system,
            label: bands[i].label,
            qty,
            resistanceLb: bands[i].resistanceLb
          });
        }
      }

      results.push({
        parts,
        totalLb,
        diff: totalLb - targetLb,
        absDiff: Math.abs(totalLb - targetLb),
        totalItems: itemsUsed,
        mixedSystemPenalty: usesMixedSystems(parts) ? 0.001 : 0,
        signature: buildComboSignature(parts)
      });
      return;
    }

    const band = bands[index];
    const maxQtyForBand = Math.min(band.qty, MAX_BANDS_PER_COMBO - itemsUsed);
    for (let qty = 0; qty <= maxQtyForBand; qty += 1) {
      if (shouldStop || nowMs() - startTime > SOLVER_TIME_BUDGET_MS) {
        shouldStop = true;
        break;
      }
      selectedCounts[index] = qty;
      backtrack(index + 1, itemsUsed + qty, totalLb + qty * band.resistanceLb);
    }
    selectedCounts[index] = 0;
  }

  backtrack(0, 0, 0);

  const uniqueByKey = new Map();
  for (const combo of results) {
    if (!uniqueByKey.has(combo.signature)) {
      uniqueByKey.set(combo.signature, combo);
    }
  }

  return Array.from(uniqueByKey.values())
    .sort((a, b) => {
      if (a.absDiff !== b.absDiff) {
        return a.absDiff - b.absDiff;
      }
      if (a.totalItems !== b.totalItems) {
        return a.totalItems - b.totalItems;
      }
      if (a.mixedSystemPenalty !== b.mixedSystemPenalty) {
        return a.mixedSystemPenalty - b.mixedSystemPenalty;
      }
      return a.totalLb - b.totalLb;
    })
    .slice(0, maxResults);
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function comboSummary(combo) {
  const withSystemPrefix = usesMixedSystems(combo.parts);
  const bandsText = combo.parts.map((part) => formatComboPart(part, withSystemPrefix)).join(" + ") || "No bands";
  const diffSign = combo.diff > 0 ? "+" : "";
  return `${bandsText} - Total ${combo.totalLb}lb (diff ${diffSign}${combo.diff}lb)`;
}

function buildComboSignature(parts) {
  return parts
    .map((part) => `${part.system}:${part.id}x${part.qty}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function isBandExerciseType(exercise) {
  return exercise.kind === "loopBands"
    || exercise.kind === "handledBands"
    || exercise.kind === "bands"
    || exercise.bandRecipe?.system === "loop"
    || exercise.bandRecipe?.system === "handled"
    || exercise.bandRecipe?.system === "mixed";
}

function shouldUseMixedPool(exercise) {
  return exercise.kind === "bands" || exercise.bandRecipe?.system === "mixed";
}

function normalizeBandSystem(systemValue) {
  if (systemValue === "loop" || systemValue === "handled") {
    return systemValue;
  }
  return null;
}

function resolveItemSystem(exercise, item) {
  const explicitSystem = normalizeBandSystem(item.system);
  if (explicitSystem) {
    return explicitSystem;
  }
  const recipeSystem = normalizeBandSystem(exercise.bandRecipe?.system);
  if (recipeSystem) {
    return recipeSystem;
  }
  if (exercise.kind === "loopBands") {
    return "loop";
  }
  if (exercise.kind === "handledBands") {
    return "handled";
  }
  return null;
}

function resolveBandById(bandId, preferredSystem) {
  if (preferredSystem === "loop") {
    const loopBand = (state.gear.loopBands || []).find((band) => band.id === bandId);
    if (loopBand) {
      return {
        system: "loop",
        id: loopBand.id,
        label: `${loopBand.color || `Unknown(${loopBand.id})`} (${loopBand.resistanceLb}lb)`,
        resistanceLb: Number(loopBand.resistanceLb || 0)
      };
    }
  }
  if (preferredSystem === "handled") {
    const handledBand = (state.gear.handledBands || []).find((band) => band.id === bandId);
    if (handledBand) {
      return {
        system: "handled",
        id: handledBand.id,
        label: `${handledBand.name || `Unknown(${handledBand.id})`} (${handledBand.resistanceLb}lb)`,
        resistanceLb: Number(handledBand.resistanceLb || 0)
      };
    }
  }

  const loopFallback = (state.gear.loopBands || []).find((band) => band.id === bandId);
  if (loopFallback) {
    return {
      system: "loop",
      id: loopFallback.id,
      label: `${loopFallback.color || `Unknown(${loopFallback.id})`} (${loopFallback.resistanceLb}lb)`,
      resistanceLb: Number(loopFallback.resistanceLb || 0)
    };
  }
  const handledFallback = (state.gear.handledBands || []).find((band) => band.id === bandId);
  if (handledFallback) {
    return {
      system: "handled",
      id: handledFallback.id,
      label: `${handledFallback.name || `Unknown(${handledFallback.id})`} (${handledFallback.resistanceLb}lb)`,
      resistanceLb: Number(handledFallback.resistanceLb || 0)
    };
  }

  return {
    system: preferredSystem || "loop",
    id: bandId,
    label: `Unknown(${bandId})`,
    resistanceLb: 0
  };
}

function usesMixedSystems(parts) {
  return new Set(parts.map((part) => part.system)).size > 1;
}

function formatComboPart(part, withSystemPrefix) {
  if (!withSystemPrefix) {
    return `${part.label} x${part.qty}`;
  }
  const prefix = part.system === "handled" ? "Handle" : "Loop";
  return `${prefix} ${part.label} x${part.qty}`;
}

