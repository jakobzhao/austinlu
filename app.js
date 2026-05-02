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

const DATA_PATHS = (typeof window !== "undefined" && window.DATA_PATHS) || {
  articles: "data/articles.json",
  prices: "data/prices.json",
};

function modelHasData(article, key) {
  return article && article[key] && article[key].label != null;
}

function datasetHasModel(articles, key) {
  return articles.some(a => modelHasData(a, key));
}

async function load() {
  const [articles, prices] = await Promise.all([
    fetch(DATA_PATHS.articles).then(r => r.json()),
    fetch(DATA_PATHS.prices).then(r => r.json()),
  ]);
  state.articles = articles.sort((a, b) => a.date.localeCompare(b.date));
  state.prices = prices;
  initFilters();
  renderNewsList();
  initConfusionPicker();
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

function initConfusionPicker() {
  const sel = document.getElementById("confusion-model");
  const available = ["vader", "finbert", "roberta", "gemini"]
    .filter(k => datasetHasModel(state.articles, k));
  if (available.length === 0) {
    sel.innerHTML = '<option value="">— no model predictions in this dataset —</option>';
    sel.disabled = true;
    document.getElementById("confusion-table").innerHTML = "";
    document.getElementById("confusion-stats").textContent =
      "Run scripts/build_real_data.py with --models to populate predictions.";
    return;
  }
  const labels = { vader: "VADER", finbert: "FinBERT", roberta: "RoBERTa", gemini: "Gemini (rubric)" };
  sel.innerHTML = available.map(k => `<option value="${k}">${labels[k]}</option>`).join("");
  const initial = available.includes("gemini") ? "gemini" : available[0];
  sel.value = initial;
  renderConfusion(initial);
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
  renderInterpretation(a);
}

function pill(label) {
  return `<span class="pill" style="background:${LABEL_COLORS[label]}">${label}</span>`;
}

function renderArticleDetail(a) {
  const root = document.getElementById("article-detail");
  const v = a.vader, f = a.finbert, r = a.roberta, g = a.gemini;
  const naCell = '<td colspan="2" class="na">— not computed for this dataset —</td>';
  const sourceLine = a.source_url
    ? `<a href="${a.source_url}" target="_blank" rel="noreferrer">${a.source}</a> · ${a.ticker} · ${a.date}`
    : `${a.source} · ${a.ticker} · ${a.date}`;
  const humanLine = a.human
    ? `<div class="detail-human">Human label: ${pill(a.human)}</div>`
    : "";
  const rubricBlock = (g && g.polarity != null)
    ? `<div class="rubric">
         <h4>Gemini rubric (6 dimensions)</h4>
         <div class="chart-wrap small"><canvas id="rubric-chart"></canvas></div>
       </div>`
    : `<div class="rubric"><h4>Gemini rubric</h4><p class="hint">Rubric scores not available for this dataset.</p></div>`;
  const vaderRow = v && v.label
    ? `<tr><td>VADER</td><td>${pill(v.label)}</td><td>compound = ${v.compound.toFixed(3)}</td></tr>`
    : `<tr><td>VADER</td>${naCell}</tr>`;
  const finbertRow = f && f.label
    ? `<tr><td>FinBERT</td><td>${pill(f.label)}</td><td>conf = ${f.confidence.toFixed(2)}</td></tr>`
    : `<tr><td>FinBERT</td>${naCell}</tr>`;
  const robertaRow = r && r.label
    ? `<tr><td>RoBERTa</td><td>${pill(r.label)}</td><td>conf = ${r.confidence.toFixed(2)}</td></tr>`
    : `<tr><td>RoBERTa</td>${naCell}</tr>`;
  const geminiRow = g && g.label
    ? `<tr><td>Gemini</td><td>${pill(g.label)}</td><td>polarity = ${g.polarity}</td></tr>`
    : `<tr><td>Gemini</td>${naCell}</tr>`;
  root.innerHTML = `
    <div class="detail-head">
      <h3>${a.headline}</h3>
      <div class="detail-sub">${sourceLine}</div>
      ${humanLine}
    </div>
    <table class="model-table">
      <thead><tr><th>Model</th><th>Label</th><th>Score / Confidence</th></tr></thead>
      <tbody>
        ${vaderRow}
        ${finbertRow}
        ${robertaRow}
        ${geminiRow}
      </tbody>
    </table>
    ${rubricBlock}
  `;
  if (g && g.polarity != null) renderRubricChart(g);
  else if (state.rubricChart) { state.rubricChart.destroy(); state.rubricChart = null; }
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

function renderInterpretation(a) {
  const root = document.getElementById("interpretation");
  if (!root) return;
  const g = a.gemini;
  const series = state.prices[a.ticker] || [];
  const idx = series.findIndex(p => p.date === a.date);

  const hasRubric = g && g.polarity != null;
  let rubricLine = "";
  if (hasRubric) {
    const tone =
      g.polarity >= 2 ? "strongly positive" :
      g.polarity === 1 ? "mildly positive" :
      g.polarity === 0 ? "neutral" :
      g.polarity === -1 ? "mildly negative" :
                          "strongly negative";
    const severityWord = g.severity >= 4 ? "high" : g.severity >= 3 ? "moderate" : "low";
    const confirmWord =
      g.confirmation >= 4 ? "well-confirmed" :
      g.confirmation >= 3 ? "partially confirmed" : "speculative";
    const noveltyWord =
      g.novelty >= 0.7 ? "novel" :
      g.novelty >= 0.4 ? "partially anticipated" : "largely priced in";
    rubricLine = `Gemini reads this story as <strong>${tone}</strong> (polarity ${g.polarity}),
      with ${severityWord} event severity (${g.severity}/5),
      ${confirmWord} (${g.confirmation}/5),
      and ${noveltyWord} (novelty ${g.novelty.toFixed(1)}).`;
  } else if (a.vader && a.vader.label) {
    rubricLine = `VADER reads the headline as <strong>${a.vader.label}</strong> (compound ${a.vader.compound.toFixed(2)}).
      Rubric-based Gemini scoring is not available for this dataset.`;
  } else {
    rubricLine = "No model predictions are available for this article yet.";
  }

  let windowText = "no surrounding price data";
  let windowPct = null;
  if (idx >= 0 && series.length > 1) {
    const lo = Math.max(0, idx - 5);
    const hi = Math.min(series.length - 1, idx + 5);
    const start = series[lo].close;
    const end = series[hi].close;
    windowPct = ((end - start) / start) * 100;
    windowText = `${windowPct >= 0 ? "+" : ""}${windowPct.toFixed(1)}%`;
  }

  let trendText = "";
  if (series.length > 1) {
    const first = series[0].close;
    const last = series[series.length - 1].close;
    const trendPct = ((last - first) / first) * 100;
    const trendDir = trendPct > 1 ? "trending up" : trendPct < -1 ? "trending down" : "broadly flat";
    trendText = ` Across the full window shown, ${a.ticker} is ${trendDir} (${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%).`;
  }

  let alignment = "";
  if (windowPct !== null) {
    const sentSign = hasRubric
      ? (g.polarity > 0 ? 1 : g.polarity < 0 ? -1 : 0)
      : (a.vader && a.vader.label === "positive" ? 1 : a.vader && a.vader.label === "negative" ? -1 : 0);
    const moveSign = windowPct > 0.5 ? 1 : windowPct < -0.5 ? -1 : 0;
    if (moveSign === 0) {
      alignment = " The market reaction was muted, suggesting the news may have been anticipated or offset by other factors.";
    } else if (sentSign === 0) {
      alignment = "";
    } else if (moveSign === sentSign) {
      alignment = " Price action aligns with the article's tone — the market appears to confirm the framing.";
    } else {
      alignment = " Price action diverges from the article's tone — investor reaction runs counter to the headline narrative.";
    }
  }

  root.innerHTML = `
    <h4>Interpretation — current ${a.ticker} performance</h4>
    <p>
      ${rubricLine}
      Around the article date, ${a.ticker} moved <strong>${windowText}</strong> over the ±5-day window.${trendText}${alignment}
    </p>
  `;
}

// --- Aggregate panel ---

function renderConfusion(model) {
  const classes = ["negative", "neutral", "positive"];
  const m = Object.fromEntries(classes.map(c => [c, Object.fromEntries(classes.map(c2 => [c2, 0]))]));
  for (const a of state.articles) {
    if (!a.human || !a[model] || !a[model].label) continue;
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
    total
      ? `Accuracy on this dataset (N=${total}): ${(acc * 100).toFixed(1)}%`
      : "No human-labeled rows with this model's predictions in this dataset.";
}

function renderSourceHeatmap() {
  const tbl = document.getElementById("source-heatmap");
  const articlesWithGemini = state.articles.filter(a => a.gemini && a.gemini.polarity != null);
  if (articlesWithGemini.length === 0) {
    const sources = [...new Set(state.articles.map(a => a.source))].sort();
    let body = "";
    for (const s of sources) {
      const arr = state.articles.filter(a => a.source === s && a.vader && a.vader.compound != null).map(a => a.vader.compound);
      if (arr.length === 0) continue;
      const mean = arr.reduce((x, y) => x + y, 0) / arr.length;
      const t = (mean + 1) / 2;
      const r = Math.round(255 * (1 - t) + 26 * t);
      const g = Math.round(34 * (1 - t) + 127 * t);
      const b = Math.round(46 * (1 - t) + 55 * t);
      const bar = `<span class="bar" style="width:${Math.round(t * 100)}%; background:rgb(${r},${g},${b})"></span>`;
      body += `<tr><td>${s}</td><td>${arr.length}</td><td>${mean.toFixed(2)}</td><td class="bar-cell">${bar}</td></tr>`;
    }
    tbl.innerHTML =
      `<thead><tr><th>source</th><th>n</th><th>mean VADER compound</th><th></th></tr></thead><tbody>${body}</tbody>`;
    return;
  }
  const sources = [...new Set(articlesWithGemini.map(a => a.source))].sort();
  const buckets = Object.fromEntries(sources.map(s => [s, []]));
  for (const a of articlesWithGemini) buckets[a.source].push(a.gemini.polarity);
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
