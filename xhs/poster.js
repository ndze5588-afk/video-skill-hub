// Fits a live copy of the site into each .frame: <div class="frame" data-site-width="1240" data-target="#timeline" data-offset="20" data-theme="dark">
document.querySelectorAll(".frame").forEach((frame) => {
  const siteWidth = Number(frame.dataset.siteWidth);
  const scale = frame.clientWidth / siteWidth;
  const iframe = document.createElement("iframe");
  iframe.src = "../dist/index.html";
  iframe.width = siteWidth;
  iframe.height = Math.ceil(frame.clientHeight / scale);
  iframe.style.transform = `scale(${scale})`;
  iframe.addEventListener("load", () => {
    const doc = iframe.contentDocument;
    if (frame.dataset.theme) doc.documentElement.dataset.theme = frame.dataset.theme;
    // Freeze the playhead at the end of its sweep and hide the page scrollbar.
    const style = doc.createElement("style");
    style.textContent = ".playhead{animation:none!important;left:calc(100% - 4px)!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none}";
    doc.head.appendChild(style);
    const place = () => {
      const target = frame.dataset.target && doc.querySelector(frame.dataset.target);
      if (!target) return setTimeout(place, 100);
      const y = target.getBoundingClientRect().top + iframe.contentWindow.scrollY - Number(frame.dataset.offset || 0);
      iframe.contentWindow.scrollTo(0, y);
    };
    // Place again once web fonts have settled, since they shift the layout.
    if (frame.dataset.target) { place(); setTimeout(place, 1500); }
  });
  frame.appendChild(iframe);
});
