(() => {
  const isPhone = () => {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const h = window.innerHeight || document.documentElement.clientHeight;
    const tooSmallHeight = h < 1000;
    const looksLikePhone = Math.max(w, h) <= 1400 && "ontouchstart" in window;
    return (tooSmallHeight || looksLikePhone);
  };

  if (isPhone()) {
    document.documentElement.innerHTML =
      "Other screen resolutions are not supported (mobile devices are also not supported)";

    window.__APP_BLOCKED__ = true;
  } else {
    window.__APP_BLOCKED__ = false;
  }
})();