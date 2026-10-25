(() => {
  "use strict";

  const DEFAULT_API = import.meta.env.DEV ? "" : import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
  const API_KEY = "routewise.apiBase";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    apiBase: (localStorage.getItem(API_KEY) || DEFAULT_API).replace(/\/+$/, ""),
    projects: [],
    project: null,
    plannings: [],
    tab: "orders",
    result: null,
    resultPlanId: null,
    editing: null,
    polling: new Set(),
  };
  const forms = {
    location: [
      { name: "id", label: "Location ID", type: "number", required: true, min: 1, hint: "A unique positive ID for this project." },
      { name: "latitude", label: "Latitude", type: "number", required: true, min: -90, max: 90, step: "any" },
      { name: "longitude", label: "Longitude", type: "number", required: true, min: -180, max: 180, step: "any" },
    ],
    vehicle: [
      { name: "id", label: "Vehicle type ID", type: "number", required: true, min: 1 },
      { name: "name", label: "Vehicle name", type: "text", required: true, maxLength: 120, placeholder: "e.g. Refrigerated truck" },
      { name: "count", label: "Number available", type: "number", required: true, min: 1 },
      { name: "cost", label: "Fixed cost", type: "number", required: true, min: 0, step: "any" },
      { name: "weightLimit", label: "Weight limit (lb)", type: "number", required: true, min: 0.000001, step: "any" },
      { name: "volumeLimit", label: "Volume limit (ft³)", type: "number", required: true, min: 0.000001, step: "any" },
    ],
    order: [
      { name: "id", label: "Order ID", type: "number", required: true, min: 1 },
      { name: "originLocationId", label: "Pickup location", type: "select", required: true, options: "locations" },
      { name: "destinationLocationId", label: "Drop-off location", type: "select", required: true, options: "locations" },
      { name: "weightPounds", label: "Weight (lb)", type: "number", required: true, min: 0, step: "any" },
      { name: "volumeCubicFeet", label: "Volume (ft³)", type: "number", required: true, min: 0, step: "any" },
      { name: "pickupStart", label: "Pickup window starts", type: "datetime-local", required: true },
      { name: "pickupEnd", label: "Pickup window ends", type: "datetime-local", required: true },
      { name: "deliveryStart", label: "Drop-off window starts", type: "datetime-local", required: true },
      { name: "deliveryEnd", label: "Drop-off window ends", type: "datetime-local", required: true },
    ],
  };
  const defaultConstraints = {
    routeType: "default", averageSpeed: 50, distanceCost: 1.5, waitingTimeCost: 0.25,
    perStopCharge: 5, fixedHandlingTime: 0.25, variableHandlingRate: 60186.1976,
    stopLimit: 30, enableAggregation: true, minTimeOverlap: 1, enablePSO: false,
    locationMarginFactor: 0.5, particlesCount: 30, maxIterations: 10,
    inertiaWeight: 0.5, cognitiveWeight: 1.5, socialWeight: 2,
  };
  const constraintFields = [
    { name: "routeType", label: "Route strategy", type: "select", options: [
      ["default", "Default"], ["pickThenDrop", "Pick then drop"], ["firstInLastOut", "First in, last out"],
    ] },
    { name: "averageSpeed", label: "Average speed (mi/h)", type: "number", min: 0.01, step: "any" },
    { name: "distanceCost", label: "Distance cost / mi", type: "number", min: 0, step: "any" },
    { name: "waitingTimeCost", label: "Waiting cost / hr", type: "number", min: 0, step: "any" },
    { name: "perStopCharge", label: "Per-stop charge", type: "number", min: 0, step: "any" },
    { name: "fixedHandlingTime", label: "Handling time / stop (hr)", type: "number", min: 0, step: "any" },
    { name: "variableHandlingRate", label: "Handling rate (lb/hr)", type: "number", min: 0.01, step: "any" },
    { name: "stopLimit", label: "Stop limit", type: "number", min: 1 },
    { name: "minTimeOverlap", label: "Min. time overlap (hr)", type: "number", min: 0, step: "any" },
    { name: "locationMarginFactor", label: "Location margin factor", type: "number", min: 0, step: "any" },
    { name: "particlesCount", label: "Particle count", type: "number", min: 1 },
    { name: "maxIterations", label: "Max iterations", type: "number", min: 1 },
    { name: "inertiaWeight", label: "Inertia weight", type: "number", min: 0, step: "any" },
    { name: "cognitiveWeight", label: "Cognitive weight", type: "number", min: 0, step: "any" },
    { name: "socialWeight", label: "Social weight", type: "number", min: 0, step: "any" },
    { name: "enableAggregation", label: "Enable order aggregation", type: "checkbox" },
    { name: "enablePSO", label: "Enable particle swarm optimization", type: "checkbox" },
  ];

  const projectDialog = $("#projectDialog");
  const entityDialog = $("#entityDialog");
  const resultDialog = $("#resultDialog");
  const apiDialog = $("#apiDialog");

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${state.apiBase}${path}`, options);
    } catch (error) {
      setApiIndicator(false);
      throw new Error(`Could not reach the Planning API at ${state.apiBase}. Check that the backend is running and the API URL is correct.`);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null
        ? (payload.error || payload.message || `Request failed (${response.status}).`)
        : (payload || `Request failed (${response.status}).`);
      throw new Error(message);
    }
    setApiIndicator(true);
    return payload;
  }

  function jsonOptions(method, body) {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  function setApiIndicator(connected) {
    const indicator = $("#apiIndicator");
    indicator.classList.toggle("connected", connected);
    indicator.classList.toggle("disconnected", !connected);
    $("span", indicator).textContent = connected ? "Planning API connected" : "API unavailable";
  }

  function toast(message, kind = "success", duration = 4200) {
    const element = document.createElement("div");
    element.className = `toast ${kind === "error" ? "error" : kind === "info" ? "info" : ""}`;
    element.textContent = message;
    $("#toastRegion").append(element);
    window.setTimeout(() => element.remove(), duration);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function setBusy(button, busy, busyText = "Working…") {
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.disabled = busy;
    button.innerHTML = busy ? busyText : button.dataset.label;
  }

  function fmtDate(date) {
    if (!date) return "—";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(parsed);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  async function loadProjects(selectId) {
    try {
      state.projects = await api("/api/projects");
      renderProjectList();
      if (selectId && state.projects.some(project => project.id === selectId)) await selectProject(selectId);
      else if (state.project && state.projects.some(project => project.id === state.project.id)) {
        await selectProject(state.project.id);
      } else if (state.projects.length) await selectProject(state.projects[0].id);
      else showWelcome();
    } catch (error) {
      setApiIndicator(false);
      toast(error.message, "error", 6500);
      if (!state.projects.length) showWelcome();
    }
  }

  function renderProjectList() {
    $("#projectList").innerHTML = state.projects.map(project => `
      <button class="project-nav-item ${state.project?.id === project.id ? "active" : ""}" type="button" data-project-id="${esc(project.id)}" title="${esc(project.name)}">
        <span class="project-nav-icon">${esc(project.name.slice(0, 1).toUpperCase())}</span><span>${esc(project.name)}</span>
      </button>`).join("");
  }

  function showWelcome() {
    state.project = null;
    state.plannings = [];
    $("#welcomeView").hidden = false;
    $("#projectView").hidden = true;
    $("#breadcrumbProject").textContent = "Select a project";
    renderProjectList();
  }

  async function selectProject(projectId) {
    try {
      state.project = await api(`/api/projects/${encodeURIComponent(projectId)}`);
      $("#welcomeView").hidden = true;
      $("#projectView").hidden = false;
      state.tab = "orders";
      $("#breadcrumbProject").textContent = state.project.name;
      $("#projectTitle").textContent = state.project.name;
      $("#projectSubtitle").textContent = "Build your input, then create a plan whenever you’re ready.";
      renderProjectList();
      renderProject();
      await loadPlannings();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function inputState() {
    const input = state.project?.input || {};
    return {
      schemaVersion: input.schemaVersion || "1",
      locations: input.locations || [],
      fleet: input.fleet || [],
      orders: input.orders || [],
      constraints: input.constraints || null,
    };
  }

  function readiness() {
    const input = inputState();
    const vehicleCount = input.fleet.reduce((sum, vehicle) => sum + Number(vehicle.count || 0), 0);
    const locationIds = new Set(input.locations.map(location => location.id));
    const locationsValid = input.orders.every(order =>
      locationIds.has(order.originLocationId) && locationIds.has(order.destinationLocationId));
    const timesValid = input.orders.every(order =>
      order.pickupWindow?.start && order.pickupWindow?.end
      && order.deliveryWindow?.start && order.deliveryWindow?.end
      && order.pickupWindow.start <= order.pickupWindow.end
      && order.deliveryWindow.start <= order.deliveryWindow.end);
    const checks = [
      { label: "At least one location", detail: `${input.locations.length} added`, pass: input.locations.length > 0 },
      { label: "Fleet available", detail: `${vehicleCount} vehicles across ${input.fleet.length} types`, pass: vehicleCount > 0 },
      { label: "At least one order", detail: `${input.orders.length} added`, pass: input.orders.length > 0 },
      { label: "Order locations exist", detail: locationsValid ? "Every pickup and drop-off is linked" : "Add or select each order’s locations", pass: locationsValid },
      { label: "Time windows valid", detail: timesValid ? "Pickup and drop-off windows are set" : "Set valid start and end times", pass: timesValid },
      { label: "Planning constraints set", detail: input.constraints ? "Ready for this plan" : "Set your route and cost preferences", pass: !!input.constraints },
    ];
    return { checks, ready: checks.every(check => check.pass), vehicleCount };
  }

  function renderProject() {
    if (!state.project) return;
    const input = inputState();
    const readinessState = readiness();
    $("#locationCount").textContent = input.locations.length;
    $("#vehicleCount").textContent = input.fleet.length;
    $("#vehicleCountDetail").textContent = `${readinessState.vehicleCount} vehicles available`;
    $("#orderCount").textContent = input.orders.length;
    $("#planningCount").textContent = state.plannings.length;
    $("#ordersTabCount").textContent = input.orders.length;
    $("#locationsTabCount").textContent = input.locations.length;
    $("#fleetTabCount").textContent = input.fleet.length;
    $("#updatedAtLabel").textContent = state.project.updatedAt ? `UPDATED ${fmtDate(state.project.updatedAt).toUpperCase()}` : "CURRENT INPUT";
    $("#saveState").innerHTML = '<i></i> All changes saved';
    renderReadiness(readinessState);
    renderTab();
  }

  function renderReadiness(status) {
    $("#readinessList").innerHTML = status.checks.map(check => `
      <div class="readiness-item ${check.pass ? "complete" : ""}">
        <span class="check-mark">${check.pass ? "✓" : "·"}</span>
        <span><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></span>
      </div>`).join("");
    $("#planButton").disabled = !status.ready;
    $("#readinessPlanButton").disabled = !status.ready;
    $("#planButton").title = status.ready ? "Create a plan from the current input" : "Complete the readiness checklist first";
  }

  function renderTab() {
    if (state.tab === "locations") renderLocations();
    else if (state.tab === "fleet") renderFleet();
    else if (state.tab === "constraints") renderConstraints();
    else if (state.tab === "import") renderImport();
    else renderOrders();
  }

  function tabHeader(title, detail, buttonLabel, action, disabled = false) {
    return `<div class="tab-title-row"><div><h3>${title}</h3><p>${detail}</p></div>
      <button class="button button-secondary button-small" type="button" data-action="${action}" ${disabled ? "disabled" : ""}><span class="plus">＋</span>${buttonLabel}</button></div>`;
  }

  function emptyState(icon, title, detail, action, buttonText) {
    return `<div class="empty-state"><span class="empty-illustration">${icon}</span><h4>${title}</h4><p>${detail}</p>
      ${action ? `<button class="button button-secondary button-small" type="button" data-action="${action}">${buttonText}</button>` : ""}</div>`;
  }

  function renderOrders() {
    const input = inputState();
    const content = $("#tabContent");
    if (!input.orders.length) {
      content.innerHTML = `${tabHeader("Shipment orders", "Define what needs to move and when.", "Add order", "add-order", input.locations.length < 1)}
        ${emptyState("□", "Your route starts with an order", input.locations.length < 1
          ? "Add a location first, then connect an order to existing pickup and drop-off sites."
          : "Add your first shipment with its pickup, drop-off, and delivery windows.", input.locations.length >= 1 ? "add-order" : "", "Add your first order")}`;
      return;
    }
    content.innerHTML = `${tabHeader("Shipment orders", `${input.orders.length} orders in this input.`, "Add order", "add-order", input.locations.length < 1)}
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>ORDER</th><th>ROUTE</th><th>WEIGHT / VOLUME</th><th>PICKUP WINDOW</th><th></th></tr></thead><tbody>
      ${input.orders.map(order => {
        const origin = input.locations.find(location => location.id === order.originLocationId);
        const destination = input.locations.find(location => location.id === order.destinationLocationId);
        return `<tr><td>#${esc(order.id)}</td><td>${esc(order.originLocationId)} → ${esc(order.destinationLocationId)}<span class="cell-sub">${origin ? `${origin.latitude.toFixed(2)}, ${origin.longitude.toFixed(2)}` : "Unknown"} → ${destination ? `${destination.latitude.toFixed(2)}, ${destination.longitude.toFixed(2)}` : "Unknown"}</span></td><td>${Number(order.weightPounds).toLocaleString()} lb<span class="cell-sub">${Number(order.volumeCubicFeet).toLocaleString()} ft³</span></td><td>${esc(fmtWindow(order.pickupWindow))}</td><td>${rowActions("order", order.id)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function renderLocations() {
    const locations = inputState().locations;
    if (!locations.length) {
      $("#tabContent").innerHTML = `${tabHeader("Pickup & drop-off sites", "Locations can be added independently.", "Add location", "add-location")}
        ${emptyState("⌖", "No locations yet", "Add your shipping sites first. Orders will use these locations for pickup and drop-off.", "add-location", "Add your first location")}`;
      return;
    }
    $("#tabContent").innerHTML = `${tabHeader("Pickup & drop-off sites", `${locations.length} locations in this input.`, "Add location", "add-location")}
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>LOCATION ID</th><th>LATITUDE</th><th>LONGITUDE</th><th>ORDERS USING SITE</th><th></th></tr></thead><tbody>
      ${locations.map(location => {
        const used = inputState().orders.filter(order => order.originLocationId === location.id || order.destinationLocationId === location.id).length;
        return `<tr><td>${esc(location.id)}</td><td>${Number(location.latitude).toFixed(5)}</td><td>${Number(location.longitude).toFixed(5)}</td><td>${used}</td><td>${rowActions("location", location.id)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function renderFleet() {
    const fleet = inputState().fleet;
    if (!fleet.length) {
      $("#tabContent").innerHTML = `${tabHeader("Vehicle types", "Fleet availability is independent of locations.", "Add vehicle", "add-vehicle")}
        ${emptyState("▰", "Your fleet is waiting", "Add vehicle types with their capacity, cost, and how many are available.", "add-vehicle", "Add a vehicle type")}`;
      return;
    }
    $("#tabContent").innerHTML = `${tabHeader("Vehicle types", `${fleet.reduce((sum, item) => sum + item.count, 0)} vehicles across ${fleet.length} types.`, "Add vehicle", "add-vehicle")}
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>VEHICLE</th><th>AVAILABLE</th><th>WEIGHT LIMIT</th><th>VOLUME LIMIT</th><th>FIXED COST</th><th></th></tr></thead><tbody>
      ${fleet.map(vehicle => `<tr><td>${esc(vehicle.name)}<span class="cell-sub">Type #${esc(vehicle.id)}</span></td><td>${esc(vehicle.count)}</td><td>${Number(vehicle.weightLimit).toLocaleString()} lb</td><td>${Number(vehicle.volumeLimit).toLocaleString()} ft³</td><td>${Number(vehicle.cost).toLocaleString()}</td><td>${rowActions("vehicle", vehicle.id)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function rowActions(type, id) {
    return `<div class="row-actions"><button class="icon-button" type="button" data-action="edit-${type}" data-id="${esc(id)}" aria-label="Edit">✎</button><button class="icon-button danger" type="button" data-action="delete-${type}" data-id="${esc(id)}" aria-label="Delete">×</button></div>`;
  }

  function fmtWindow(window) {
    if (!window?.start || !window?.end) return "—";
    const short = value => value.replace("T", " ");
    return `${short(window.start)} – ${short(window.end)}`;
  }

  function renderConstraints() {
    const current = inputState().constraints || defaultConstraints;
    $("#tabContent").innerHTML = `<div class="tab-title-row"><div><h3>Planning constraints</h3><p>${inputState().constraints ? "Adjust how the planner builds and scores routes." : "Suggested values are prefilled. Save to make this input plan-ready."}</p></div></div>
      <form id="constraintsForm" class="constraints-grid">
        ${constraintFields.map(field => {
          if (field.type === "checkbox") return `<label class="toggle-field">${field.label}<input class="toggle" type="checkbox" name="${field.name}" ${current[field.name] ? "checked" : ""}></label>`;
          const input = field.type === "select"
            ? `<select name="${field.name}">${field.options.map(([value, label]) => `<option value="${value}" ${current[field.name] === value ? "selected" : ""}>${label}</option>`).join("")}</select>`
            : `<input name="${field.name}" type="number" value="${esc(current[field.name])}" min="${field.min}" ${field.step ? `step="${field.step}"` : ""} required>`;
          return `<div class="constraint-field"><label for="constraint-${field.name}">${field.label}</label>${input.replace(`name="${field.name}"`, `name="${field.name}" id="constraint-${field.name}"`)}</div>`;
        }).join("")}
        <div class="constraint-actions"><button class="button button-primary button-small" type="submit">Save constraints <span>→</span></button></div>
      </form>`;
  }

  function renderImport() {
    const hasConstraints = !!inputState().constraints;
    $("#tabContent").innerHTML = `<div class="tab-title-row"><div><h3>Start from a spreadsheet</h3><p>Import locations, fleet, and orders into this project.</p></div></div>
      <form id="importForm">
        <label class="import-drop" id="importDrop" for="workbookFile">
          <input id="workbookFile" type="file" accept=".xlsx,.xls" required>
          <span><span class="import-icon">↑</span><h3>Drop your workbook here</h3><p>or <span style="color:#4d805a;font-weight:600">browse files</span> · Excel workbook</p><p class="import-filename" id="importFilename"></p></span>
        </label>
        <div class="import-warning" style="margin-top:12px;color:${hasConstraints ? "#849188" : "#b15e50"};font-size:9px">${hasConstraints
          ? "Import replaces the project’s current locations, fleet, orders, and constraints. Your existing plannings are not affected."
          : "Save planning constraints first. Excel import requires the complete constraints object."}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="button button-primary button-small" type="submit" ${hasConstraints ? "" : "disabled"}>Replace input from Excel <span>→</span></button></div>
      </form>`;
    const fileInput = $("#workbookFile");
    fileInput.addEventListener("change", () => {
      $("#importFilename").textContent = fileInput.files?.[0]?.name || "";
    });
    const drop = $("#importDrop");
    for (const eventName of ["dragenter", "dragover"]) drop.addEventListener(eventName, event => {
      event.preventDefault();
      drop.classList.add("dragover");
    });
    for (const eventName of ["dragleave", "drop"]) drop.addEventListener(eventName, event => {
      event.preventDefault();
      drop.classList.remove("dragover");
      if (eventName === "drop" && event.dataTransfer.files.length) {
        fileInput.files = event.dataTransfer.files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
    $("#importForm").addEventListener("submit", importWorkbook);
  }

  function renderPlannings() {
    if (!state.plannings.length) {
      $("#planningHistory").innerHTML = '<div class="planning-history-empty">Plans you create will show up here.</div>';
      return;
    }
    $("#planningHistory").innerHTML = state.plannings.slice(0, 5).map(plan => `
      <div class="history-item"><span class="history-status ${String(plan.status).toLowerCase()}"></span>
        <span class="history-info"><strong>${esc(plan.status === "COMPLETED" ? "Plan complete" : plan.status === "FAILED" ? "Plan failed" : "Planning in progress")}</strong><small>${esc(fmtDate(plan.createdAt))}${plan.phase ? ` · ${esc(plan.phase)}` : ""}</small></span>
        ${plan.status === "COMPLETED" ? `<button class="history-result" type="button" data-action="view-result" data-id="${esc(plan.id)}">View</button>` : ""}
      </div>`).join("");
  }

  async function loadPlannings() {
    if (!state.project) return;
    try {
      state.plannings = await api(`/api/projects/${encodeURIComponent(state.project.id)}/plannings`);
      renderPlannings();
      $("#planningCount").textContent = state.plannings.length;
      for (const plan of state.plannings) {
        if (plan.status === "QUEUED" || plan.status === "RUNNING") pollPlan(plan.id, false);
      }
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function refreshPlanning(planId) {
    const updated = await api(`/api/plans/${encodeURIComponent(planId)}`);
    const index = state.plannings.findIndex(item => item.id === planId);
    if (index >= 0) state.plannings[index] = updated;
    else state.plannings.unshift(updated);
    renderPlannings();
    $("#planningCount").textContent = state.plannings.length;
    return updated;
  }

  async function pollPlan(planId, announce) {
    if (state.polling.has(planId)) return;
    state.polling.add(planId);
    try {
      let plan;
      do {
        plan = await refreshPlanning(planId);
        if (announce) toast(`Plan ${plan.id.slice(0, 8)} · ${plan.phase || plan.status}`, "info", 2500);
        if (plan.status === "QUEUED" || plan.status === "RUNNING") {
          await new Promise(resolve => window.setTimeout(resolve, 1800));
        }
      } while (plan.status === "QUEUED" || plan.status === "RUNNING");
      if (plan.status === "COMPLETED") {
        toast("Your planning is ready.", "success");
        await showResult(plan.id);
      } else {
        toast(plan.error || "Planning failed. Check the plan status for details.", "error", 6500);
      }
    } catch (error) {
      toast(error.message, "error", 6500);
    } finally {
      state.polling.delete(planId);
    }
  }

  async function createPlanning() {
    if (!state.project) return;
    const button = $("#planButton");
    setBusy(button, true, "Submitting…");
    try {
      const plan = await api(`/api/projects/${encodeURIComponent(state.project.id)}/plannings`, { method: "POST" });
      state.plannings.unshift(plan);
      renderPlannings();
      $("#planningCount").textContent = state.plannings.length;
      toast("Input snapshot created. Planning has started.", "info");
      pollPlan(plan.id, false);
    } catch (error) {
      toast(error.message, "error", 6000);
    } finally {
      setBusy(button, false);
    }
  }

  async function showResult(planId) {
    try {
      const plan = state.plannings.find(item => item.id === planId) || await api(`/api/plans/${encodeURIComponent(planId)}`);
      if (plan.status !== "COMPLETED") throw new Error("This planning has not completed successfully.");
      state.result = await api(`/api/plans/${encodeURIComponent(planId)}/result`);
      state.resultPlanId = planId;
      const summary = state.result.overallSummary || {};
      $("#resultTitle").textContent = "Your plan is ready";
      $("#resultSummary").textContent = `Plan ${planId.slice(0, 8)} · ${state.result.routes?.length || 0} routes created`;
      $("#resultMetrics").innerHTML = [
        ["Total cost", formatNumber(summary.totalCost)],
        ["Vehicles", formatNumber(summary.vehiclesUsed)],
        ["Weight utilization", formatPercent(summary.weightUtilization)],
        ["Avg. stops", formatNumber(summary.averageStops)],
      ].map(([label, value]) => `<div class="result-metric"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("");
      $("#resultJson").hidden = true;
      $("#resultJson").textContent = JSON.stringify(state.result, null, 2);
      openDialog(resultDialog);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function formatNumber(value) {
    return typeof value === "number" ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value) : "—";
  }

  function formatPercent(value) {
    return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
  }

  async function downloadExcel() {
    if (!state.resultPlanId) return;
    try {
      const response = await fetch(`${state.apiBase}/api/plans/${encodeURIComponent(state.resultPlanId)}/result?format=excel`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Excel download failed (${response.status}).`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `planning-result-${state.resultPlanId.slice(0, 8)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function showEntityForm(type, id = null) {
    const input = inputState();
    const items = type === "location" ? input.locations : type === "vehicle" ? input.fleet : input.orders;
    const item = id === null ? null : items.find(entry => entry.id === Number(id));
    if (id !== null && !item) return toast("That item is no longer in the project.", "error");
    if (type === "order" && input.locations.length < 1) {
      state.tab = "locations";
      renderTab();
      toast("Add a location before creating an order.", "info");
      return;
    }
    state.editing = { type, id: id === null ? null : Number(id) };
    $("#entityIcon").textContent = type === "location" ? "⌖" : type === "vehicle" ? "▰" : "□";
    $("#entityEyebrow").textContent = `${type.toUpperCase()} · ${item ? "EDIT" : "ADD TO PROJECT"}`;
    $("#entityTitle").textContent = `${item ? "Edit" : "Add"} ${type === "vehicle" ? "vehicle type" : type}`;
    $("#entitySubmit").textContent = item ? "Save changes" : `Add ${type === "vehicle" ? "vehicle" : type}`;
    const fields = forms[type].map(field => {
      let value = item?.[field.name] ?? "";
      if (type === "order" && field.name.endsWith("Start")) {
        const window = field.name.startsWith("pickup") ? item?.pickupWindow : item?.deliveryWindow;
        value = window?.start || "";
      }
      if (type === "order" && field.name.endsWith("End")) {
        const window = field.name.startsWith("pickup") ? item?.pickupWindow : item?.deliveryWindow;
        value = window?.end || "";
      }
      if (field.type === "select") {
        return `<div class="form-field"><label for="entity-${field.name}">${field.label}</label><select id="entity-${field.name}" class="form-control" name="${field.name}" required>
          <option value="">Choose location</option>${input.locations.map(location => `<option value="${location.id}" ${Number(value) === location.id ? "selected" : ""}>Location #${location.id} · ${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}</option>`).join("")}</select></div>`;
      }
      return `<div class="form-field ${field.name === "name" ? "span-2" : ""}"><label for="entity-${field.name}">${field.label}</label>
        <input class="form-control" id="entity-${field.name}" name="${field.name}" type="${field.type}" value="${esc(value)}"
          ${field.required ? "required" : ""} ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}"` : ""}
          ${field.step ? `step="${field.step}"` : ""} ${field.maxLength ? `maxlength="${field.maxLength}"` : ""} ${field.placeholder ? `placeholder="${field.placeholder}"` : ""}
          ${field.name === "id" && item ? "readonly" : ""}></div>`;
    }).join("");
    $("#entityFields").innerHTML = fields;
    openDialog(entityDialog);
    $("input:not([readonly]),select", $("#entityForm"))?.focus();
  }

  function entityFromForm(form) {
    const data = new FormData(form);
    const number = key => Number(data.get(key));
    if (state.editing.type === "location") {
      return { id: number("id"), latitude: number("latitude"), longitude: number("longitude") };
    }
    if (state.editing.type === "vehicle") {
      return {
        id: number("id"), name: String(data.get("name")).trim(), count: number("count"), cost: number("cost"),
        weightLimit: number("weightLimit"), volumeLimit: number("volumeLimit"),
      };
    }
    return {
      id: number("id"), originLocationId: number("originLocationId"), destinationLocationId: number("destinationLocationId"),
      weightPounds: number("weightPounds"), volumeCubicFeet: number("volumeCubicFeet"),
      pickupWindow: { start: localToApi(data.get("pickupStart")), end: localToApi(data.get("pickupEnd")) },
      deliveryWindow: { start: localToApi(data.get("deliveryStart")), end: localToApi(data.get("deliveryEnd")) },
    };
  }

  function localToApi(value) {
    return value ? `${value}:00` : "";
  }

  async function saveEntity(event) {
    event.preventDefault();
    const { type, id } = state.editing;
    const collection = type === "location" ? "locations" : type === "vehicle" ? "vehicles" : "orders";
    const item = entityFromForm(event.currentTarget);
    const method = id === null ? "POST" : "PUT";
    const path = `/api/projects/${encodeURIComponent(state.project.id)}/${collection}${id === null ? "" : `/${id}`}`;
    const button = $("#entitySubmit");
    setBusy(button, true, "Saving…");
    try {
      await api(path, jsonOptions(method, item));
      await refreshProject();
      closeDialog(entityDialog);
      toast(`${type === "vehicle" ? "Vehicle type" : type[0].toUpperCase() + type.slice(1)} ${id === null ? "added" : "updated"}.`);
    } catch (error) {
      toast(error.message, "error", 5500);
    } finally {
      setBusy(button, false);
    }
  }

  async function removeEntity(type, id) {
    const label = type === "vehicle" ? "vehicle type" : type;
    if (!window.confirm(`Remove ${label} #${id} from this project's current input?`)) return;
    const collection = type === "location" ? "locations" : type === "vehicle" ? "vehicles" : "orders";
    try {
      await api(`/api/projects/${encodeURIComponent(state.project.id)}/${collection}/${id}`, { method: "DELETE" });
      await refreshProject();
      toast(`${label[0].toUpperCase() + label.slice(1)} removed.`);
    } catch (error) {
      toast(error.message, "error", 5500);
    }
  }

  async function refreshProject() {
    state.project = await api(`/api/projects/${encodeURIComponent(state.project.id)}`);
    renderProject();
    renderProjectList();
  }

  async function saveConstraints(event) {
    event.preventDefault();
    const target = event.target;
    const form = new FormData(target);
    const constraints = {};
    for (const field of constraintFields) {
      if (field.type === "checkbox") constraints[field.name] = form.has(field.name);
      else if (field.type === "select") constraints[field.name] = form.get(field.name);
      else constraints[field.name] = Number(form.get(field.name));
    }
    const button = $("button[type=submit]", target);
    setBusy(button, true, "Saving…");
    try {
      await api(`/api/projects/${encodeURIComponent(state.project.id)}/constraints`, jsonOptions("PUT", constraints));
      await refreshProject();
      toast("Planning constraints saved.");
    } catch (error) {
      toast(error.message, "error", 5500);
    } finally {
      setBusy(button, false);
    }
  }

  async function importWorkbook(event) {
    event.preventDefault();
    const file = $("#workbookFile").files?.[0];
    if (!file || !inputState().constraints) return;
    if (!window.confirm("This replaces the current locations, fleet, orders, and constraints. Existing plans remain unchanged. Continue?")) return;
    const body = new FormData();
    body.append("file", file);
    body.append("constraints", new Blob([JSON.stringify(inputState().constraints)], { type: "application/json" }));
    const button = $("button[type=submit]", event.currentTarget);
    setBusy(button, true, "Importing…");
    try {
      await api(`/api/projects/${encodeURIComponent(state.project.id)}/input/excel`, { method: "POST", body });
      await refreshProject();
      toast("Workbook imported. The project input has been replaced.");
    } catch (error) {
      toast(error.message, "error", 6000);
    } finally {
      setBusy(button, false);
    }
  }

  function bindEvents() {
    $("#newProjectButton").addEventListener("click", () => openDialog(projectDialog));
    $("#welcomeCreateButton").addEventListener("click", () => openDialog(projectDialog));
    $("#projectList").addEventListener("click", event => {
      const button = event.target.closest("[data-project-id]");
      if (button) selectProject(button.dataset.projectId);
    });
    $(".tab-bar").addEventListener("click", event => {
      const button = event.target.closest("[data-tab]");
      if (!button) return;
      state.tab = button.dataset.tab;
      $$(".tab-button").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      renderTab();
    });
    $("#tabContent").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "add-location") showEntityForm("location");
      else if (action === "add-vehicle") showEntityForm("vehicle");
      else if (action === "add-order") showEntityForm("order");
      else if (action === "edit-location") showEntityForm("location", button.dataset.id);
      else if (action === "edit-vehicle") showEntityForm("vehicle", button.dataset.id);
      else if (action === "edit-order") showEntityForm("order", button.dataset.id);
      else if (action === "delete-location") removeEntity("location", button.dataset.id);
      else if (action === "delete-vehicle") removeEntity("vehicle", button.dataset.id);
      else if (action === "delete-order") removeEntity("order", button.dataset.id);
    });
    window.addEventListener("routewise:project-created", event => {
      const project = event.detail;
      void loadProjects(project.id).then(() => toast(`Project “${project.name}” created.`));
    });
    $("#entityForm").addEventListener("submit", saveEntity);
    $("#tabContent").addEventListener("submit", event => {
      if (event.target.id === "constraintsForm") saveConstraints(event);
    });
    $("#planButton").addEventListener("click", createPlanning);
    $("#readinessPlanButton").addEventListener("click", createPlanning);
    $("#refreshPlanningsButton").addEventListener("click", loadPlannings);
    $("#planningHistory").addEventListener("click", event => {
      const button = event.target.closest('[data-action="view-result"]');
      if (button) showResult(button.dataset.id);
    });
    $("#downloadExcelButton").addEventListener("click", downloadExcel);
    $("#viewJsonButton").addEventListener("click", () => {
      $("#resultJson").hidden = !$("#resultJson").hidden;
      $("#viewJsonButton").textContent = $("#resultJson").hidden ? "View JSON ↗" : "Hide JSON ↑";
    });
    $("#apiSettingsButton").addEventListener("click", () => {
      $("#apiBaseInput").value = state.apiBase;
      openDialog(apiDialog);
    });
    $("#apiForm").addEventListener("submit", async event => {
      event.preventDefault();
      state.apiBase = $("#apiBaseInput").value.trim().replace(/\/+$/, "");
      localStorage.setItem(API_KEY, state.apiBase);
      closeDialog(apiDialog);
      await loadProjects();
    });
    $$(".close-modal").forEach(button => button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      if (dialog) closeDialog(dialog);
    }));
    [projectDialog, entityDialog, resultDialog, apiDialog].forEach(dialog => {
      dialog.addEventListener("click", event => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  async function initialize() {
    bindEvents();
    await loadProjects();
  }

  initialize();
})();
