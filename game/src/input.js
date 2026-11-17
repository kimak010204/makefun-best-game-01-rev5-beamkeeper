// BEAMKEEPER — masukan mouse dan keyboard.
// Mouse: klik tile cermin untuk memutarnya; klik tombol di layar judul.
// Keyboard: R restart, M mute, 1/2/3 pilih kesulitan di layar judul.

export function attachInput(canvas, hooks) {
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    hooks.onClick(x, y);
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'r') hooks.onRestart();
    else if (key === 'm') hooks.onMute();
    else if (key === '1' || key === '2' || key === '3') hooks.onDifficulty(Number(key) - 1);
    else if (key === 'enter' || key === ' ') hooks.onConfirm();
  });
}
