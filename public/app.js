const form = document.getElementById("search-form");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function fmtHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function itinerarySummary(itin) {
  const route = itin.segments.map((s) => s.from).concat(itin.segments[itin.segments.length - 1].to).join(" → ");
  const stopsLabel = itin.stops === 0 ? "nonstop" : `${itin.stops} stop${itin.stops > 1 ? "s" : ""}`;
  return `${route} · ${fmtHours(itin.durationHours)} · ${stopsLabel}`;
}

function render(data) {
  if (!data.results || data.results.length === 0) {
    resultsEl.innerHTML = "<p>No flights found for that route/date.</p>";
    return;
  }

  const cheapestPrice = Math.min(...data.results.map((r) => r.price));
  const fastestHours = Math.min(...data.results.map((r) => r.totalHours));
  const bestValue = data.results[0]; // already sorted by effectiveCost

  const rows = data.results
    .slice(0, 20)
    .map((r) => {
      const badges = [];
      if (r === bestValue) badges.push('<span class="badge value">Best Value</span>');
      if (r.price === cheapestPrice) badges.push('<span class="badge cheap">Cheapest</span>');
      if (r.totalHours === fastestHours) badges.push('<span class="badge fast">Fastest</span>');

      const segHtml = r.itineraries.map((i) => `<div class="segments">${itinerarySummary(i)}</div>`).join("");

      return `
        <tr class="${r === bestValue ? "best-value" : ""}">
          <td>${badges.join(" ")}</td>
          <td>$${r.price.toFixed(0)}</td>
          <td>${fmtHours(r.totalHours)}</td>
          <td>${r.maxStops === 0 ? "Nonstop" : `${r.maxStops} stop${r.maxStops > 1 ? "s" : ""}`}</td>
          <td>+${fmtHours(r.extraHours)} vs fastest</td>
          <td>+$${r.extraCostVsCheapest.toFixed(0)} vs cheapest</td>
          <td>$${r.effectiveCost.toFixed(0)}</td>
          <td>${r.carriers.join(", ")}</td>
        </tr>
        <tr class="${r === bestValue ? "best-value" : ""}">
          <td colspan="8">${segHtml}</td>
        </tr>
      `;
    })
    .join("");

  resultsEl.innerHTML = `
    ${data.mock ? '<p class="mock-banner">Showing sample data — add your RapidAPI key to <code>flight-finder/.env</code> for live prices.</p>' : ""}
    <p style="color: var(--muted); margin-bottom: 8px;">
      Effective cost = ticket price + (travel time × $${data.hourlyRate}/hr). Sorted best value first.
    </p>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Price</th>
          <th>Travel Time</th>
          <th>Stops</th>
          <th>Time Cost</th>
          <th>Price Diff</th>
          <th>Effective Cost</th>
          <th>Airline(s)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Searching flights…";
  statusEl.className = "";
  resultsEl.innerHTML = "";

  const params = new URLSearchParams({
    origin: document.getElementById("origin").value.trim(),
    destination: document.getElementById("destination").value.trim(),
    departDate: document.getElementById("departDate").value,
    adults: document.getElementById("adults").value || "1",
    hourlyValue: document.getElementById("hourlyValue").value || "0",
    nonStop: document.getElementById("nonStop").checked ? "true" : "false",
  });
  const returnDate = document.getElementById("returnDate").value;
  if (returnDate) params.set("returnDate", returnDate);

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || "Search failed.";
      statusEl.className = "error";
      return;
    }
    statusEl.textContent = `Found ${data.results.length} option(s).`;
    render(data);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.className = "error";
  }
});
