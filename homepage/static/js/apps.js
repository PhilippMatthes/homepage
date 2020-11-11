document.addEventListener("DOMContentLoaded", function(event) {
  var macbookContainer = document.getElementById('macbook-container');
  var macbookCodeContainer = document.getElementById('macbook-code-container');
  var preview = document.getElementById('peerbridge-animation-preview');
  var canvas = document.getElementById('peerbridge-animation');
  var ctx = canvas.getContext('2d');

  var height = canvas.width * (2541 / 2225);
  canvas.height = height;
  preview.height = height;

  var frame = new Image();
  frame.onload = function() {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(frame, 0, 0, frame.width, frame.height, // source rectangle
                  0, 0, canvas.width, canvas.height); // destination rectangle
  }

  function frameURL(index) {
    return `/static/img/peerbridge-animation/animation-1000_${index}.webp`;
  }

  function updateCurrentPeerbridgeFrame() {
    var rect = canvas.getBoundingClientRect();
    var progress = 1 - (rect.y + window.innerHeight) / (rect.height + window.innerHeight);
    if (progress > 1 || progress < 0) return;
    var numberOfFrames = 120 - 38;
    var frameIndex = 38 + Math.round(progress * numberOfFrames);
    frame.src = frameURL(frameIndex);
  }

  function updateCodeScroll() {
    var rect = macbookContainer.getBoundingClientRect();
    var progress = 1 - (rect.y + window.innerHeight) / (rect.height + window.innerHeight);
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
