window.addEventListener('DOMContentLoaded', (e) => {
  var colors = ['red', 'purple', 'green', 'yellow', 'teal', 'transparent'];
  var last = null;
  Array.prototype.slice.call(document.querySelectorAll('.color')).forEach(function(el) {
    el.addEventListener('click', function() {
      if (last) {
        last.classList.remove('active');
      }
      var color = el.getAttribute('data-color');
      var gameboy = document.querySelector('#gameboy');
      gameboy.style.opacity = 0;
      gameboy.classList.remove(gameboy.classList[0]);
  
      let canvas = document.getElementById("output");
      canvas = canvas.parentNode.removeChild(canvas)
      var clone = gameboy.cloneNode(true);
      gameboy.remove();
      clone.classList.add(color);
      clone.style.opacity = 1;
      var colors = document.querySelector('#colors');
      colors.parentNode.insertBefore(clone, colors);
      el.classList.add('active');
      document.getElementById("screen").appendChild(canvas)
      last = el;
      localStorage.setItem("color",color)
    });
  });
  let color = localStorage.getItem("color")
  document.getElementById("gameboy").classList.remove("transparent")
  document.getElementById("gameboy").classList.add(color)
})