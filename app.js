import * as THREE from "three";
import { MindARThree } from "mindar-image-three";

/* =========================================================
   白い鳥 WebAR・350羽版
   ---------------------------------------------------------
   0〜1秒   : 最初の1羽
   1〜3秒   : 50か所から150羽まで出現
   3〜5秒   : 合計350羽まで増加。個体別X/Y/Z移動、回転なし
   5〜8秒   : 正面・斜め正面画像でZ方向の手前へ大接近
   8〜12秒  : X-Z空間で右回り大旋回
   12〜15秒 : 止まらず右方向へ退場
   15秒〜   : 水色・薄ピンクの羽とキラキラ
========================================================= */

const CONFIG = {
  TARGET_FILE: "./assets/targets_rise.mind",

  BIRD_TEXTURES: [
    "./assets/bird_up.png",
    "./assets/bird_mid.png",
    "./assets/bird_down.png",
  ],

  FRONT_TEXTURES: [
    "./assets/bird_for_up.png",
    "./assets/bird_for_mid.png",
  ],

  HIGH_TEXTURE: "./assets/bird_high.png",

  BIRD_COUNT: 350,
  SPAWN_POINT_COUNT: 50,

  FIRST_BIRD_END: 1.0,
  MULTI_SPAWN_END: 3.0,
  FORMATION_END: 5.0,
  SPREAD_END: 8.0,
  CIRCLE_END: 12.0,
  EXIT_END: 15.0,

  WING_FRAME_MIN: 0.09,
  WING_FRAME_MAX: 0.18,

  BIRD_IMAGE_FORWARD_ANGLE: 0,

  FLOAT_AMPLITUDE_MIN: 0.005,
  FLOAT_AMPLITUDE_MAX: 0.016,

  FLOAT_SPEED_MIN: 1.5,
  FLOAT_SPEED_MAX: 3.1,

  TILT_MIN: THREE.MathUtils.degToRad(1),
  TILT_MAX: THREE.MathUtils.degToRad(5),

  START_SPREAD: 0.28,
  MID_SPREAD: 0.54,
  FULL_SPREAD: 0.92,

  FEATHER_COUNT: 40,
  SPARKLE_COUNT: 70,

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
let frontTextures = [];
let highTexture = null;

function generateFlockLayout() {
  const layout = [];

  for (let i = 0; i < CONFIG.BIRD_COUNT; i++) {
    const depth = Math.random();
    const angle = random(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random());

    layout.push({
      x: Math.cos(angle) * radius * 0.94,
      y: Math.sin(angle) * radius * 0.72,
      depth,
      size: lerp(0.030, 0.012, depth) * random(0.88, 1.12),
    });
  }

  return layout;
}

const flockLayout = generateFlockLayout();

class Bird {
  constructor(index) {
    this.index = index;
    this.layout = flockLayout[index];
    this.baseSize = this.layout.size;

    this.material = new THREE.SpriteMaterial({
      map: birdTextures[1],
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      alphaTest: 0.015,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    screenScene.add(this.sprite);

    this.spawnTime = calculateSpawnTime(index);
    this.spawnPosition = new THREE.Vector2();

    this.wingFrameDuration = random(
      CONFIG.WING_FRAME_MIN,
      CONFIG.WING_FRAME_MAX
    );
    this.wingPhaseOffset = random(0, 0.7);

    this.floatAmplitude = random(
      CONFIG.FLOAT_AMPLITUDE_MIN,
      CONFIG.FLOAT_AMPLITUDE_MAX
    );
    this.floatSpeed = random(
      CONFIG.FLOAT_SPEED_MIN,
      CONFIG.FLOAT_SPEED_MAX
    );
    this.floatPhase = random(0, Math.PI * 2);

    this.driftPhaseX = random(0, Math.PI * 2);
    this.driftPhaseY = random(0, Math.PI * 2);
    this.driftSpeedX = random(0.45, 1.25);
    this.driftSpeedY = random(0.45, 1.15);

    /*
      出現〜5秒の個体別3D軌道。
      各鳥が異なる半径・速度・方向でX/Y/Z方向に動く。
    */
    this.preOrbitRadiusX = random(0.10, 0.48);
    this.preOrbitRadiusY = random(0.08, 0.36);
    this.preOrbitRadiusZ = random(0.12, 0.58);
    this.preOrbitSpeed = random(0.55, 1.35);
    this.preOrbitPhase = random(0, Math.PI * 2);
    this.preOrbitDirection = Math.random() < 0.5 ? -1 : 1;

    /*
      5〜8秒の接近方法。
      0: 正面、1: 右上奥→左下手前、2: 左上奥→右下手前
    */
    const styleRoll = Math.random();
    this.approachStyle =
      styleRoll < 0.52 ? 0 :
      styleRoll < 0.76 ? 1 : 2;

    this.frontTextureIndex = Math.random() < 0.5 ? 0 : 1;
    this.approachPhase = random(0, Math.PI * 2);
    this.approachRadius = random(0.06, 0.30);
    this.approachSpeed = random(0.75, 1.35);

    /*
      8〜12秒の群れ旋回に個体差を与える。
    */
    this.turnDelay = random(0, 0.52);
    this.turnRadiusScale = random(0.72, 1.30);
    this.turnPhaseOffset = random(-0.18, 0.18);
    this.turnVerticalOffset = random(-0.24, 0.24);
    this.turnDepthOffset = random(-0.34, 0.34);

    this.previousPosition = new THREE.Vector2();
    this.smoothedHeading = 0;
    this.hasPreviousPosition = false;
  }

  reset(spawnPositions) {
    this.sprite.visible = false;
    this.material.opacity = 0;

    const point =
      spawnPositions[
        randomInt(0, spawnPositions.length - 1)
      ];

    this.spawnPosition.set(
      point.x + random(-0.055, 0.055),
      point.y + random(-0.055, 0.055)
    );

    this.previousPosition.copy(this.spawnPosition);
    this.hasPreviousPosition = false;
    this.smoothedHeading = 0;
  }

  setTexture(texture, flipX = false) {
    if (this.material.map !== texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }
    this.flipX = flipX ? -1 : 1;
  }

  update(elapsed) {
    if (
      elapsed < this.spawnTime ||
      elapsed >= CONFIG.EXIT_END
    ) {
      this.sprite.visible = false;
      return;
    }

    this.sprite.visible = true;

    const localTime = elapsed - this.spawnTime;
    const emerge = easeOutCubic(localTime / 0.95);

    let worldX = 0;
    let worldY = 0;
    let worldZ = 4.6;
    let screenX = 0;
    let screenY = 0;
    let perspective = 1;
    let allowRotation = elapsed >= 5;

    /*
      0〜5秒:
      50か所から現れ、中央へ吸い寄せず、
      個体別のX/Y/Z軌道を進む。回転は完全に0度。
    */
    if (elapsed < 5) {
      const p = smoothstep01(
        Math.max(0, elapsed - this.spawnTime) /
        Math.max(0.45, 5 - this.spawnTime)
      );

      const orbit =
        elapsed *
        this.preOrbitSpeed *
        this.preOrbitDirection +
        this.preOrbitPhase;

      const baseX =
        lerp(
          this.spawnPosition.x,
          this.layout.x * screenAspect * 0.56,
          p
        );

      const baseY =
        lerp(
          this.spawnPosition.y,
          this.layout.y * 0.48,
          p
        );

      screenX =
        baseX +
        Math.cos(orbit) *
        this.preOrbitRadiusX *
        (0.35 + p * 0.65);

      screenY =
        baseY +
        Math.sin(orbit * 0.91) *
        this.preOrbitRadiusY *
        (0.35 + p * 0.65);

      worldZ =
        lerp(5.2, 3.35, p) +
        Math.sin(orbit * 0.83) *
        this.preOrbitRadiusZ;

      perspective = clamp(1.65 / worldZ, 0.22, 0.62);
      this.setTexture(frontTextures[this.frontTextureIndex], false);
      this.material.rotation = 0;
    }

    /*
      5〜8秒:
      群れ全体がZ方向の手前へ大きく接近。
      画面から見切れる大きさまで許容する。
    */
    else if (elapsed < 8) {
      const p = smoothstep01((elapsed - 5) / 3);
      const orbit =
        (elapsed - 5) *
        this.approachSpeed +
        this.approachPhase;

      worldZ =
        lerp(3.35, 0.26, p) +
        Math.sin(orbit) *
        this.approachRadius *
        (1 - p);

      perspective = clamp(2.65 / Math.max(worldZ, 0.22), 0.42, 10.8);

      const spreadScale = lerp(0.52, 1.18, p);

      if (this.approachStyle === 0) {
        screenX =
          this.layout.x *
          screenAspect *
          spreadScale *
          perspective;

        screenY =
          this.layout.y *
          spreadScale *
          perspective;

        this.setTexture(
          frontTextures[this.frontTextureIndex],
          false
        );
      } else if (this.approachStyle === 1) {
        screenX =
          lerp(
            screenAspect * 0.82,
            -screenAspect * 0.68,
            p
          ) +
          this.layout.x *
          0.30 *
          perspective;

        screenY =
          lerp(
            0.70,
            -0.56,
            p
          ) +
          this.layout.y *
          0.22 *
          perspective;

        this.setTexture(highTexture, false);
      } else {
        screenX =
          lerp(
            -screenAspect * 0.82,
            screenAspect * 0.68,
            p
          ) +
          this.layout.x *
          0.30 *
          perspective;

        screenY =
          lerp(
            0.70,
            -0.56,
            p
          ) +
          this.layout.y *
          0.22 *
          perspective;

        this.setTexture(highTexture, true);
      }
    }

    /*
      8〜12秒:
      X-Z平面で大きく右回り旋回。
      個体ごとに半径・開始時刻・高さが異なる。
    */
    else if (elapsed < 12) {
      const delayed =
        clamp(
          elapsed -
          8 -
          this.turnDelay +
          this.turnPhaseOffset,
          0,
          4
        );

      const p = smoothstep01(delayed / 4);
      const angle =
        Math.PI * 0.52 -
        p * Math.PI * 2;

      const radiusX =
        screenAspect *
        1.28 *
        this.turnRadiusScale;

      const radiusZ =
        2.25 *
        this.turnRadiusScale;

      worldX = Math.cos(angle) * radiusX;
      worldZ =
        2.52 -
        Math.sin(angle) * radiusZ +
        this.turnDepthOffset;

      worldY =
        this.layout.y * 0.62 +
        this.turnVerticalOffset;

      perspective = clamp(
        2.35 / Math.max(worldZ, 0.28),
        0.22,
        8.4
      );

      screenX =
        worldX * perspective +
        this.layout.x *
        screenAspect *
        0.42 *
        perspective;

      screenY =
        worldY * perspective;

      this.updateWingFrame(elapsed);
    }

    /*
      12〜15秒:
      旋回の速度を止めず、そのまま右へ飛び去る。
    */
    else {
      const p = smoothstep01((elapsed - 12) / 3);

      worldZ = lerp(0.88, 1.65, p);
      perspective = clamp(2.1 / worldZ, 0.55, 3.2);

      screenX =
        lerp(
          -screenAspect * 0.34,
          screenAspect * 2.45,
          p
        ) +
        this.layout.x *
        screenAspect *
        0.36;

      screenY =
        lerp(
          this.layout.y * 0.62,
          this.layout.y * 0.38 - 0.20,
          p
        );

      this.updateWingFrame(elapsed);
    }

    screenX +=
      Math.sin(
        elapsed * this.driftSpeedX +
        this.driftPhaseX
      ) *
      0.012;

    screenY +=
      Math.sin(
        elapsed * this.driftSpeedY +
        this.driftPhaseY
      ) *
      this.floatAmplitude;

    /*
      5秒までは回転させない。
      5秒以降は画面上の移動方向へ滑らかに向ける。
      正面用・斜め正面用画像では画像自体の向きを維持する。
    */
    if (allowRotation && elapsed >= 8) {
      if (this.hasPreviousPosition) {
        const dx = screenX - this.previousPosition.x;
        const dy = screenY - this.previousPosition.y;

        if (Math.hypot(dx, dy) > 0.00008) {
          const desired = Math.atan2(dy, dx);
          let diff = desired - this.smoothedHeading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.smoothedHeading += diff * 0.12;
        }
      } else {
        this.hasPreviousPosition = true;
      }

      this.material.rotation = this.smoothedHeading;
    } else {
      this.material.rotation = 0;
    }

    this.previousPosition.set(screenX, screenY);
    this.sprite.position.set(
      screenX,
      screenY,
      -clamp(worldZ, 0, 9) * 0.01
    );

    /*
      手前では大幅に拡大。
      画面外にはみ出してもクリップしない。
    */
    let size =
      this.baseSize *
      perspective *
      lerp(0.28, 1, emerge);

    if (elapsed >= 12) {
      const exitP = smoothstep01((elapsed - 12) / 3);
      this.material.opacity =
        lerp(1, 0, Math.pow(exitP, 2.4));
    } else {
      this.material.opacity =
        clamp(localTime / 0.28, 0, 1);
    }

    this.sprite.scale.set(
      size * 1.72 * (this.flipX || 1),
      size,
      1
    );
  }

  updateWingFrame(elapsed) {
    const sequence = [0, 1, 2, 1];
    const frame =
      Math.floor(
        (elapsed + this.wingPhaseOffset) /
        this.wingFrameDuration
      ) % sequence.length;

    this.setTexture(
      birdTextures[sequence[frame]],
      false
    );
  }
}

function calculateSpawnTime(index) {
  if (index === 0) {
    return 0;
  }

  if (index < 150) {
    return lerp(
      1.0,
      2.96,
      (index - 1) / 148
    ) + random(-0.035, 0.035);
  }

  return lerp(
    3.0,
    4.88,
    (index - 150) /
    (CONFIG.BIRD_COUNT - 150)
  ) + random(-0.03, 0.03);
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

  projectedSpawnPoints = [];

  for (let i = 0; i < CONFIG.SPAWN_POINT_COUNT; i++) {
    const localPoint = new THREE.Vector3(
      random(-0.46, 0.46),
      random(-0.34, 0.34),
      0
    );

    anchor.group.localToWorld(localPoint);
    localPoint.project(camera);

    projectedSpawnPoints.push(
      new THREE.Vector2(
        localPoint.x * screenAspect,
        localPoint.y
      )
    );
  }

  if (projectedSpawnPoints.length === 0) {
    projectedSpawnPoints.push(new THREE.Vector2(0, 0));
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
        opacity: 0.76,
        color: Math.random() < 0.5
          ? new THREE.Color(0xbfefff)
          : new THREE.Color(0xffd6ea),
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
      random(0.070, 0.150);

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
        color: Math.random() < 0.5
          ? new THREE.Color(0x9fe6ff)
          : new THREE.Color(0xffc6df),
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
        CONFIG.BIRD_TEXTURES.map(loadTexture)
      );

    frontTextures =
      await Promise.all(
        CONFIG.FRONT_TEXTURES.map(loadTexture)
      );

    highTexture =
      await loadTexture(
        CONFIG.HIGH_TEXTURE
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
