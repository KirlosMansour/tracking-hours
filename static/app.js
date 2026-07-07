(function () {
  "use strict";

  const STATUS_META = {
    overdue: { label: "OVERDUE", color: "var(--hazard)" },
    "due-soon": { label: "DUE THIS WEEK", color: "var(--amber)" },
    upcoming: { label: "DUE THIS MONTH", color: "var(--steel)" },
    scheduled: { label: "SCHEDULED", color: "var(--slate)" },
    complete: { label: "COMPLETE", color: "var(--green)" },
  };

  let projects = [];
  let dates = [];
  let filters = { search: "", project: "all", type: "all", status: "all", showComplete: false };

  const el = (id) => document.getElementById(id);

  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    const A = new Date(a + "T00:00:00");
    const B = new Date(b + "T00:00:00");
    return Math.round((B - A) / 86400000);
  }

  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  }

  function statusOf(d) {
    if (d.complete) return "complete";
    const diff = daysBetween(todayISO(), d.date);
    if (diff < 0) return "overdue";
    if (diff <= 7) return "due-soon";
    if (diff <= 30) return "upcoming";
    return "scheduled";
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }

  function showError(msg) {
    const banner = el("error-banner");
    if (!msg) {
      banner.style.display = "none";
      return;
    }
    banner.textContent = "\u26A0 " + msg;
    banner.style.display = "block";
  }

  async function loadAll() {
    try {
      const [p, d] = await Promise.all([api("/api/projects"), api("/api/dates")]);
      projects = p;
      dates = d;
      showError(null);
      render();
    } catch (e) {
      showError("Could not load data from the server. " + e.message);
    }
  }

  function enrichedDates() {
    const byId = {};
    projects.forEach((p) => (byId[p.id] = p));
    return dates
      .map((d) => ({ ...d, status: statusOf(d), project: byId[d.projectId] }))
      .filter((d) => d.project);
  }

  function filteredDates() {
    return enrichedDates()
      .filter((d) => (filters.showComplete ? true : !d.complete))
      .filter((d) => (filters.project === "all" ? true : String(d.projectId) === String(filters.project)))
      .filter((d) => (filters.type === "all" ? true : d.type === filters.type))
      .filter((d) => (filters.status === "all" ? true : d.status === filters.status))
      .filter((d) =>
        filters.search.trim() === ""
          ? true
          : (d.title + " " + d.project.name + " " + d.project.code + " " + (d.owner || ""))
              .toLowerCase()
              .includes(filters.search.toLowerCase())
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function render() {
    el("tb-project-count").textContent = String(projects.length).padStart(2, "0");
    el("tb-date").textContent = new Date().toLocaleDateString("en-US", {
      month: "2-digit", day: "2-digit", year: "numeric",
    });
    renderStats();
    renderProjectFilterOptions();
    renderProjectList();
    renderDateTable();
    renderLegend();
  }

  function renderStats() {
    const list = enrichedDates();
    const counts = { overdue: 0, "due-soon": 0, upcoming: 0 };
    list.forEach((d) => {
      if (d.complete) return;
      if (d.status === "overdue") counts.overdue++;
      else if (d.status === "due-soon") counts["due-soon"]++;
      else if (d.status === "upcoming") counts.upcoming++;
    });
    const cards = [
      { key: "overdue", label: "OVERDUE", value: counts.overdue, color: "var(--hazard)" },
      { key: "due-soon", label: "DUE THIS WEEK", value: counts["due-soon"], color: "var(--amber)" },
      { key: "upcoming", label: "DUE THIS MONTH", value: counts.upcoming, color: "var(--steel)" },
      { key: "all", label: "ACTIVE PROJECTS", value: projects.length, color: "var(--ink)" },
    ];
    el("stat-row").innerHTML = cards
      .map((c) => {
        const active = filters.status === c.key;
        return `
        <button class="stat-card ${active && c.key !== "all" ? "active" : ""}" data-status="${c.key}" style="--card-color:${c.color}">
          <span class="bar" style="background:${c.color}"></span>
          <div class="stat-label">${c.label}</div>
          <div class="stat-value" style="color:${c.value > 0 && c.key !== "all" ? c.color : "var(--ink)"}">${c.value}</div>
        </button>`;
      })
      .join("");
    el("stat-row").querySelectorAll(".stat-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.status;
        filters.status = key === "all" ? "all" : filters.status === key ? "all" : key;
        el("filter-status").value = filters.status;
        render();
      });
    });
  }

  function renderProjectFilterOptions() {
    const sel = el("filter-project");
    const current = sel.value || "all";
    sel.innerHTML = '<option value="all">All projects</option>' +
      projects.map((p) => `<option value="${p.id}">${p.code}</option>`).join("");
    sel.value = projects.some((p) => String(p.id) === current) ? current : "all";
  }

  function renderProjectList() {
    const container = el("project-list");
    if (projects.length === 0) {
      container.innerHTML = `<div class="empty-state">NO PROJECTS YET</div>`;
      return;
    }
    const list = enrichedDates();
    container.innerHTML = projects
      .map((p) => {
        const open = list.filter((d) => d.projectId === p.id && !d.complete);
        const overdue = open.filter((d) => d.status === "overdue").length;
        const active = String(filters.project) === String(p.id);
        return `
        <div class="project-card ${active ? "active" : ""}" data-id="${p.id}">
          <div class="project-card-top">
            <div>
              <div class="project-name">${escapeHtml(p.name)}</div>
              <div class="project-code">${escapeHtml(p.code)} · ${escapeHtml(p.phase)}</div>
            </div>
            <div class="row-actions" onclick="event.stopPropagation()">
              <button class="icon-btn edit-project" data-id="${p.id}" title="Edit">&#9998;</button>
              <button class="icon-btn delete-project" data-id="${p.id}" title="Delete">&#128465;</button>
            </div>
          </div>
          <div class="project-stats">
            <span class="open">${open.length} open</span>
            ${overdue > 0 ? `<span class="overdue">${overdue} overdue</span>` : ""}
          </div>
        </div>`;
      })
      .join("");

    container.querySelectorAll(".project-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        filters.project = String(filters.project) === String(id) ? "all" : id;
        el("filter-project").value = filters.project;
        render();
      });
    });
    container.querySelectorAll(".edit-project").forEach((btn) => {
      btn.addEventListener("click", () => openProjectModal(projects.find((p) => String(p.id) === btn.dataset.id)));
    });
    container.querySelectorAll(".delete-project").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this project and all its key dates?")) return;
        try {
          await api(`/api/projects/${btn.dataset.id}`, { method: "DELETE" });
          await loadAll();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  }

  function renderDateTable() {
    const rows = filteredDates();
    const container = el("date-table");
    if (rows.length === 0) {
      container.innerHTML = `<div class="empty-state">NO DATES MATCH THE CURRENT FILTERS.</div>`;
      return;
    }
    container.innerHTML = rows
      .map((row) => {
        const meta = STATUS_META[row.complete ? "complete" : row.status];
        const diff = daysBetween(todayISO(), row.date);
        const rel = row.complete ? "DONE" : diff === 0 ? "TODAY" : diff > 0 ? `IN ${diff}D` : `${Math.abs(diff)}D LATE`;
        return `
        <div class="date-row ${row.complete ? "complete" : ""}">
          <button class="date-status-btn toggle-date" data-id="${row.id}" title="Toggle complete" style="color:${meta.color}">&#9679;</button>
          <div class="date-main">
            <div class="date-title ${row.complete ? "strike" : ""}">${escapeHtml(row.title)}</div>
            <div class="date-meta">
              <span>${escapeHtml(row.project.code)}</span><span>·</span>
              <span>${row.type.toUpperCase()}</span>
              ${row.owner ? `<span>·</span><span>${escapeHtml(row.owner)}</span>` : ""}
            </div>
          </div>
          <div class="date-when">
            <div class="d">${fmtDate(row.date)}</div>
            <div class="rel" style="color:${meta.color}">${rel}</div>
          </div>
          <div class="row-actions">
            <button class="icon-btn edit-date" data-id="${row.id}" title="Edit">&#9998;</button>
            <button class="icon-btn delete-date" data-id="${row.id}" title="Delete">&#128465;</button>
          </div>
        </div>`;
      })
      .join("");

    container.querySelectorAll(".toggle-date").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/dates/${btn.dataset.id}/toggle`, { method: "PATCH" });
          await loadAll();
        } catch (e) {
          showError(e.message);
        }
      });
    });
    container.querySelectorAll(".edit-date").forEach((btn) => {
      btn.addEventListener("click", () => openDateModal(dates.find((d) => String(d.id) === btn.dataset.id)));
    });
    container.querySelectorAll(".delete-date").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this key date?")) return;
        try {
          await api(`/api/dates/${btn.dataset.id}`, { method: "DELETE" });
          await loadAll();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  }

  function renderLegend() {
    el("legend").innerHTML =
      `<span class="legend-title">LEGEND</span>` +
      Object.entries(STATUS_META)
        .map(([k, v]) => `<span class="legend-item"><span class="legend-swatch" style="background:${v.color}"></span>${v.label}</span>`)
        .join("");
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  // ---------- Modals ----------

  function closeModal() {
    el("modal-root").innerHTML = "";
  }

  function openProjectModal(project) {
    const isEdit = !!project;
    const phases = window.APP_CONFIG.phases;
    el("modal-root").innerHTML = `
      <div class="modal-overlay">
        <form class="modal-box" id="project-form">
          <div class="modal-head">
            <div class="modal-title">${isEdit ? "EDIT PROJECT" : "NEW PROJECT"}</div>
            <button type="button" class="modal-close" id="close-project-modal">&times;</button>
          </div>
          <div class="modal-body">
            <label class="field-label">PROJECT NAME</label>
            <input class="field-input" name="name" value="${isEdit ? escapeHtml(project.name) : ""}" placeholder="e.g. Sunbelt BESS" required>
            <label class="field-label">SITE / PROJECT CODE</label>
            <input class="field-input" name="code" value="${isEdit ? escapeHtml(project.code) : ""}" placeholder="e.g. SUN-BESS" required>
            <label class="field-label">PHASE</label>
            <select class="field-input" name="phase">
              ${phases.map((p) => `<option value="${p}" ${isEdit && project.phase === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
            <div class="modal-actions">
              <button type="button" class="btn-ghost" id="cancel-project-modal">CANCEL</button>
              <button type="submit" class="btn-primary">SAVE</button>
            </div>
          </div>
        </form>
      </div>`;
    el("close-project-modal").addEventListener("click", closeModal);
    el("cancel-project-modal").addEventListener("click", closeModal);
    el("project-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = { name: fd.get("name"), code: fd.get("code"), phase: fd.get("phase") };
      try {
        if (isEdit) await api(`/api/projects/${project.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
        closeModal();
        await loadAll();
      } catch (err) {
        showError(err.message);
      }
    });
  }

  function openDateModal(dateItem) {
    const isEdit = !!dateItem;
    const types = window.APP_CONFIG.types;
    const defaultProjectId = filters.project !== "all" ? filters.project : projects[0] ? projects[0].id : "";
    el("modal-root").innerHTML = `
      <div class="modal-overlay">
        <form class="modal-box" id="date-form">
          <div class="modal-head">
            <div class="modal-title">${isEdit ? "EDIT KEY DATE" : "ADD KEY DATE"}</div>
            <button type="button" class="modal-close" id="close-date-modal">&times;</button>
          </div>
          <div class="modal-body">
            <label class="field-label">TITLE</label>
            <input class="field-input" name="title" value="${isEdit ? escapeHtml(dateItem.title) : ""}" placeholder="e.g. IFC Drawing Package Issue" required>
            <label class="field-label">PROJECT</label>
            <select class="field-input" name="projectId" required>
              ${projects.map((p) => `<option value="${p.id}" ${(isEdit ? dateItem.projectId : defaultProjectId) == p.id ? "selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.code)})</option>`).join("")}
            </select>
            <div class="field-row">
              <div>
                <label class="field-label">TYPE</label>
                <select class="field-input" name="type">
                  ${types.map((t) => `<option value="${t}" ${isEdit && dateItem.type === t ? "selected" : ""}>${t}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="field-label">DUE DATE</label>
                <input class="field-input" type="date" name="date" value="${isEdit ? dateItem.date : todayISO()}" required>
              </div>
            </div>
            <label class="field-label">OWNER (OPTIONAL)</label>
            <input class="field-input" name="owner" value="${isEdit ? escapeHtml(dateItem.owner) : ""}" placeholder="e.g. Kirlos">
            <label class="field-label">NOTES (OPTIONAL)</label>
            <textarea class="field-input" name="notes" style="min-height:60px;resize:vertical;">${isEdit ? escapeHtml(dateItem.notes) : ""}</textarea>
            <div class="modal-actions">
              <button type="button" class="btn-ghost" id="cancel-date-modal">CANCEL</button>
              <button type="submit" class="btn-primary">SAVE</button>
            </div>
          </div>
        </form>
      </div>`;
    el("close-date-modal").addEventListener("click", closeModal);
    el("cancel-date-modal").addEventListener("click", closeModal);
    el("date-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        title: fd.get("title"),
        projectId: parseInt(fd.get("projectId"), 10),
        type: fd.get("type"),
        date: fd.get("date"),
        owner: fd.get("owner"),
        notes: fd.get("notes"),
      };
      try {
        if (isEdit) await api(`/api/dates/${dateItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        else await api("/api/dates", { method: "POST", body: JSON.stringify(payload) });
        closeModal();
        await loadAll();
      } catch (err) {
        showError(err.message);
      }
    });
  }

  // ---------- Wire up static controls ----------

  document.addEventListener("DOMContentLoaded", () => {
    el("add-project-btn").addEventListener("click", () => openProjectModal(null));
    el("add-date-btn").addEventListener("click", () => openDateModal(null));
    el("search-input").addEventListener("input", (e) => { filters.search = e.target.value; renderDateTable(); });
    el("filter-project").addEventListener("change", (e) => { filters.project = e.target.value; render(); });
    el("filter-type").addEventListener("change", (e) => { filters.type = e.target.value; renderDateTable(); });
    el("filter-status").addEventListener("change", (e) => { filters.status = e.target.value; render(); });
    el("show-complete").addEventListener("change", (e) => { filters.showComplete = e.target.checked; renderDateTable(); });
    el("reload-btn").addEventListener("click", async () => {
      const btn = el("reload-btn");
      btn.classList.add("spinning");
      await loadAll();
      btn.classList.remove("spinning");
    });

    loadAll();
  });
})();
