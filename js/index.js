var gbc = new GBC_emulator_core();

document.getElementById("fileInput").addEventListener("change", (e) => {
  load_image(e.target.files[0]);
});
function load_image(file) {
  if(!file)return
  var reader = new FileReader();
  reader.onload = function () {
    gbc.set_rom(reader.result, file.name);
  };
  reader.readAsArrayBuffer(file);
}
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