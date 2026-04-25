// Financial Sentiment Explorer — frontend-only demo
// Loads two static JSON files and renders four panels.

const LABEL_COLORS = {
  positive: "#1a7f37",
  neutral:  "#6a737d",
  negative: "#cf222e",
};

const state = {
  articles: [],
  prices: {},
  selected: null,
  priceChart: null,
  rubricChart: null,
  filter: { source: "", ticker: "" },
};

async function load() {
  const [articles, prices] = await Promise.all([
    fetch("data/articles.json").then(r => r.json()),
    fetch("data/prices.json").then(r => r.json()),
  ]);
  state.articles = articles.sort((a, b) => a.date.localeCompare(b.date));
  state.prices = prices;
  initFilters();
  renderNewsList();
  renderConfusion("gemini");
  renderSourceHeatmap();
  selectArticle(state.articles[0].id);

  document.getElementById("filter-source").addEventListener("change", e => {
    state.filter.source = e.target.value;
    renderNewsList();
  });
  document.getElementById("filter-ticker").addEventListener("change", e => {
    state.filter.ticker = e.target.value;
    renderNewsList();
  });
  document.getElementById("confusion-model").addEventListener("change", e => {
    renderConfusion(e.target.value);
  });
}

function initFilters() {
  const sources = [...new Set(state.articles.map(a => a.source))].sort();
  const tickers = [...new Set(state.articles.map(a => a.ticker))].sort();
  const sSel = document.getElementById("filter-source");
  const tSel = document.getElementById("filter-ticker");
  for (const s of sources) sSel.add(new Option(s, s));
  for (const t of tickers) tSel.add(new Option(t, t));
}

function filteredArticles() {
  return state.articles.filter(a =>
    (!state.filter.source || a.source === state.filter.source) &&
    (!state.filter.ticker || a.ticker === state.filter.ticker)
  );
}

function renderNewsList() {
  const list = document.getElementById("news-list");
  list.innerHTML = "";
  const items = filteredArticles();
  if (items.length === 0) {
    list.innerHTML = '<li class="empty">No articles match the current filter.</li>';
    return;
  }
  for (const a of items) {
    const li = document.createElement("li");
    li.className = "news-item" + (a.id === state.selected ? " active" : "");
    li.dataset.id = a.id;
    const dot = `<span class="dot" style="background:${LABEL_COLORS[a.human]}"></span>`;
    li.innerHTML = `
      ${dot}
      <div class="news-meta">
        <span class="ticker">${a.ticker}</span>
        <span class="source">${a.source}</span>
        <span class="date">${a.date}</span>
      </div>
      <div class="headline">${a.headline}</div>`;
    li.addEventListener("click", () => selectArticle(a.id));
    list.appendChild(li);
  }
}

function selectArticle(id) {
  state.selected = id;
  const a = state.articles.find(x => x.id === id);
  if (!a) return;
  document.querySelectorAll(".news-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
  renderArticleDetail(a);
  renderPriceChart(a);
}

function pill(label) {
  return `<span class="pill" style="background:${LABEL_COLORS[label]}">${label}</span>`;
}

function renderArticleDetail(a) {
  const root = document.getElementById("article-detail");
  const v = a.vader, f = a.finbert, r = a.roberta, g = a.gemini;
  root.innerHTML = `
    <div class="detail-head">
      <h3>${a.headline}</h3>
      <div class="detail-sub">${a.source} · ${a.ticker} · ${a.date}</div>
      <div class="detail-human">Human label: ${pill(a.human)}</div>
    </div>
    <table class="model-table">
      <thead><tr><th>Model</th><th>Label</th><th>Score / Confidence</th></tr></thead>
      <tbody>
        <tr><td>VADER</td><td>${pill(v.label)}</td><td>compound = ${v.compound.toFixed(3)}</td></tr>
        <tr><td>FinBERT</td><td>${pill(f.label)}</td><td>conf = ${f.confidence.toFixed(2)}</td></tr>
        <tr><td>RoBERTa</td><td>${pill(r.label)}</td><td>conf = ${r.confidence.toFixed(2)}</td></tr>
        <tr><td>Gemini</td><td>${pill(g.label)}</td><td>polarity = ${g.polarity}</td></tr>
      </tbody>
    </table>
    <div class="rubric">
      <h4>Gemini rubric (6 dimensions)</h4>
      <div class="chart-wrap small"><canvas id="rubric-chart"></canvas></div>
    </div>
  `;
  renderRubricChart(g);
}

function renderRubricChart(g) {
  // Normalize each rubric to 0..1 for radar visualization.
  const data = {
    labels: ["Polarity", "Severity", "Confirmation", "Novelty", "Justification", "Calibration"],
    datasets: [{
      label: "Gemini rubric",
      data: [
        (g.polarity + 3) / 6,
        (g.severity - 1) / 4,
        (g.confirmation - 1) / 4,
        g.novelty,
        (g.justification - 1) / 4,
        (g.calibration - 1) / 4,
      ],
      backgroundColor: "rgba(54, 130, 200, 0.25)",
      borderColor: "rgba(54, 130, 200, 1)",
      borderWidth: 2,
      pointBackgroundColor: "rgba(54, 130, 200, 1)",
    }],
  };
  const ctx = document.getElementById("rubric-chart");
  if (state.rubricChart) state.rubricChart.destroy();
  state.rubricChart = new Chart(ctx, {
    type: "radar",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = [
                `polarity ${g.polarity} (-3..+3)`,
                `severity ${g.severity} (1..5)`,
                `confirmation ${g.confirmation} (1..5)`,
                `novelty ${g.novelty} (0..1)`,
                `justification ${g.justification} (1..5)`,
                `calibration ${g.calibration} (1..5)`,
              ];
              return raw[ctx.dataIndex];
            },
          },
        },
      },
    },
  });
}

function renderPriceChart(a) {
  const series = state.prices[a.ticker] || [];
  const idx = series.findIndex(p => p.date === a.date);
  // ±5 trading days window for highlight; full series for context.
  const labels = series.map(p => p.date);
  const closes = series.map(p => p.close);
  const point = idx >= 0 ? { x: labels[idx], y: closes[idx] } : null;

  const bgColors = labels.map((_, i) => {
    if (idx < 0) return "rgba(0,0,0,0)";
    return Math.abs(i - idx) <= 5 ? "rgba(255, 200, 60, 0.18)" : "rgba(0,0,0,0)";
  });

  const ctx = document.getElementById("price-chart");
  if (state.priceChart) state.priceChart.destroy();
  state.priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${a.ticker} close`,
          data: closes,
          borderColor: "#0969da",
          backgroundColor: "rgba(9, 105, 218, 0.08)",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.15,
          fill: true,
        },
        {
          type: "bar",
          label: "±5d window",
          data: bgColors.map((_, i) => Math.abs(i - idx) <= 5 ? Math.max(...closes) * 1.02 : null),
          backgroundColor: "rgba(255, 200, 60, 0.18)",
          borderWidth: 0,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
          order: 99,
        },
        ...(point ? [{
          type: "scatter",
          label: "Article date",
          data: [point],
          backgroundColor: LABEL_COLORS[a.human],
          borderColor: "#000",
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 8,
        }] : []),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { beginAtZero: false, ticks: { font: { size: 10 } } },
      },
      plugins: {
        legend: { labels: { font: { size: 11 }, filter: i => i.text !== "±5d window" } },
        tooltip: { mode: "index", intersect: false },
      },
      interaction: { mode: "nearest", axis: "x", intersect: false },
    },
  });
  document.getElementById("price-caption").textContent =
    `Synthetic ${a.ticker} price. Article on ${a.date} (human label: ${a.human}). ±5 trading-day window highlighted.`;
}

// --- Aggregate panel ---

function renderConfusion(model) {
  const classes = ["negative", "neutral", "positive"];
  const m = Object.fromEntries(classes.map(c => [c, Object.fromEntries(classes.map(c2 => [c2, 0]))]));
  for (const a of state.articles) {
    const pred = a[model].label;
    if (m[a.human] && m[a.human][pred] !== undefined) m[a.human][pred] += 1;
  }
  const tbl = document.getElementById("confusion-table");
  let html = `<thead><tr><th></th><th colspan="3">predicted</th></tr>
              <tr><th>true ↓</th>${classes.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  let total = 0, correct = 0;
  for (const t of classes) {
    html += `<tr><th>${t}</th>`;
    for (const p of classes) {
      const v = m[t][p];
      total += v;
      if (t === p) correct += v;
      const cls = t === p ? "diag" : "";
      html += `<td class="${cls}">${v}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody>`;
  tbl.innerHTML = html;
  const acc = total ? (correct / total) : 0;
  document.getElementById("confusion-stats").textContent =
    `Accuracy on synthetic set (N=${total}): ${(acc * 100).toFixed(1)}%`;
}

function renderSourceHeatmap() {
  const sources = [...new Set(state.articles.map(a => a.source))].sort();
  const buckets = Object.fromEntries(sources.map(s => [s, []]));
  for (const a of state.articles) buckets[a.source].push(a.gemini.polarity);
  const tbl = document.getElementById("source-heatmap");
  let html = "<thead><tr><th>source</th><th>n</th><th>mean polarity</th><th></th></tr></thead><tbody>";
  for (const s of sources) {
    const arr = buckets[s];
    const mean = arr.reduce((x, y) => x + y, 0) / arr.length;
    const t = (mean + 3) / 6; // 0..1
    const r = Math.round(255 * (1 - t) + 26 * t);
    const g = Math.round(34 * (1 - t) + 127 * t);
    const b = Math.round(46 * (1 - t) + 55 * t);
    const bar = `<span class="bar" style="width:${Math.round(t * 100)}%; background:rgb(${r},${g},${b})"></span>`;
    html += `<tr><td>${s}</td><td>${arr.length}</td><td>${mean.toFixed(2)}</td><td class="bar-cell">${bar}</td></tr>`;
  }
  html += "</tbody>";
  tbl.innerHTML = html;
}

load().catch(err => {
  document.body.innerHTML = `<pre style="padding:2em;color:#c00">Failed to load data: ${err}</pre>`;
});
