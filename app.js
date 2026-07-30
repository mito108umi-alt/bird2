import * as THREE from "three";
import { MindARThree } from "mindar-image-three";

/* =========================================================
   白い鳥 WebAR
   ---------------------------------------------------------
   0〜1秒   : 最初の1羽
   1〜3秒   : 複数地点から順次出現
   3〜5秒   : 約50羽まで増加
   5〜8秒   : 画面全体へ群れが広がる
   8〜12秒  : 広がったまま右回り大旋回
   12〜15秒 : 旋回しながら画面外へ退場
   15秒〜   : 羽＋キラキラが継続
========================================================= */

const CONFIG = {
  TARGET_FILE: "./assets/targets.mind",

  BIRD_TEXTURES: [
    "./assets/bird_up.png",
    "./assets/bird_mid.png",
    "./assets/bird_down.png",
  ],

  BIRD_COUNT: 50,

  FIRST_BIRD_END: 1.0,
  MULTI_SPAWN_END: 3.0,
  FORMATION_END: 5.0,
  SPREAD_END: 8.0,
  CIRCLE_END: 12.0,
  EXIT_END: 15.0,

  WING_FRAME_MIN: 0.075,
  WING_FRAME_MAX: 0.15,

  /*
    bird PNGが右向きなら0。
    上向きの画像なら Math.PI / 2 に変更する。
  */
  BIRD_IMAGE_FORWARD_ANGLE: 0,

  /*
    群れ全体の進行方向から、
    各個体が自然にずれる角度。
  */
  HEADING_OFFSET_MIN: THREE.MathUtils.degToRad(-10),
  HEADING_OFFSET_MAX: THREE.MathUtils.degToRad(10),

  FLOAT_AMPLITUDE_MIN: 0.006,
  FLOAT_AMPLITUDE_MAX: 0.018,

  FLOAT_SPEED_MIN: 2.0,
  FLOAT_SPEED_MAX: 4.0,

  TILT_MIN: THREE.MathUtils.degToRad(1.5),
  TILT_MAX: THREE.MathUtils.degToRad(6),

  START_SPREAD: 0.25,
  MID_SPREAD: 0.52,
  FULL_SPREAD: 1.0,

  FEATHER_COUNT: 32,
  SPARKLE_COUNT: 55,

  MIN_TRIGGER_INTERVAL: 1500,
};

const SPAWN_POINTS_TARGET = [
  { x: -0.36, y:  0.27 },
  { x: -0.18, y:  0.18 },
  { x:  0.03, y:  0.29 },
  { x:  0.23, y:  0.14 },
  { x:  0.36, y: -0.02 },
  { x: -0.31, y: -0.09 },
  { x: -0.11, y: -0.16 },
  { x:  0.10, y: -0.10 },
  { x:  0.29, y: -0.23 },
];

const container = document.querySelector("#ar-container");
const startScreen = document.querySelector("#start-screen");
const startButton = document.querySelector("#start-button");
const statusMessage = document.querySelector("#status-message");
const errorMessage = document.querySelector("#error-message");

function setStatus(text) {
  statusMessage.textContent = text;

  if (text) {
    statusMessage.classList.add("visible");
  } else {
    statusMessage.classList.remove("visible");
  }
}

function showError(text) {
  errorMessage.textContent = text;
  errorMessage.classList.add("visible");
}

const mindarThree = new MindARThree({
  container,
  imageTargetSrc: CONFIG.TARGET_FILE,
  uiScanning: false,
  uiLoading: false,
  uiError: false,
});

const { renderer, scene, camera } = mindarThree;
const anchor = mindarThree.addAnchor(0);

const screenScene = new THREE.Scene();

const screenCamera = new THREE.OrthographicCamera(
  -1,
  1,
  1,
  -1,
  -10,
  10
);

screenCamera.position.z = 5;
renderer.autoClear = false;

let screenAspect = 1;

function updateScreenCamera() {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);

  screenAspect = width / height;

  screenCamera.left = -screenAspect;
  screenCamera.right = screenAspect;
  screenCamera.top = 1;
  screenCamera.bottom = -1;
  screenCamera.updateProjectionMatrix();
}

updateScreenCamera();
window.addEventListener("resize", updateScreenCamera);

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value) {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

const textureLoader = new THREE.TextureLoader();

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      path,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

let birdTextures = [];

function generateFlockLayout() {
  const layout = [];

  /*
    depth = 0 → 最も手前
    depth = 1 → 最も奥

    手前 = 大きい
    中景 = 中くらい
    奥   = 小さい
  */

  const depthTypes = [];

  for (let i = 0; i < 7; i++) {
    depthTypes.push({
      type: "foreground",
      depth: random(0.00, 0.22),
    });
  }

  for (let i = 0; i < 18; i++) {
    depthTypes.push({
      type: "midground",
      depth: random(0.30, 0.62),
    });
  }

  while (depthTypes.length < CONFIG.BIRD_COUNT) {
    depthTypes.push({
      type: "background",
      depth: random(0.70, 1.00),
    });
  }

  depthTypes.sort(() => Math.random() - 0.5);

  function sizeFromDepth(depth) {
    const nearSize = 0.26;
    const farSize = 0.055;

    const perspectiveSize = lerp(
      nearSize,
      farSize,
      depth
    );

    return perspectiveSize * random(0.95, 1.05);
  }

  for (let i = 0; i < CONFIG.BIRD_COUNT; i++) {
    const depthInfo = depthTypes[i];
    const type = depthInfo.type;
    const depth = depthInfo.depth;
    const size = sizeFromDepth(depth);

    let candidate = null;

    const makeSmallCluster =
      i > 8 &&
      Math.random() < 0.16;

    if (makeSmallCluster) {
      const parent = layout[
        randomInt(
          0,
          layout.length - 1
        )
      ];

      candidate = {
        x: parent.x + random(-0.12, 0.12),
        y: parent.y + random(-0.10, 0.10),
      };
    } else {
      for (let attempt = 0; attempt < 80; attempt++) {
        const test = {
          x: random(-0.92, 0.92),
          y: random(-0.78, 0.78),
        };

        let valid = true;

        for (const other of layout) {
          const dx = test.x - other.x;
          const dy = test.y - other.y;
          const distance = Math.hypot(dx, dy);

          const minDistance =
            0.12 +
            (size + other.size) * 0.32;

          if (distance < minDistance) {
            valid = false;
            break;
          }
        }

        if (valid) {
          candidate = test;
          break;
        }
      }
    }

    if (!candidate) {
      candidate = {
        x: random(-0.9, 0.9),
        y: random(-0.75, 0.75),
      };
    }

    layout.push({
      x: candidate.x,
      y: candidate.y,
      depth,
      size,
      type,
    });
  }

  return layout;
}

const flockLayout = generateFlockLayout();

class Bird {
  constructor(index) {
    this.index = index;

    this.material = new THREE.SpriteMaterial({
      map: birdTextures[0],
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.015,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    screenScene.add(this.sprite);

    const layout = flockLayout[index];
    this.layout = layout;
    this.baseSize = layout.size;

    this.wingFrameDuration = random(
      CONFIG.WING_FRAME_MIN,
      CONFIG.WING_FRAME_MAX
    );

    this.wingPhaseOffset = random(0, 0.45);

    /*
      個体ごとに「連続して羽ばたく時間」と
      「短く滑空する時間」を変える。
    */
    this.flapBurstDuration = random(0.7, 1.8);
    this.glideDuration = random(0.12, 0.55);
    this.glideFrame = Math.random() < 0.65 ? 1 : 0;
    this.wingCycleOffset = random(0, 2.0);

    this.floatAmplitude = random(
      CONFIG.FLOAT_AMPLITUDE_MIN,
      CONFIG.FLOAT_AMPLITUDE_MAX
    );

    this.floatSpeed = random(
      CONFIG.FLOAT_SPEED_MIN,
      CONFIG.FLOAT_SPEED_MAX
    );

    this.floatPhase = random(0, Math.PI * 2);

    this.tiltAmplitude = random(
      CONFIG.TILT_MIN,
      CONFIG.TILT_MAX
    );

    this.tiltPhase = random(0, Math.PI * 2);

    this.speedVariation = random(0.90, 1.10);
    this.spawnTime = calculateSpawnTime(index);
    this.spawnPosition = new THREE.Vector2();

    /*
      群れの大きな流れは揃えつつ、
      個体ごとに進行方向・追従速度・揺れを少し変える。
    */
    this.headingOffset = random(
      CONFIG.HEADING_OFFSET_MIN,
      CONFIG.HEADING_OFFSET_MAX
    );

    this.turnResponse = random(0.08, 0.18);
    this.pathLag = random(0, 0.32);

    this.driftX = random(0.006, 0.022);
    this.driftY = random(0.004, 0.016);
    this.driftSpeedX = random(0.55, 1.35);
    this.driftSpeedY = random(0.45, 1.15);
    this.driftPhaseX = random(0, Math.PI * 2);
    this.driftPhaseY = random(0, Math.PI * 2);

    this.smoothedHeading = CONFIG.BIRD_IMAGE_FORWARD_ANGLE;
    this.previousPosition = new THREE.Vector2();
    this.hasPreviousPosition = false;
  }

  reset(spawnPositions) {
    this.sprite.visible = false;
    this.material.opacity = 0;

    const point =
      spawnPositions[
        this.index %
        spawnPositions.length
      ];

    this.spawnPosition.copy(point);

    this.material.map = birdTextures[0];
    this.material.needsUpdate = true;

    this.previousPosition.copy(this.spawnPosition);
    this.hasPreviousPosition = false;
    this.smoothedHeading = CONFIG.BIRD_IMAGE_FORWARD_ANGLE;
  }

  update(elapsed) {
    if (elapsed < this.spawnTime) {
      this.sprite.visible = false;
      return;
    }

    if (elapsed >= CONFIG.EXIT_END) {
      this.sprite.visible = false;
      return;
    }

    this.sprite.visible = true;

    const localTime = elapsed - this.spawnTime;
    const emerge = easeOutCubic(localTime / 1.35);

    let spread;

    if (elapsed < 3) {
      spread = CONFIG.START_SPREAD;
    } else if (elapsed < 5) {
      spread = lerp(
        CONFIG.START_SPREAD,
        CONFIG.MID_SPREAD,
        smoothstep01((elapsed - 3) / 2)
      );
    } else if (elapsed < 8) {
      spread = lerp(
        CONFIG.MID_SPREAD,
        CONFIG.FULL_SPREAD,
        smoothstep01((elapsed - 5) / 3)
      );
    } else {
      spread = CONFIG.FULL_SPREAD;
    }

    /*
      群れの進行方向は共通だが、
      個体ごとにわずかな時間差を持たせる。
    */
    const center = getFlockCenter(
      Math.max(0, elapsed - this.pathLag)
    );

    const destinationX =
      center.x +
      this.layout.x *
      screenAspect *
      spread;

    const destinationY =
      center.y +
      this.layout.y *
      spread;

    let x = lerp(
      this.spawnPosition.x,
      destinationX,
      emerge
    );

    let y = lerp(
      this.spawnPosition.y,
      destinationY,
      emerge
    );

    y +=
      Math.sin(
        elapsed *
        this.floatSpeed *
        Math.PI * 2 +
        this.floatPhase
      ) *
      this.floatAmplitude;

    /*
      同じ群れの中で、各鳥が完全に同じ軌道を通らないようにする。
      大きくばらけさせず、群れとしての一体感は維持する。
    */
    x +=
      Math.sin(
        elapsed * this.driftSpeedX +
        this.driftPhaseX
      ) *
      this.driftX;

    y +=
      Math.sin(
        elapsed * this.driftSpeedY +
        this.driftPhaseY
      ) *
      this.driftY;

    /*
      実際の移動方向から鳥の向きを算出する。
      急に向きが切り替わらないよう、角度を滑らかに追従させる。
    */
    if (this.hasPreviousPosition) {
      const dx = x - this.previousPosition.x;
      const dy = y - this.previousPosition.y;

      if (Math.hypot(dx, dy) > 0.00005) {
        const movementHeading =
          Math.atan2(dy, dx) +
          CONFIG.BIRD_IMAGE_FORWARD_ANGLE +
          this.headingOffset;

        let angleDifference =
          movementHeading - this.smoothedHeading;

        angleDifference =
          Math.atan2(
            Math.sin(angleDifference),
            Math.cos(angleDifference)
          );

        this.smoothedHeading +=
          angleDifference *
          this.turnResponse;
      }
    } else {
      this.smoothedHeading =
        CONFIG.BIRD_IMAGE_FORWARD_ANGLE +
        this.headingOffset;

      this.hasPreviousPosition = true;
    }

    this.previousPosition.set(x, y);
    this.sprite.position.set(x, y, 0);

    /*
      手前の鳥は大きく、
      奥の鳥は小さく見える。
      baseSizeはlayout.depthから決定済み。
    */

    const emergeScale = lerp(
      0.38,
      1.0,
      emerge
    );

    let size =
      this.baseSize *
      emergeScale;

    if (elapsed >= 8) {
      const perspectiveMotion =
        Math.sin(
          elapsed * 0.85 +
          this.floatPhase
        );

      const perspectiveStrength =
        lerp(
          0.16,
          0.07,
          this.layout.depth
        );

      size *=
        1 +
        perspectiveMotion *
        perspectiveStrength;
    }

    if (elapsed >= 12) {
      const exitProgress =
        smoothstep01(
          (elapsed - 12) / 3
        );

      size *= lerp(
        1,
        0.58,
        exitProgress
      );

      this.material.opacity =
        lerp(
          1,
          0,
          Math.pow(
            exitProgress,
            2.2
          )
        );
    } else {
      this.material.opacity =
        clamp(
          localTime / 0.35,
          0,
          1
        );
    }

    const width = size * 1.72;

    this.sprite.scale.set(
      width,
      size,
      1
    );

    this.updateWingFrame(elapsed);

    /*
      進行方向に合わせた向き
      ＋個体ごとの小さなバンク角。
    */
    const bank =
      Math.sin(
        elapsed * 1.6 +
        this.tiltPhase
      ) *
      this.tiltAmplitude;

    this.material.rotation =
      this.smoothedHeading +
      bank;
  }

  updateWingFrame(elapsed) {
    /*
      鳥ごとに羽ばたき速度・開始位相・滑空時間を変える。

      羽ばたき中:
      UP → MID → DOWN → MID

      滑空中:
      MID または UP を短時間保持
    */

    const flapSequence = [0, 1, 2, 1];

    const cycleDuration =
      this.flapBurstDuration +
      this.glideDuration;

    const cycleTime =
      (
        elapsed +
        this.wingCycleOffset
      ) %
      cycleDuration;

    let textureIndex;

    if (cycleTime < this.flapBurstDuration) {
      const frame =
        Math.floor(
          (
            cycleTime +
            this.wingPhaseOffset
          ) /
          this.wingFrameDuration
        ) %
        flapSequence.length;

      textureIndex = flapSequence[frame];
    } else {
      textureIndex = this.glideFrame;
    }

    if (
      this.material.map !==
      birdTextures[textureIndex]
    ) {
      this.material.map =
        birdTextures[textureIndex];

      this.material.needsUpdate = true;
    }
  }
}

function calculateSpawnTime(index) {
  if (index === 0) {
    return 0;
  }

  if (index < 15) {
    return lerp(
      1.05,
      2.95,
      (index - 1) / 13
    ) +
    random(-0.08, 0.08);
  }

  return lerp(
    3.0,
    4.85,
    (index - 15) /
    (CONFIG.BIRD_COUNT - 15)
  ) +
  random(-0.07, 0.07);
}

function cubicBezier(
  p0,
  p1,
  p2,
  p3,
  t
) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x:
      uuu * p0.x +
      3 * uu * t * p1.x +
      3 * u * tt * p2.x +
      ttt * p3.x,

    y:
      uuu * p0.y +
      3 * uu * t * p1.y +
      3 * u * tt * p2.y +
      ttt * p3.y,
  };
}

function getFlockCenter(elapsed) {
  if (elapsed < 8) {
    return {
      x: 0,
      y: 0.02,
    };
  }

  const t =
    smoothstep01(
      (elapsed - 8) / 7
    );

  return cubicBezier(
    {
      x: -screenAspect * 0.56,
      y: -0.05,
    },
    {
      x: -screenAspect * 0.58,
      y: 0.78,
    },
    {
      x: screenAspect * 0.72,
      y: 0.72,
    },
    {
      x: screenAspect * 1.65,
      y: -0.38,
    },
    t
  );
}

const birds = [];
let projectedSpawnPoints = [];

function captureSpawnPoints() {
  anchor.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  projectedSpawnPoints =
    SPAWN_POINTS_TARGET.map(
      (point) => {
        const world =
          new THREE.Vector3(
            point.x,
            point.y,
            0
          );

        anchor.group.localToWorld(world);
        world.project(camera);

        return new THREE.Vector2(
          world.x * screenAspect,
          world.y
        );
      }
    );

  if (
    projectedSpawnPoints.length === 0
  ) {
    projectedSpawnPoints = [
      new THREE.Vector2(0, 0)
    ];
  }
}

function createFeatherTexture() {
  const canvas =
    document.createElement("canvas");

  canvas.width = 128;
  canvas.height = 256;

  const ctx =
    canvas.getContext("2d");

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();
  ctx.translate(64, 128);

  ctx.beginPath();
  ctx.moveTo(0, -102);

  ctx.bezierCurveTo(
    45,
    -60,
    38,
    44,
    0,
    98
  );

  ctx.bezierCurveTo(
    -29,
    47,
    -40,
    -55,
    0,
    -102
  );

  ctx.closePath();

  const gradient =
    ctx.createLinearGradient(
      0,
      -100,
      0,
      100
    );

  gradient.addColorStop(
    0,
    "rgba(255,255,255,0.95)"
  );

  gradient.addColorStop(
    0.6,
    "rgba(238,246,255,0.78)"
  );

  gradient.addColorStop(
    1,
    "rgba(255,255,255,0.18)"
  );

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle =
    "rgba(255,255,255,0.65)";

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -85);

  ctx.quadraticCurveTo(
    -2,
    20,
    3,
    100
  );

  ctx.stroke();
  ctx.restore();

  const texture =
    new THREE.CanvasTexture(canvas);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  return texture;
}

function createSparkleTexture() {
  const canvas =
    document.createElement("canvas");

  canvas.width = 128;
  canvas.height = 128;

  const ctx =
    canvas.getContext("2d");

  const gradient =
    ctx.createRadialGradient(
      64,
      64,
      0,
      64,
      64,
      55
    );

  gradient.addColorStop(
    0,
    "rgba(255,255,255,1)"
  );

  gradient.addColorStop(
    0.16,
    "rgba(255,255,245,0.96)"
  );

  gradient.addColorStop(
    0.42,
    "rgba(225,240,255,0.38)"
  );

  gradient.addColorStop(
    1,
    "rgba(255,255,255,0)"
  );

  ctx.fillStyle = gradient;

  ctx.fillRect(
    0,
    0,
    128,
    128
  );

  const texture =
    new THREE.CanvasTexture(canvas);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  return texture;
}

const featherTexture =
  createFeatherTexture();

class Feather {
  constructor() {
    this.material =
      new THREE.SpriteMaterial({
        map: featherTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0.72,
      });

    this.sprite =
      new THREE.Sprite(
        this.material
      );

    screenScene.add(
      this.sprite
    );

    this.reset(true);
  }

  reset(randomY = false) {
    this.x = random(
      -screenAspect * 1.05,
      screenAspect * 1.05
    );

    this.y = randomY
      ? random(-1.1, 1.15)
      : random(1.02, 1.35);

    this.speed =
      random(0.045, 0.11);

    this.sway =
      random(0.05, 0.16);

    this.swaySpeed =
      random(0.6, 1.4);

    this.phase =
      random(0, Math.PI * 2);

    this.rotationSpeed =
      random(-0.45, 0.45);

    this.rotation =
      random(0, Math.PI * 2);

    this.size =
      random(0.035, 0.075);

    this.sprite.scale.set(
      this.size * 0.52,
      this.size,
      1
    );
  }

  update(dt, time) {
    this.y -=
      this.speed * dt;

    const offset =
      Math.sin(
        time *
        this.swaySpeed +
        this.phase
      ) *
      this.sway;

    this.rotation +=
      this.rotationSpeed *
      dt;

    this.sprite.position.set(
      this.x + offset,
      this.y,
      0.3
    );

    this.material.rotation =
      this.rotation;

    if (
      Math.sin(
        time * 0.55 +
        this.phase
      ) >
      0.88
    ) {
      this.y +=
        dt * 0.035;
    }

    if (this.y < -1.25) {
      this.reset(false);
    }
  }
}

const sparkleTexture =
  createSparkleTexture();

class Sparkle {
  constructor() {
    this.material =
      new THREE.SpriteMaterial({
        map: sparkleTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending:
          THREE.AdditiveBlending,
        opacity: 0,
      });

    this.sprite =
      new THREE.Sprite(
        this.material
      );

    screenScene.add(
      this.sprite
    );

    this.reset(true);
  }

  reset(randomY = false) {
    this.x = random(
      -screenAspect,
      screenAspect
    );

    this.y = randomY
      ? random(-1, 1)
      : random(0.95, 1.2);

    this.speed =
      random(0.015, 0.055);

    this.phase =
      random(0, Math.PI * 2);

    this.twinkleSpeed =
      random(1.2, 3.2);

    this.size =
      random(0.018, 0.055);

    this.sprite.scale.setScalar(
      this.size
    );
  }

  update(dt, time) {
    this.y -=
      this.speed *
      dt;

    const drift =
      Math.sin(
        time * 0.45 +
        this.phase
      ) *
      0.035;

    this.sprite.position.set(
      this.x + drift,
      this.y,
      0.2
    );

    this.material.opacity =
      0.15 +
      (
        Math.sin(
          time *
          this.twinkleSpeed +
          this.phase
        ) +
        1
      ) *
      0.23;

    if (this.y < -1.15) {
      this.reset(false);
    }
  }
}

const feathers = [];
const sparkles = [];
let particleMode = false;

function createParticlePools() {
  for (
    let i = 0;
    i < CONFIG.FEATHER_COUNT;
    i++
  ) {
    const feather =
      new Feather();

    feather.sprite.visible =
      false;

    feathers.push(
      feather
    );
  }

  for (
    let i = 0;
    i < CONFIG.SPARKLE_COUNT;
    i++
  ) {
    const sparkle =
      new Sparkle();

    sparkle.sprite.visible =
      false;

    sparkles.push(
      sparkle
    );
  }
}

function startParticles() {
  if (particleMode) {
    return;
  }

  particleMode = true;

  feathers.forEach(
    (feather) => {
      feather.reset(true);
      feather.sprite.visible =
        true;
    }
  );

  sparkles.forEach(
    (sparkle) => {
      sparkle.reset(true);
      sparkle.sprite.visible =
        true;
    }
  );
}

function stopParticles() {
  particleMode = false;

  feathers.forEach(
    (feather) => {
      feather.sprite.visible =
        false;
    }
  );

  sparkles.forEach(
    (sparkle) => {
      sparkle.sprite.visible =
        false;
    }
  );
}

let arStarted = false;
let targetCurrentlyVisible = false;
let sequencePlaying = false;
let sequenceFinished = false;
let hasPlayedOnce = false;
let replayArmed = false;
let sequenceStartTime = 0;
let lastTriggerTime = -Infinity;

function startSequence() {
  const now = performance.now();

  if (
    now -
    lastTriggerTime <
    CONFIG.MIN_TRIGGER_INTERVAL
  ) {
    return;
  }

  if (sequencePlaying) {
    return;
  }

  lastTriggerTime = now;

  captureSpawnPoints();
  stopParticles();

  sequencePlaying = true;
  sequenceFinished = false;
  replayArmed = false;
  hasPlayedOnce = true;
  sequenceStartTime = now;

  birds.forEach(
    (bird) => {
      bird.reset(
        projectedSpawnPoints
      );
    }
  );

  setStatus("");
}

function finishSequence() {
  if (sequenceFinished) {
    return;
  }

  sequencePlaying = false;
  sequenceFinished = true;

  birds.forEach(
    (bird) => {
      bird.sprite.visible =
        false;
    }
  );

  replayArmed =
    !targetCurrentlyVisible;

  startParticles();
}

anchor.onTargetFound = () => {
  targetCurrentlyVisible = true;

  if (!hasPlayedOnce) {
    startSequence();
    return;
  }

  if (
    sequenceFinished &&
    replayArmed
  ) {
    startSequence();
  }
};

anchor.onTargetLost = () => {
  targetCurrentlyVisible = false;

  if (sequenceFinished) {
    replayArmed = true;
  }
};

let previousTime =
  performance.now();

function animate() {
  const now =
    performance.now();

  let dt =
    (now - previousTime) /
    1000;

  previousTime = now;
  dt = Math.min(dt, 0.05);

  const globalTime =
    now / 1000;

  if (sequencePlaying) {
    const elapsed =
      (now -
      sequenceStartTime) /
      1000;

    for (const bird of birds) {
      bird.update(elapsed);
    }

    if (
      elapsed >=
      CONFIG.EXIT_END
    ) {
      finishSequence();
    }
  }

  if (particleMode) {
    for (
      const feather
      of feathers
    ) {
      feather.update(
        dt,
        globalTime
      );
    }

    for (
      const sparkle
      of sparkles
    ) {
      sparkle.update(
        dt,
        globalTime
      );
    }
  }

  renderer.clear();

  renderer.render(
    scene,
    camera
  );

  renderer.clearDepth();

  renderer.render(
    screenScene,
    screenCamera
  );
}

async function startAR() {
  if (arStarted) {
    return;
  }

  arStarted = true;
  startButton.disabled = true;
  startButton.textContent = "起動中…";

  setStatus(
    "カメラを起動しています…"
  );

  try {
    birdTextures =
      await Promise.all(
        CONFIG.BIRD_TEXTURES.map(
          loadTexture
        )
      );

    for (
      let i = 0;
      i < CONFIG.BIRD_COUNT;
      i++
    ) {
      birds.push(
        new Bird(i)
      );
    }

    createParticlePools();

    await mindarThree.start();

    startScreen.classList.add(
      "hidden"
    );

    setStatus(
      "作品にカメラを向けてください"
    );

    renderer.setAnimationLoop(
      animate
    );
  } catch (error) {
    console.error(error);

    arStarted = false;
    startButton.disabled = false;
    startButton.textContent =
      "ARをはじめる";

    setStatus("");

    showError(
      "カメラを使用できません。ブラウザのカメラ許可をご確認ください。"
    );
  }
}

startButton.addEventListener(
  "click",
  startAR,
  {
    passive: true,
  }
);

window.addEventListener(
  "pagehide",
  () => {
    if (!arStarted) {
      return;
    }

    renderer.setAnimationLoop(null);

    mindarThree
      .stop()
      .catch(() => {});
  }
);
