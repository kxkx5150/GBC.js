var core = new GBC_emulator_core();

document.getElementById("file_input").addEventListener("change", (e) => {
  load_image(e.target.files[0]);
});
function load_image(file) {
  var reader = new FileReader();
  reader.onload = function () {
    core.set_rom(reader.result, file.name);
  };
  reader.readAsArrayBuffer(file);
}
