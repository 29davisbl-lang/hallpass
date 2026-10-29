const STORAGE_KEY = "clearpass-requests-v1";
const STUDENT_NAME_KEY = "clearpass-student-name";
const MAX_HISTORY = 50;

const studentNameInput = document.querySelector("#student-name");
const studentStatus = document.querySelector("#student-status");
const teacherQueue = document.querySelector("#teacher-queue");
const teacherHistory = document.querySelector("#teacher-history");
const toast = document.querySelector("#toast");
const pendingBadge = document.querySelector("#pending-badge");
const waitingCount = document.querySelector("#waiting-count");
const outCount = document.querySelector("#out-count");
const queueCaption = document.querySelector("#queue-caption");
const modeHint = document.querySelector("#mode-hint");
const tabs = [...document.querySelectorAll(".mode-tab")];
const panels = {
  student: document.querySelector("#student-panel"),
  teacher: document.querySelector("#teacher-panel"),
};

let requests = [];
let toastTimer;
let storageAvailable = true;

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
}).format(new Date());

try {
  studentNameInput.value = localStorage.getItem(STUDENT_NAME_KEY) || "";
  requests = readRequests();
} catch (error) {
  storageAvailable = false;
  showToast(`Local storage is unavailable. This demo needs browser storage to save pass requests.`);
  console.error("Unable to load ClearPass data:", error);
}

render();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

document.querySelector("#request-button").addEventListener("click", requestPass);
studentNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") requestPass();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const request = requests.find((item) => item.id === button.dataset.id);
  if (!request) {
    showToast("That pass request is no longer available. The list has been refreshed.");
    refreshRequests();
    return;
  }

  if (button.dataset.action === "approve" && request.status === "pending") {
    updateRequest(request.id, "approved");
    showToast(`${request.name}'s pass was approved.`);
  } else if (button.dataset.action === "deny" && request.status === "pending") {
    updateRequest(request.id, "denied");
    showToast(`${request.name}'s request was declined.`);
  } else if (button.dataset.action === "check-in" && request.status === "approved") {
    updateRequest(request.id, "returned");
    showToast("You're checked back in. Welcome back!");
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) refreshRequests();
});

window.setInterval(refreshRequests, 1500);

function readRequests() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];

  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed) || parsed.some((item) =>
    !item || typeof item.id !== "string" || typeof item.name !== "string" ||
    typeof item.status !== "string" || typeof item.createdAt !== "number"
  )) {
    throw new Error("Saved pass data has an invalid format.");
  }
  return parsed;
}

function saveRequests() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests.slice(0, MAX_HISTORY)));
}

function refreshRequests() {
  if (!storageAvailable) return;
  try {
    requests = readRequests();
    render();
  } catch (error) {
    storageAvailable = false;
    showToast("Pass data could not be read. Refresh the page or clear this demo's browser storage.");
    console.error("Unable to refresh ClearPass data:", error);
  }
}

function requestPass() {
  if (!storageAvailable) {
    showToast("Pass requests cannot be saved because browser storage is unavailable.");
    return;
  }

  const name = studentNameInput.value.trim().replace(/\s+/g, " ");
  if (!name) {
    studentNameInput.focus();
    showToast("Enter your name before requesting a pass.");
    return;
  }

  try {
    localStorage.setItem(STUDENT_NAME_KEY, name);
    requests = readRequests();
    const existing = requests.find((item) =>
      item.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
      (item.status === "pending" || item.status === "approved")
    );

    if (existing) {
      render();
      showToast("You already have a pass request in progress.");
      return;
    }

    requests.unshift({
      id: createId(),
      name,
      status: "pending",
      createdAt: Date.now(),
    });
    saveRequests();
    render();
    showToast("Request sent. Wait for your teacher's approval.");
  } catch (error) {
    storageAvailable = false;
    showToast("Your request could not be saved. Check browser storage and try again.");
    console.error("Unable to save pass request:", error);
  }
}

function updateRequest(id, status) {
  if (!storageAvailable) {
    showToast("This update could not be saved because browser storage is unavailable.");
    return;
  }

  try {
    requests = readRequests();
    const index = requests.findIndex((item) => item.id === id);
    if (index === -1) {
      render();
      return;
    }
    requests[index] = { ...requests[index], status, updatedAt: Date.now() };
    saveRequests();
    render();
  } catch (error) {
    storageAvailable = false;
    showToast("That pass update could not be saved. Check browser storage and try again.");
    console.error("Unable to update pass request:", error);
  }
}

function setMode(mode) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  Object.entries(panels).forEach(([panelMode, panel]) => {
    panel.hidden = panelMode !== mode;
  });
  modeHint.textContent = mode === "student" ? "Your pass, all in one place" : "Review requests and check who's out";
  render();
}

function render() {
  const name = studentNameInput.value.trim().replace(/\s+/g, " ");
  const ownRequests = name
    ? requests.filter((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    : [];
  const activeRequest = ownRequests.find((item) => item.status === "pending" || item.status === "approved");
  const latestRequest = activeRequest || ownRequests[0];
  renderStudent(latestRequest);
  renderTeacher();
}

function renderStudent(request) {
  studentStatus.replaceChildren();
  if (!request) return;

  const statuses = {
    pending: {
      title: "Waiting for approval",
      description: "Your teacher has your request. Stay in class until it's approved.",
      icon: "…",
    },
    approved: {
      title: "You're all set",
      description: "Your pass is approved. Remember to check back in when you return.",
      icon: "✓",
    },
    denied: {
      title: "Request declined",
      description: "Your teacher declined this request. You can ask again if you still need a pass.",
      icon: "×",
    },
    returned: {
      title: "Welcome back",
      description: "You're checked in. Request another pass whenever you need one.",
      icon: "✓",
    },
  };
  const content = statuses[request.status];
  if (!content) return;

  const card = document.createElement("div");
  card.className = `status-card ${request.status}`;
  card.append(
    createStatusCopy(content.icon, content.title, content.description),
  );

  if (request.status === "approved") {
    const checkIn = document.createElement("button");
    checkIn.className = "secondary-button";
    checkIn.type = "button";
    checkIn.dataset.action = "check-in";
    checkIn.dataset.id = request.id;
    checkIn.textContent = "I'm back";
    card.append(checkIn);
  }
  studentStatus.append(card);
}

function renderTeacher() {
  const pending = requests.filter((item) => item.status === "pending");
  const out = requests.filter((item) => item.status === "approved");
  const recent = requests.slice(0, 8);

  waitingCount.textContent = String(pending.length);
  outCount.textContent = String(out.length);
  pendingBadge.textContent = String(pending.length);
  pendingBadge.hidden = pending.length === 0;
  queueCaption.textContent = pending.length === 1 ? "1 request" : `${pending.length} requests`;

  teacherQueue.replaceChildren();
  if (!pending.length) {
    teacherQueue.append(emptyState("All caught up — no students are waiting."));
  } else {
    pending.forEach((item) => teacherQueue.append(createRequestRow(item)));
  }

  teacherHistory.replaceChildren();
  if (!recent.length) {
    teacherHistory.append(emptyState("No pass activity yet."));
  } else {
    recent.forEach((item) => teacherHistory.append(createHistoryRow(item)));
  }
}

function createRequestRow(request) {
  const row = document.createElement("div");
  row.className = "request-row-card";

  const person = document.createElement("div");
  person.className = "request-person";
  const avatar = createAvatar(request.name);
  const info = document.createElement("div");
  const name = document.createElement("p");
  name.className = "person-name";
  name.textContent = request.name;
  const detail = document.createElement("p");
  detail.className = "person-detail";
  detail.textContent = `Restroom · ${timeAgo(request.createdAt)}`;
  info.append(name, detail);
  person.append(avatar, info);

  const actions = document.createElement("div");
  actions.className = "request-actions";
  actions.append(
    createActionButton("Approve", "approve", request.id, "approve-button"),
    createActionButton("Decline", "deny", request.id, "deny-button"),
  );
  row.append(person, actions);
  return row;
}

function createHistoryRow(request) {
  const row = document.createElement("div");
  row.className = "history-row";
  const person = document.createElement("div");
  person.className = "history-person";
  person.append(createAvatar(request.name));
  const info = document.createElement("div");
  const name = document.createElement("p");
  name.className = "person-name";
  name.textContent = request.name;
  const detail = document.createElement("p");
  detail.className = "person-detail";
  detail.textContent = `Restroom · ${timeAgo(request.createdAt)}`;
  info.append(name, detail);
  person.append(info);

  const status = document.createElement("span");
  status.className = `history-state ${request.status}`;
  status.textContent = statusLabel(request.status);
  row.append(person, status);
  return row;
}

function createAvatar(name) {
  const avatar = document.createElement("span");
  avatar.className = "person-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return avatar;
}

function createActionButton(label, action, id, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = label;
  return button;
}

function createStatusCopy(icon, title, description) {
  const copy = document.createElement("div");
  copy.className = "status-copy";
  const badge = document.createElement("span");
  badge.className = "status-icon";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = icon;
  const text = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = description;
  text.append(heading, detail);
  copy.append(badge, text);
  return copy;
}

function emptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function statusLabel(status) {
  return {
    pending: "Waiting",
    approved: "Out now",
    returned: "Checked in",
    denied: "Declined",
  }[status] || "Updated";
}

function timeAgo(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
}

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}
