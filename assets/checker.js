// Product page checker front end. Calls /api/check-product-page and renders results next to the
// benchmarks from the latest research study (embedded in #checker-config at build time).
(() => {
  const config = JSON.parse(document.getElementById("checker-config").textContent);
  const form = document.getElementById("checker-form");
  const status = document.getElementById("checker-status");
  const results = document.getElementById("checker-results");
  const button = form.querySelector("button");

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function render(data) {
    const rows = config.checks.map((c) => {
      const pass = Boolean(data[c.group]?.[c.key]);
      return { ...c, pass };
    });
    const passed = rows.filter((r) => r.pass).length;
    const hosts = data.pdp.thirdPartyScriptHosts.length;
    const hostNote =
      hosts > config.medianHosts
        ? `That is more than the median of ${config.medianHosts} in our research. Check that each one still earns its place.`
        : `That is at or below the median of ${config.medianHosts} in our research.`;

    results.innerHTML = `
      <div class="checker-score">
        <div><strong>${passed} of ${rows.length}</strong><span>checks passed</span></div>
        <p>Checked <a href="${escapeHtml(data.checkedUrl)}" rel="noopener nofollow" target="_blank">${escapeHtml(data.checkedUrl.replace(/^https?:\/\//, ""))}</a></p>
      </div>
      <ol class="check-list">
        ${rows
          .map(
            (r) => `<li class="check ${r.pass ? "is-pass" : "is-fail"}">
          <span class="check-icon" aria-hidden="true">${r.pass ? "✓" : "!"}</span>
          <div>
            <strong>${escapeHtml(r.label)}</strong>
            <span class="check-state">${r.pass ? "Found" : "Not found"}</span>
            ${r.bench != null ? `<span class="check-bench">${r.bench}% of ${config.n} fashion brands have this</span>` : ""}
            ${r.pass ? "" : `<p class="check-fix">${escapeHtml(r.fix)}</p>`}
          </div>
        </li>`
          )
          .join("")}
        <li class="check is-info">
          <span class="check-icon" aria-hidden="true">i</span>
          <div>
            <strong>Outside script domains on this page: ${hosts}</strong>
            <p class="check-fix">${escapeHtml(hostNote)}</p>
          </div>
        </li>
      </ol>
      <p class="checker-next">See how these checks play out across 90 brands in <a href="${config.studyUrl}">the research</a>.</p>`;
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new FormData(form).get("url");
    if (!url) return;
    button.disabled = true;
    results.hidden = true;
    status.dataset.state = "";
    status.textContent = "Checking the page. This usually takes a few seconds…";
    try {
      const res = await fetch(`/api/check-product-page?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      status.textContent = "";
      render(data);
      if (typeof window.gtag === "function") window.gtag("event", "tool_check", { tool: "product_page_checker" });
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
