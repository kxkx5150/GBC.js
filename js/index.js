var gbc = new GBC_emulator_core();

document.getElementById("fileInput").addEventListener("change", (e) => {
  load_image(e.target.files[0]);
});
window.addEventListener(
  "keydown",
  (e) => {
    gbc.key_down(e);
  },
  true
);
window.addEventListener(
  "keyup",
  (e) => {
    gbc.key_up(e);
  },
  true
);
document.getElementById("setteings").addEventListener("click", (e) => {
  showSetting();
});
document.getElementById("settingdiv").addEventListener("click", (e) => {
  hideSetting();
});
document.getElementById("gamepad_button_container").addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
},true);
document.getElementById("zoom_select").addEventListener("change", (e) => {
  let val = e.target.value-0;
  zoomGB(val);
  localStorage.setItem("zoom",val);
});
window.addEventListener(
  "resize",
  (e) => {
    if(document.getElementById("zoom_select").value-0 === 4)resizeCanvas();
  },
  true
);
function zoomGB(val){
  if(val < 4){
    document.documentElement.style.background = ""
    let canvas = document.getElementById("output");
    canvas.style.height = "";
    canvas.style.width = "";
    document.getElementById("colors").style.display = "block"
    document.getElementById("gameboy_container").style.display = "block"
    document.getElementById("gameboy_container").style.transform = "scale("+val+")";
    document.getElementById("screen").appendChild(canvas)
  }else{
    document.documentElement.style.background = "#191919"
    document.getElementById("colors").style.display = "none"
    document.getElementById("gameboy_container").style.display = "none"
    let canvas = document.getElementById("output");
    document.getElementById("full_container").appendChild(canvas)
    resizeCanvas();
  }
}
function load_image(file) {
  if(!file)return
  var reader = new FileReader();
  reader.onload = function () {
    gbc.set_rom(reader.result, file.name);
  };
  reader.readAsArrayBuffer(file);
}

function hideSetting() {
  let elem = document.getElementById("settingdiv");
  if (elem.style.display == "block") {
    elem.style.left = "-500px";
    setTimeout(function () {
      elem.style.display = "none";
    }, 400);
  }
}
function showSetting() {
  document.getElementById("settingdiv").style.display = "block";
  setTimeout(function () {
    document.getElementById("settingdiv").style.left = 0;
  }, 10);
}
const resizeCanvas = () => {
  setTimeout(() => {
    let canvas = document.getElementById("output");
    const wh = window.innerHeight;
    const ww = window.innerWidth;
    const nw = 256;
    const nh = 224;
    const waspct = ww / wh;
    const naspct = nw / nh;
    if (waspct > naspct) {
      var val = wh / nh;
    } else {
      var val = ww / nw;
    }
    let ctrldiv = document.querySelector(".ctrl_div");
    canvas.style.height = 224 * val - ctrldiv.offsetHeight - 18 + "px";
    canvas.style.width = 256 * val - 24 + "px";
  }, 300);
};
let zoomval = localStorage.getItem("zoom");
if(zoomval){
  document.getElementById("zoom_select").value = zoomval;
  zoomGB(zoomval)
}
