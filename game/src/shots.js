// Screenshot presets: ?shot=start|walk|drive|chase stages the game for a
// screenshot without any input, so headless captures show real gameplay.
//   start — the title screen, city behind it
//   walk  — on foot downtown, traffic and pedestrians around
//   drive — driving a stolen car down the main avenue
//   chase — wanted level 4, police cruisers in pursuit
export const SHOT_NAMES = ['start', 'walk', 'drive', 'chase'];

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  return SHOT_NAMES.includes(shot) ? shot : null;
}

export function applyShot(shot, game) {
  if (!shot) return false;
  if (shot === 'start') {
    game.showMenu();
    return true;
  }
  game.startPlay(false);
  if (shot === 'walk') {
    game.player.reset(-20, 30);
    game.player.camYaw = 0.6;
    game.setWanted(0);
    game.hud.showDialog('Marco: "Jelajahi kota, curi mobil, kerjakan misi."', 8);
    game.missions.start();
  } else if (shot === 'drive') {
    game.player.reset(29, 60);
    game.player.camYaw = 0;
    const car = game.traffic.nearestParked(game.player.x, game.player.z, 500)
      || game.traffic.parked[0];
    if (car) {
      car.mesh.position.set(29, 0, 60);
      car.mesh.rotation.y = 0;
      game.stealCar(car, true);
      game.player.carSpeed = 22;
    }
    game.shotCruise = true;
    game.missions.start();
    game.hud.toast('Mencuri mobil — berkendara di Vice Shores', 4);
  } else if (shot === 'chase') {
    game.player.reset(29, 40);
    game.player.camYaw = 0.3;
    const car = game.traffic.parked[0];
    if (car) {
      car.mesh.position.set(29, 0, 40);
      car.mesh.rotation.y = 0;
      game.stealCar(car, true);
      game.player.carSpeed = 24;
    }
    game.shotCruise = true;
    game.setWanted(4);
    game.spawnPoliceForWanted();
    game.missions.start();
    game.hud.showDialog('Marco: "Polisi mengepungmu! Kabur!"', 8);
  }
  return true;
}
