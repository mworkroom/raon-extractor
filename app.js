const STORAGE_KEY = "half-price-goblin:v1";
const MONTHLY_LIMIT = 30000;

const cards = [
  { id: "me", name: "J 카드" },
  { id: "mom", name: "H 카드" },
];

const categories = {
  coffee: { label: "커피", rate: 0.5 },
  movie: { label: "영화", rate: 0.5 },
};

const state = {
  selectedCardId: "me",
  selectedCategory: "movie",
  showCanceled: true,
  expandedCardIds: new Set(),
  data: loadData(),
};

const moneyFormat = new Intl.NumberFormat("ko-KR");

const els = {
  currentMonthLabel: document.querySelector("#currentMonthLabel"),
  saveStatus: document.querySelector("#saveStatus"),
  summaryGrid: document.querySelector("#summaryGrid"),
  entryForm: document.querySelector("#entryForm"),
  movieTitleField: document.querySelector("#movieTitleField"),
  movieTitleInput: document.querySelector("#movieTitleInput"),
  dateInput: document.querySelector("#dateInput"),
  amountInput: document.querySelector("#amountInput"),
  discountPreview: document.querySelector("#discountPreview"),
  limitPreview: document.querySelector("#limitPreview"),
  historyList: document.querySelector("#historyList"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  resetButton: document.querySelector("#resetButton"),
};

init();

function init() {
  els.dateInput.value = todayInputValue();
  if (els.currentMonthLabel) {
    els.currentMonthLabel.textContent = monthLabel(currentMonthKey());
  }
  bindEvents();
  updateMovieTitleField();
  render();
}

function bindEvents() {
  document.querySelectorAll("[data-card]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCardId = button.dataset.card;
      updateSegments();
      updatePreview();
    });
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category;
      updateSegments();
      updateMovieTitleField();
      updatePreview();
    });
  });

  els.amountInput.addEventListener("input", updatePreview);
  els.dateInput.addEventListener("change", updatePreview);

  els.entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTransaction();
  });

  els.summaryGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) {
      if (button.dataset.action === "delete") {
        deleteTransaction(button.dataset.id);
        return;
      }
      if (button.dataset.action === "toggleCanceled") {
        state.showCanceled = !state.showCanceled;
        renderSummary();
        return;
      }
      setTransactionStatus(button.dataset.id, button.dataset.action);
      return;
    }

    const cardButton = event.target.closest("[data-card-toggle]");
    if (!cardButton) return;
    toggleCardRecords(cardButton.dataset.cardToggle);
  });

  els.exportButton.addEventListener("click", exportData);
  els.importInput.addEventListener("click", () => {
    els.importInput.value = "";
  });
  els.importInput.addEventListener("change", importData);
  els.resetButton.addEventListener("click", resetData);
}

function loadData() {
  const fallback = {
    version: 2,
    settings: {
      monthlyLimit: MONTHLY_LIMIT,
      discountRate: 0.5,
      cards,
    },
    transactions: [],
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.transactions)) return fallback;
    return {
      ...fallback,
      ...parsed,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return fallback;
  }
}

function saveData(message = "저장됨") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  showStatus(message);
}

function showStatus(message) {
  els.saveStatus.textContent = message;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    els.saveStatus.textContent = "";
  }, 1700);
}

function addTransaction() {
  const amount = Number(els.amountInput.value);
  const date = els.dateInput.value || todayInputValue();
  const movieTitle = els.movieTitleInput.value.trim();

  if (state.selectedCategory === "movie" && !movieTitle) {
    showStatus("영화 제목 확인");
    els.movieTitleInput.focus();
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showStatus("금액 확인");
    els.amountInput.focus();
    return;
  }

  const discountAmount = calculateDiscount(amount, state.selectedCategory);
  state.data.transactions.unshift({
    id: makeId(),
    cardId: state.selectedCardId,
    category: state.selectedCategory,
    movieTitle: state.selectedCategory === "movie" ? movieTitle : "",
    amount: Math.round(amount),
    discountAmount,
    date,
    monthKey: toMonthKey(date),
    status: "active",
    createdAt: new Date().toISOString(),
    canceledAt: null,
    restoredAt: null,
  });

  els.movieTitleInput.value = "";
  els.amountInput.value = "";
  saveData("추가됨");
  render();
  els.amountInput.focus();
}

function setTransactionStatus(id, action) {
  const transaction = state.data.transactions.find((item) => item.id === id);
  if (!transaction) return;

  if (action === "cancel") {
    transaction.status = "canceled";
    transaction.canceledAt = new Date().toISOString();
  }

  if (action === "restore") {
    transaction.status = "active";
    transaction.restoredAt = new Date().toISOString();
  }

  saveData(action === "cancel" ? "취소됨" : "복구됨");
  render();
}

function deleteTransaction(id) {
  const transaction = state.data.transactions.find((item) => item.id === id);
  if (!transaction) return;

  if (!window.confirm("이 기록을 완전히 삭제할까요?")) return;

  state.data.transactions = state.data.transactions.filter((item) => item.id !== id);
  saveData("삭제됨");
  render();
}

function toggleCardRecords(cardId) {
  if (state.expandedCardIds.has(cardId)) {
    state.expandedCardIds.delete(cardId);
  } else {
    state.expandedCardIds.add(cardId);
  }
  renderSummary();
}

function render() {
  updateSegments();
  updatePreview();
  renderSummary();
  renderHistory();
}

function updateSegments() {
  document.querySelectorAll("[data-card]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.card === state.selectedCardId);
  });

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === state.selectedCategory);
  });
}

function updateMovieTitleField() {
  const isMovie = state.selectedCategory === "movie";
  els.movieTitleField.hidden = !isMovie;
  els.movieTitleInput.required = isMovie;
  els.movieTitleInput.disabled = !isMovie;
}

function updatePreview() {
  const amount = Number(els.amountInput.value) || 0;
  const discount = calculateDiscount(amount, state.selectedCategory);
  const date = els.dateInput.value || todayInputValue();
  const monthKey = toMonthKey(date);
  const used = getUsedAmount(state.selectedCardId, monthKey);
  const afterUsed = used + discount;
  const remaining = MONTHLY_LIMIT - afterUsed;

  els.discountPreview.textContent = `${formatMoney(discount)}원`;
  els.limitPreview.classList.toggle("is-over", remaining < 0);
  els.limitPreview.innerHTML =
    remaining < 0
      ? `<span>저장 후</span><strong>한도 초과 ${formatMoney(Math.abs(remaining))}원</strong>`
      : `<span>저장 후 잔여</span><strong>${formatMoney(remaining)}원</strong>`;
}

function renderSummary() {
  const monthKey = currentMonthKey();
  els.summaryGrid.innerHTML = cards
    .map((card) => {
      const used = getUsedAmount(card.id, monthKey);
      const remaining = MONTHLY_LIMIT - used;
      const percent = Math.round((used / MONTHLY_LIMIT) * 100);
      const remainingPercent = Math.max(0, Math.min(100, Math.round((remaining / MONTHLY_LIMIT) * 100)));
      const isOver = remaining < 0;
      const usedStatus = `${formatMoney(used)}원 사용`;
      const mainStatus = isOver
        ? `${formatMoney(Math.abs(remaining))}원 초과`
        : `${formatMoney(remaining)}원 남음`;
      const isExpanded = state.expandedCardIds.has(card.id);

      return `
        <article class="limit-card ${isOver ? "is-over" : ""}">
          <button class="limit-toggle" type="button" data-card-toggle="${card.id}" aria-expanded="${isExpanded}">
            <span class="limit-top">
              <span class="card-name">${card.name}</span>
              <span class="card-status ${isOver ? "is-over" : ""}">${usedStatus}</span>
            </span>
            <span class="money-line">
              <strong class="available-money ${isOver ? "is-over" : ""}">${mainStatus}</strong>
            </span>
            <span class="progress-track" aria-hidden="true">
              <span class="progress-bar" style="width: ${remainingPercent}%"></span>
            </span>
            
          </button>
          ${isExpanded ? renderCardRecords(card.id) : ""}
        </article>
      `;
    })
    .join("");
}

function renderCardRecords(cardId) {
  const monthKey = currentMonthKey();
  const currentCard = cards.find((candidate) => candidate.id === cardId);
  const records = state.data.transactions
    .filter((item) => item.cardId === cardId)
    .filter((item) => item.monthKey === monthKey)
    .filter((item) => state.showCanceled || item.status !== "canceled")
    .sort(sortTransactionsByDate)
    .slice(0, 30);

  const toolbar = `
    <div class="card-records-toolbar">
      <strong>이번 달 기록</strong>
      <button class="ghost-button ${state.showCanceled ? "is-active" : ""}" type="button" data-action="toggleCanceled">
        ${state.showCanceled ? "취소 내역 숨기기" : "취소 내역 보이기"}
      </button>
    </div>
  `;

  if (!records.length) {
    return `
      <div class="card-records-panel">
        ${toolbar}
        <div class="empty-state">${currentCard ? currentCard.name : "카드"} 기록이 없습니다</div>
      </div>
    `;
  }

  const recordItems = records
    .map((item) => {
      const category = categories[item.category] || categories.coffee;
      const isCanceled = item.status === "canceled";
      const action = isCanceled ? "restore" : "cancel";
      const actionLabel = isCanceled ? "복구" : "취소";

      return `
        <article class="record-item ${isCanceled ? "is-canceled" : ""}">
          <div class="record-main">
            <div class="record-title">
              <span class="category-dot ${item.category}"></span>
              <span>${shortDateLabel(item.date)}</span>
              <span>${category.label}</span>
              ${item.category === "movie" && item.movieTitle ? `<span class="movie-title">${escapeHtml(item.movieTitle)}</span>` : ""}
              ${isCanceled ? "<span>취소됨</span>" : ""}
            </div>
            <div class="record-meta">
              ${formatMoney(item.amount)}원 → 할인 ${formatMoney(item.discountAmount)}원
            </div>
          </div>
          <div class="record-actions">
            <button class="record-action ${isCanceled ? "restore" : ""}" type="button" data-id="${item.id}" data-action="${action}">
              ${actionLabel}
            </button>
            <button class="record-action delete" type="button" data-id="${item.id}" data-action="delete">
              삭제
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <div class="card-records-panel">
      ${toolbar}
      <div class="records-list">${recordItems}</div>
    </div>
  `;
}

function renderHistory() {
  const months = recentMonthKeys(3);
  els.historyList.innerHTML = months
    .map((monthKey) => {
      const cardRows = cards
        .map((card) => {
          const used = getUsedAmount(card.id, monthKey);
          const percent = Math.round((used / MONTHLY_LIMIT) * 100);
          return `
            <div class="mini-row">
              <span class="mini-name">${card.name.replace(" 카드", "")}</span>
              <span class="mini-used-frame">${formatMoney(used)}원</span>
              <span class="mini-percent">${percent}%</span>
            </div>
          `;
        })
        .join("");

      return `
        <article class="history-row">
          <div class="history-month">${monthShortLabel(monthKey)}</div>
          <div class="history-cards">${cardRows}</div>
        </article>
      `;
    })
    .join("");
}

function exportData() {
  const payload = JSON.stringify(state.data, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `raon-extractor-backup-${todayInputValue()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus("내보냄");
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  showStatus("백업 읽는 중");

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const text = String(reader.result || "").replace(/^\uFEFF/, "").trim();
      if (!text) throw new Error("빈 파일입니다.");

      const parsed = JSON.parse(text);
      const transactions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.transactions)
          ? parsed.transactions
          : Array.isArray(parsed.data?.transactions)
            ? parsed.data.transactions
            : null;

      if (!transactions) {
        throw new Error("transactions 목록을 찾을 수 없습니다.");
      }

      if (!window.confirm(`${transactions.length}개의 기록을 가져와 현재 데이터를 교체할까요?`)) {
        showStatus("가져오기 취소");
        return;
      }

      state.data = {
        version: 2,
        settings: {
          monthlyLimit: Number(parsed.settings?.monthlyLimit) || MONTHLY_LIMIT,
          discountRate: Number(parsed.settings?.discountRate) || 0.5,
          cards,
        },
        transactions,
      };
      saveData(`${transactions.length}개 가져옴`);
      render();
    } catch (error) {
      console.error("Backup import failed:", error);
      showStatus("가져오기 실패");
      window.alert(`가져올 수 없는 파일입니다.\n${error.message}`);
    } finally {
      els.importInput.value = "";
    }
  });

  reader.addEventListener("error", () => {
    console.error("Backup file read failed:", reader.error);
    showStatus("파일 읽기 실패");
    window.alert("백업 파일을 읽지 못했습니다.");
    els.importInput.value = "";
  });

  reader.readAsText(file, "UTF-8");
}

function resetData() {
  if (!window.confirm("모든 기록을 삭제할까요?")) return;
  state.data = {
    version: 2,
    settings: { monthlyLimit: MONTHLY_LIMIT, discountRate: 0.5, cards },
    transactions: [],
  };
  saveData("초기화됨");
  render();
}

function getUsedAmount(cardId, monthKey) {
  return state.data.transactions
    .filter((item) => item.cardId === cardId)
    .filter((item) => item.monthKey === monthKey)
    .filter((item) => item.status !== "canceled")
    .reduce((total, item) => total + Number(item.discountAmount || 0), 0);
}

function sortTransactionsByDate(a, b) {
  return a.date.localeCompare(b.date);
}

function calculateDiscount(amount, categoryKey) {
  const category = categories[categoryKey] || categories.coffee;
  return Math.round(Number(amount || 0) * category.rate);
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthKey() {
  return toMonthKey(todayInputValue());
}

function toMonthKey(dateValue) {
  return String(dateValue).slice(0, 7);
}

function recentMonthKeys(count) {
  const [year, month] = currentMonthKey().split("-").map(Number);
  const result = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

function monthShortLabel(monthKey) {
  return `${Number(monthKey.slice(5, 7))}월`;
}

function shortDateLabel(dateValue) {
  const [, month, day] = dateValue.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatMoney(value) {
  return moneyFormat.format(Math.round(Number(value || 0)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `txn_${window.crypto.randomUUID()}`;
  }
  return `txn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
