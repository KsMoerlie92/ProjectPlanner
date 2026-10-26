const STORAGE_KEY = "project-planner-v1";
const SVG_NS = "http://www.w3.org/2000/svg";

const samplePlan = {
  projectName: "New product launch",
  tasks: [
    { id: 1, title: "Confirm scope", duration: 1, dependencies: [], status: "Done", requirement: "Sponsor agrees on outcomes and boundaries.", notes: "Who signs off on the final scope?" },
    { id: 2, title: "Gather requirements", duration: 2, dependencies: [1], status: "In progress", requirement: "Access to users, business rules, and existing process documents.", notes: "Resolve conflicting stakeholder priorities." },
    { id: 3, title: "Secure suppliers", duration: 3, dependencies: [1], status: "Not started", requirement: "Supplier quotes, availability, and procurement approval.", notes: "Confirm delivery dates before committing to launch." },
    { id: 4, title: "Design the solution", duration: 2, dependencies: [2], status: "Not started", requirement: "Approved requirements and design review time.", notes: "Check accessibility and data retention needs." },
    { id: 5, title: "Build and integrate", duration: 4, dependencies: [3, 4], status: "Not started", requirement: "Supplier components and an assigned delivery team.", notes: "Integration work is on the critical path." },
    { id: 6, title: "Test and prepare launch", duration: 2, dependencies: [5], status: "Not started", requirement: "Test users, acceptance criteria, and support coverage.", notes: "Keep time for defect fixes before release." },
    { id: 7, title: "Launch", duration: 1, dependencies: [6], status: "Not started", requirement: "Acceptance approval and communications ready.", notes: "Agree on go/no-go owner." }
  ]
};

const elements = {
  projectName: document.querySelector("#project-name"),
  duration: document.querySelector("#project-duration"),
  stepCount: document.querySelector("#step-count"),
  criticalCount: document.querySelector("#critical-count"),
  timeline: document.querySelector("#timeline"),
  map: document.querySelector("#dependency-map"),
  form: document.querySelector("#task-form"),
  taskId: document.querySelector("#task-id"),
  title: document.querySelector("#task-title"),
  taskDuration: document.querySelector("#task-duration"),
  status: document.querySelector("#task-status"),
  dependencies: document.querySelector("#task-dependencies"),
  requirement: document.querySelector("#task-requirement"),
  notes: document.querySelector("#task-notes"),
  heading: document.querySelector("#form-heading"),
  save: document.querySelector("#save-task"),
  cancel: document.querySelector("#cancel-edit"),
  message: document.querySelector("#form-message"),
  list: document.querySelector("#task-list"),
  resetPlan: document.querySelector("#reset-plan"),
  storageMessage: document.querySelector("#storage-message")
};

function readPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.tasks)) return saved;
  } catch {
    elements.storageMessage.textContent = "Saved plan could not be read. The sample plan is loaded instead.";
  }
  return structuredClone(samplePlan);
}

let plan = readPlan();

function savePlan() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    elements.storageMessage.textContent = "Changes are saved in this browser.";
  } catch {
    elements.storageMessage.textContent = "Browser storage is unavailable. Changes will last for this session only.";
  }
}

function scheduleTasks() {
  const tasksById = new Map(plan.tasks.map((task) => [task.id, task]));
  const schedule = new Map();
  const visiting = new Set();

  function visit(task) {
    if (schedule.has(task.id)) return schedule.get(task.id);
    if (visiting.has(task.id)) throw new Error("A step cannot depend on itself or create a dependency loop.");
    visiting.add(task.id);
    let start = 0;
    for (const dependencyId of task.dependencies) {
      const dependency = tasksById.get(dependencyId);
      if (dependency) start = Math.max(start, visit(dependency).finish);
    }
    visiting.delete(task.id);
    const item = { task, start, finish: start + task.duration };
    schedule.set(task.id, item);
    return item;
  }

  for (const task of plan.tasks) visit(task);
  const successors = new Map(plan.tasks.map((task) => [task.id, []]));
  for (const task of plan.tasks) {
    for (const dependencyId of task.dependencies) {
      if (successors.has(dependencyId)) successors.get(dependencyId).push(task.id);
    }
  }
  const projectDuration = Math.max(0, ...Array.from(schedule.values(), (item) => item.finish));
  const latest = new Map();

  function calculateLatest(taskId) {
    if (latest.has(taskId)) return latest.get(taskId);
    const item = schedule.get(taskId);
    const nextTasks = successors.get(taskId);
    const latestFinish = nextTasks.length
      ? Math.min(...nextTasks.map((nextId) => calculateLatest(nextId).start))
      : projectDuration;
    const result = { start: latestFinish - item.task.duration };
    latest.set(taskId, result);
    return result;
  }

  for (const task of plan.tasks) calculateLatest(task.id);
  const criticalIds = new Set(
    plan.tasks.filter((task) => schedule.get(task.id).start === latest.get(task.id).start).map((task) => task.id)
  );

  return {
    schedule,
    criticalIds,
    projectDuration,
    ordered: [...plan.tasks].sort((a, b) => schedule.get(a.id).start - schedule.get(b.id).start || a.id - b.id)
  };
}

function svgElement(name, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawTimeline(data) {
  const svg = elements.timeline;
  svg.replaceChildren();
  if (!plan.tasks.length) {
    svg.setAttribute("viewBox", "0 0 600 145");
    svg.append(svgElement("text", { x: 22, y: 75, class: "chart-empty" }, "Add project steps to build your timeline."));
    return;
  }
  const labelWidth = 205;
  const chartWidth = 650;
  const rowHeight = 43;
  const top = 28;
  const height = top + rowHeight * data.ordered.length + 12;
  const duration = Math.max(data.projectDuration, 1);
  const tickStep = Math.max(1, Math.ceil(duration / 12));
  svg.setAttribute("viewBox", `0 0 ${labelWidth + chartWidth + 12} ${height}`);
  svg.setAttribute("aria-label", `Project timeline, ${data.projectDuration} weeks. Critical steps are highlighted in red.`);

  for (let week = 0; week <= duration; week += tickStep) {
    const x = labelWidth + (week / duration) * chartWidth;
    svg.append(svgElement("line", { x1: x, y1: top - 5, x2: x, y2: height - 8, class: "grid-line" }));
    svg.append(svgElement("text", { x, y: 15, "text-anchor": "middle", class: "axis-label" }, `${week}w`));
  }
  if (duration % tickStep !== 0) {
    const x = labelWidth + chartWidth;
    svg.append(svgElement("text", { x, y: 15, "text-anchor": "middle", class: "axis-label" }, `${duration}w`));
  }

  data.ordered.forEach((task, index) => {
    const item = data.schedule.get(task.id);
    const y = top + index * rowHeight;
    const critical = data.criticalIds.has(task.id);
    svg.append(svgElement("text", { x: 0, y: y + 15, class: "row-label" }, task.title.length > 27 ? `${task.title.slice(0, 26)}…` : task.title));
    svg.append(svgElement("rect", {
      x: labelWidth + (item.start / duration) * chartWidth,
      y: y + 2,
      width: Math.max(4, (task.duration / duration) * chartWidth),
      height: 20,
      rx: 5,
      class: `bar${critical ? " critical" : ""}${task.status === "Done" ? " done" : ""}`
    }));
    svg.append(svgElement("text", {
      x: Math.min(labelWidth + ((item.start + task.duration / 2) / duration) * chartWidth, labelWidth + chartWidth - 2),
      y: y + 16,
      "text-anchor": "middle",
      fill: "white",
      "font-size": 10,
      "font-weight": 700
    }, `${task.duration}w`));
  });
}

function drawDependencyMap(data) {
  const svg = elements.map;
  svg.replaceChildren();
  if (!plan.tasks.length) {
    svg.setAttribute("viewBox", "0 0 600 145");
    svg.setAttribute("width", "600");
    svg.setAttribute("height", "145");
    svg.append(svgElement("text", { x: 22, y: 75, class: "chart-empty" }, "Add project steps to build the dependency map."));
    return;
  }
  const tasksById = new Map(plan.tasks.map((task) => [task.id, task]));
  const levels = new Map();
  const visiting = new Set();

  function findLevel(task) {
    if (levels.has(task.id)) return levels.get(task.id);
    if (visiting.has(task.id)) return 0;
    visiting.add(task.id);
    const level = task.dependencies.reduce((max, dependencyId) => {
      const dependency = tasksById.get(dependencyId);
      return dependency ? Math.max(max, findLevel(dependency) + 1) : max;
    }, 0);
    visiting.delete(task.id);
    levels.set(task.id, level);
    return level;
  }

  plan.tasks.forEach(findLevel);
  const columns = new Map();
  for (const task of plan.tasks) {
    const level = levels.get(task.id);
    if (!columns.has(level)) columns.set(level, []);
    columns.get(level).push(task);
  }
  const positions = new Map();
  for (const [level, tasks] of columns) {
    tasks.forEach((task, row) => positions.set(task.id, { x: 20 + level * 250, y: 25 + row * 105 }));
  }
  const maxRows = Math.max(...Array.from(columns.values(), (column) => column.length));
  const width = Math.max(640, (Math.max(...columns.keys()) + 1) * 250 + 200);
  const height = Math.max(165, maxRows * 105 + 30);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-label", "Dependency map. Arrows point from prerequisite steps to the steps they unlock.");

  const defs = svgElement("defs");
  const marker = svgElement("marker", { id: "arrowhead", markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
  marker.append(svgElement("path", { d: "M0,0 L0,6 L7,3 z", fill: "#a9b8c7" }));
  defs.append(marker);
  svg.append(defs);

  for (const task of plan.tasks) {
    for (const dependencyId of task.dependencies) {
      const from = positions.get(dependencyId);
      const to = positions.get(task.id);
      if (!from || !to) continue;
      const criticalEdge = data.criticalIds.has(task.id)
        && data.criticalIds.has(dependencyId)
        && data.schedule.get(task.id).start === data.schedule.get(dependencyId).finish;
      svg.append(svgElement("path", {
        d: `M ${from.x + 180} ${from.y + 36} C ${from.x + 215} ${from.y + 36}, ${to.x - 35} ${to.y + 36}, ${to.x} ${to.y + 36}`,
        class: `dependency-edge${criticalEdge ? " critical" : ""}`,
        "marker-end": "url(#arrowhead)"
      }));
    }
  }

  for (const task of plan.tasks) {
    const { x, y } = positions.get(task.id);
    const critical = data.criticalIds.has(task.id);
    const node = svgElement("g");
    node.append(svgElement("rect", {
      x, y, width: 180, height: 72, rx: 9,
      class: `map-node${critical ? " critical" : ""}${task.status === "Done" ? " done" : ""}`
    }));
    node.append(svgElement("text", { x: x + 11, y: y + 23, class: "node-title" }, task.title.length > 22 ? `${task.title.slice(0, 21)}…` : task.title));
    node.append(svgElement("text", { x: x + 11, y: y + 43, class: "node-detail" }, `${task.duration} week${task.duration === 1 ? "" : "s"} · ${task.status}`));
    if (critical) node.append(svgElement("text", { x: x + 11, y: y + 59, class: "critical-label" }, "CRITICAL"));
    svg.append(node);
  }
}

function renderTaskList(data) {
  elements.list.replaceChildren();
  if (!plan.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "Your plan is ready to take shape. Add a step to start discussing the work and what it needs.";
    elements.list.append(empty);
    return;
  }
  for (const task of data.ordered) {
    const critical = data.criticalIds.has(task.id);
    const card = document.createElement("article");
    card.className = `task-card${critical ? " critical-card" : ""}`;

    const topLine = document.createElement("div");
    topLine.className = "task-topline";
    const titleGroup = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "task-title";
    title.textContent = task.title;
    const meta = document.createElement("p");
    meta.className = "task-meta";
    meta.textContent = `Week ${data.schedule.get(task.id).start + 1} · ${task.duration} week${task.duration === 1 ? "" : "s"} · ${task.status}`;
    titleGroup.append(title, meta);
    const badge = document.createElement("span");
    badge.className = `task-badge${critical ? " critical-badge" : ""}`;
    badge.textContent = critical ? "Critical path" : task.status;
    topLine.append(titleGroup, badge);
    card.append(topLine);

    const details = document.createElement("dl");
    const dependencyNames = task.dependencies.map((id) => plan.tasks.find((item) => item.id === id)?.title).filter(Boolean);
    const detailRows = [
      ["Prerequisites", dependencyNames.length ? dependencyNames.join(", ") : "None"],
      ["Requirements / inputs", task.requirement || "Not specified yet"],
      ["Discussion / risks", task.notes || "Nothing noted yet"]
    ];
    for (const [label, value] of detailRows) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      wrapper.append(term, description);
      details.append(wrapper);
    }
    card.append(details);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editTask(task));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-task";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteTask(task));
    actions.append(edit, remove);
    card.append(actions);
    elements.list.append(card);
  }
}

function refreshDependencyOptions(selectedIds = []) {
  const editingId = Number(elements.taskId.value) || null;
  elements.dependencies.replaceChildren();
  for (const task of plan.tasks) {
    if (task.id === editingId) continue;
    const option = document.createElement("option");
    option.value = String(task.id);
    option.textContent = task.title;
    option.selected = selectedIds.includes(task.id);
    elements.dependencies.append(option);
  }
}

function render() {
  let data;
  try {
    data = scheduleTasks();
  } catch {
    data = { schedule: new Map(), criticalIds: new Set(), projectDuration: 0, ordered: plan.tasks };
  }
  elements.projectName.value = plan.projectName || "";
  elements.duration.textContent = `${data.projectDuration} weeks`;
  elements.stepCount.textContent = String(plan.tasks.length);
  elements.criticalCount.textContent = String(data.criticalIds.size);
  drawTimeline(data);
  drawDependencyMap(data);
  renderTaskList(data);
  refreshDependencyOptions();
}

function resetForm() {
  elements.form.reset();
  elements.taskId.value = "";
  elements.taskDuration.value = "1";
  elements.heading.textContent = "Add a step";
  elements.save.textContent = "Add step";
  elements.cancel.hidden = true;
  elements.message.textContent = "";
  refreshDependencyOptions();
}

function editTask(task) {
  elements.taskId.value = String(task.id);
  elements.title.value = task.title;
  elements.taskDuration.value = String(task.duration);
  elements.status.value = task.status;
  elements.requirement.value = task.requirement;
  elements.notes.value = task.notes;
  elements.heading.textContent = "Edit step";
  elements.save.textContent = "Save changes";
  elements.cancel.hidden = false;
  elements.message.textContent = "";
  refreshDependencyOptions(task.dependencies);
  elements.title.focus();
}

function deleteTask(task) {
  plan.tasks = plan.tasks
    .filter((item) => item.id !== task.id)
    .map((item) => ({ ...item, dependencies: item.dependencies.filter((id) => id !== task.id) }));
  if (Number(elements.taskId.value) === task.id) resetForm();
  savePlan();
  render();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = Number(elements.taskId.value) || Math.max(Date.now(), ...plan.tasks.map((item) => item.id + 1));
  const task = {
    id,
    title: elements.title.value.trim(),
    duration: Number(elements.taskDuration.value),
    status: elements.status.value,
    dependencies: Array.from(elements.dependencies.selectedOptions, (option) => Number(option.value)),
    requirement: elements.requirement.value.trim(),
    notes: elements.notes.value.trim()
  };
  if (!task.title || !Number.isInteger(task.duration) || task.duration < 1 || task.duration > 520) {
    elements.message.textContent = "Enter a step name and a whole-number duration from 1 to 520 weeks.";
    return;
  }
  const previousTasks = plan.tasks;
  plan.tasks = elements.taskId.value
    ? plan.tasks.map((item) => item.id === id ? task : item)
    : [...plan.tasks, task];
  try {
    scheduleTasks();
  } catch (error) {
    plan.tasks = previousTasks;
    elements.message.textContent = error.message;
    return;
  }
  savePlan();
  resetForm();
  render();
});

elements.cancel.addEventListener("click", resetForm);
elements.projectName.addEventListener("change", () => {
  plan.projectName = elements.projectName.value.trim() || "Untitled project";
  savePlan();
  elements.projectName.value = plan.projectName;
});
elements.resetPlan.addEventListener("click", () => {
  plan = structuredClone(samplePlan);
  savePlan();
  resetForm();
  render();
});

render();
elements.storageMessage.textContent ||= "Changes are saved in this browser.";
