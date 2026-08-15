(() => {
  const menuButton = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");

  if (menuButton && menu) {
    menuButton.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
      menuButton.textContent = open ? "×" : "☰";
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        menu.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "打开导航菜单");
        menuButton.textContent = "☰";
      }
    });
  }

  document.querySelectorAll("[data-faq-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      if (!panel) return;
      const nextState = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(nextState));
      panel.hidden = !nextState;
    });
  });

  document.querySelectorAll("[data-download]").forEach((link) => {
    link.addEventListener("click", () => {
      const detail = {
        browser: link.dataset.download,
        page: location.pathname,
        href: link.href,
      };
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "extension_download_click", ...detail });
      window.dispatchEvent(new CustomEvent("ds2w:download", { detail }));
    });
  });
})();
