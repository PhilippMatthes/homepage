document.addEventListener("DOMContentLoaded", function(event) {
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
    return `/static/img/peerbridge-animation/animation_${index}.webp`;
  }

  function updateCurrentFrame() {
    var rect = canvas.getBoundingClientRect();
    var progress = (rect.bottom - window.innerHeight * 0.8) / window.innerHeight;
    if (progress > 1 || progress < 0) return;
    var clippedProgress = 1 - Math.min(1, Math.max(0, progress));
    var numberOfFrames = 120 - 38;
    var frameIndex = 38 + Math.round(clippedProgress * numberOfFrames);
    frame.src = frameURL(frameIndex);
  }

  function updateDeviceWidth() {
    if (document.documentElement.clientWidth < 1023) {
      canvas.style.display = 'none';
      preview.style.display = 'block';
      window.removeEventListener('scroll', updateCurrentFrame, true);
    } else {
      preview.style.display = 'none';
      canvas.style.display = 'block';
      updateCurrentFrame();
      window.addEventListener('scroll', updateCurrentFrame, true);
    }
  }

  updateDeviceWidth();
  window.addEventListener('resize', updateDeviceWidth, false);
});
