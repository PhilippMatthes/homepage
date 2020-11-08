document.addEventListener("DOMContentLoaded", function(event) {

  var container = document.getElementById('peerbridge-animation-container');
  var canvas = document.getElementById('peerbridge-animation');
  canvas.height = canvas.width * (2541 / 2225);
  var ctx = canvas.getContext('2d');
  var frame = new Image();
  frame.onload = function() {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(frame, 0, 0, frame.width, frame.height, // source rectangle
                  0, 0, canvas.width, canvas.height); // destination rectangle
  }

  function frameURL(index) {
    return `/static/img/peerbridge-animation/animation_${index}.webp`;
  }

  frame.src = frameURL(38);

  function preloadFrames() {
    for (var i = 38; i <= 120; i++) {
      new Promise(function() {
        var frame = new Image();
        frame.src = frameURL(i);
      });
    }
  }

  window.addEventListener('scroll', () => {
    var rect = canvas.getBoundingClientRect();
    var progress = (rect.bottom - 700) / 1000;
    if (progress > 1 || progress < 0) return;
    var clippedProgress = 1 - Math.min(1, Math.max(0, progress));
    var numberOfFrames = 120 - 38;
    var frameIndex = 38 + Math.round(clippedProgress * numberOfFrames);
    frame.src = frameURL(frameIndex);
  });

  preloadFrames();

});
