// Merchants Digest — small progressive enhancements. Everything works without this file except
// newsletter sign-up (which needs fetch) and archive filtering (which falls back to topic pages).
(() => {
  const SUBSCRIBE_URL =
    "https://script.google.com/macros/s/AKfycbyNhbx8owb3PQXtCWy3FPgwdevB0ajKWwKoN0xquG7J5cp52ia3Tr5LkCVTp7JRn8CB6A/exec";
  const SUBSCRIBE_TOKEN = "md_7fT9pL3xQ2vR8nK6Zb5yW1uC4eD0aH9s";

  // Newsletter sign-up (same Apps Script endpoint and payload as the original site).
  document.querySelectorAll("form.js-subscribe").forEach((form) => {
    const message = form.querySelector(".form-message");
    const button = form.querySelector("button");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = new FormData(form).get("email");
      if (!email) return;
      button.disabled = true;
      const payload = new URLSearchParams({
        email,
        page: window.location.pathname || "/",
        token: SUBSCRIBE_TOKEN
      });
      fetch(SUBSCRIBE_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString()
      })
        .then(() => {
          message.dataset.state = "ok";
          message.textContent = "You're in. New articles will arrive in your inbox.";
          form.reset();
          if (typeof window.gtag === "function") window.gtag("event", "sign_up", { method: "newsletter", form: form.dataset.source });
        })
        .catch(() => {
          message.dataset.state = "error";
          message.textContent = "That didn't go through. Please try again in a moment.";
        })
        .finally(() => {
          button.disabled = false;
        });
    });
  });

  // Archive topic filter (buttons carry data-filter; cards carry data-topic).
  const filterBar = document.querySelector("[data-filter-bar]");
  if (filterBar) {
    const buttons = [...filterBar.querySelectorAll("[data-filter]")];
    const cards = [...document.querySelectorAll("[data-topic]")];
    const count = document.querySelector("[data-filter-count]");
    const apply = (topic) => {
      let shown = 0;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === topic)));
      cards.forEach((card) => {
        const visible = topic === "all" || card.dataset.topic === topic;
        card.hidden = !visible;
        if (visible) shown++;
      });
      if (count) count.textContent = `${shown} article${shown === 1 ? "" : "s"}`;
    };
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        const topic = b.dataset.filter;
        history.replaceState(null, "", topic === "all" ? location.pathname : `#${topic}`);
        apply(topic);
      })
    );
    const initial = location.hash.slice(1);
    apply(buttons.some((b) => b.dataset.filter === initial) ? initial : "all");
  }

  // Reading progress + active table-of-contents entry.
  const progress = document.querySelector(".progress");
  const article = document.querySelector(".prose");
  if (progress && article) {
    const update = () => {
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const ratio = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      progress.style.transform = `scaleX(${ratio})`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          tocLinks.forEach((a) => a.classList.remove("is-active"));
          byId.get(entry.target.id)?.classList.add("is-active");
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    byId.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    // Desktop shows the TOC open; small screens start collapsed.
    const details = document.querySelector(".toc details");
    if (details && window.matchMedia("(min-width: 1080px)").matches) details.open = true;
  }

  // Copy-link button.
  document.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyLink);
        const label = button.textContent;
        button.textContent = "Link copied";
        setTimeout(() => (button.textContent = label), 1800);
      } catch {
        window.prompt("Copy this link", button.dataset.copyLink);
      }
    });
  });
})();
