document.addEventListener("DOMContentLoaded", function(event) {
  const macbookContainer = document.getElementById('macbook-container');
  const macbookCodeContainer = document.getElementById('macbook-code-container');
  const preview = document.getElementById('peerbridge-animation-preview');
  const canvas = <HTMLCanvasElement> document.getElementById('peerbridge-animation');
  const ctx = canvas.getContext('2d');

  const height = canvas.width * (2541 / 2225);
  canvas.height = height;

  const frame = new Image();
  frame.onload = function() {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(frame, 0, 0, frame.width, frame.height, // source rectangle
                  0, 0, canvas.width, canvas.height); // destination rectangle
  }

  function frameURL(index: Number) {
    return `/static/img/peerbridge-animation/animation-1000_${index}.webp`;
  }

  let hasPreloadedFrames = false;

  function updateCurrentPeerbridgeFrame() {
    const rect = canvas.getBoundingClientRect();
    const progress = 1 - (rect.y + window.innerHeight) / (rect.height + window.innerHeight);
    if (progress > 1 || progress < 0) return;
    const numberOfFrames = 120 - 38;
    if (!hasPreloadedFrames) {
      for (let i = 38; i <= 120; i++) {
        new Promise(r => {
          var image = new Image();
          image.onload = r;
          image.onerror = r;
          image.src = frameURL(i);
        });
      }
      hasPreloadedFrames = true;
    }
    const frameIndex = 38 + Math.round(progress * numberOfFrames);
    frame.src = frameURL(frameIndex);
  }

  function updateCodeScroll() {
    const rect = macbookContainer.getBoundingClientRect();
    const progress = 1 - (rect.y + window.innerHeight) / (rect.height + window.innerHeight);
    if (progress > 1 || progress < 0) return;
    macbookCodeContainer.scrollTop = progress * 1000;
  }

  function updateDeviceWidth() {
    if (document.documentElement.clientWidth < 1023) {
      canvas.style.display = 'none';
      preview.style.display = 'block';
      window.removeEventListener('scroll', updateCurrentPeerbridgeFrame, true);

      window.removeEventListener('scroll', updateCodeScroll, true);
    } else {
      preview.style.display = 'none';
      canvas.style.display = 'block';
      updateCurrentPeerbridgeFrame();
      window.addEventListener('scroll', updateCurrentPeerbridgeFrame, true);
      updateCodeScroll();
      window.addEventListener('scroll', updateCodeScroll, true);
    }
  }

  updateDeviceWidth();
  window.addEventListener('resize', updateDeviceWidth, false);
});
