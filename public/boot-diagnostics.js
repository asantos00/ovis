(function () {
  var failures = [];
  function text(value) {
    try { return String(value); } catch (_) { return "Unknown error"; }
  }
  window.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target !== window) {
      failures.push("Failed to load " + (target.src || target.href || target.tagName || "resource"));
      return;
    }
    failures.push(text(event.message || event.error || "Script error"));
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    failures.push(text(event.reason || "Unhandled promise rejection"));
  });
  window.setTimeout(function () {
    var boot = document.querySelector("#root .boot");
    if (!boot) return;
    boot.innerHTML = "";
    boot.style.display = "block";
    boot.style.padding = "24px";
    boot.style.fontFamily = "-apple-system, sans-serif";
    boot.style.color = "white";
    var title = document.createElement("strong");
    title.textContent = "Ovis could not start";
    var detail = document.createElement("pre");
    detail.style.whiteSpace = "pre-wrap";
    detail.style.fontFamily = "monospace";
    detail.style.fontSize = "12px";
    detail.textContent = failures.length ? failures.join("\n") : "No startup error was reported. The application module did not execute.";
    boot.appendChild(title);
    boot.appendChild(detail);
  }, 30000);
}());
