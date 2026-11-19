import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  baseGlobeUrl, gibsDailyUrl, gibsUrl, satelliteLayer, variableById, type VariableId,
} from './trends';

/**
 * A NASA-lit Earth. The base map, the city lights and the monthly variable overlay are all NASA
 * GIBS images in equirectangular projection, so the same coordinates line up with the markers and
 * with the NASA POWER time series. No map token, no paid tile service.
 *
 * The day texture is NASA Blue Marble (shaded relief + bathymetry) or, in satellite mode, the
 * original MODIS Terra true-colour image for the chosen month. Night lights are NASA VIIRS 2012.
 * A small custom shader mixes day, night and a soft atmospheric limb.
 *
 * The globe is a separate canvas from the hologram Stage: switching modes starts or stops its
 * loop, which keeps a laptop (and a phone) from running two renderers at once.
 */

const RAD = Math.PI / 180;
const R = 1;

export function latLonToVector3(lat: number, lon: number, radius = R) {
  const theta = (90 - lat) * RAD;
  const phi = (lon + 180) * RAD;
  return new THREE.Vector3(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function vector3ToLatLon(p: THREE.Vector3) {
  const n = p.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / RAD;
  let phi = Math.atan2(n.z, -n.x);
  if (phi < 0) phi += Math.PI * 2;
  return { lat, lon: phi / RAD - 180 };
}

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D baseMap;
  uniform sampler2D nightMap;
  uniform vec3 uSun;
  uniform float uNight;
  uniform float uSatellite;
  uniform float uCloud;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 sat = texture2D(dayMap, vUv).rgb;
    vec3 base = texture2D(baseMap, vUv).rgb;
    // Daily MODIS has black swaths between passes. In cloud mode only near-white cloud and
    // snow pixels are lifted onto the seamless Blue Marble base. Testing the weakest channel
    // keeps bright deserts and bare land out, so swath edges do not show as stripes.
    float white = min(sat.r, min(sat.g, sat.b));
    float clouds = smoothstep(0.56, 0.80, white) * uCloud;
    vec3 day = mix(base, sat, max(uSatellite, clouds));
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 n = normalize(vWorldNormal);
    vec3 sun = normalize(uSun);
    float lambert = dot(n, sun);

    // Keep the disc readable while still showing a real day/night terminator.
    float light = smoothstep(-0.24, 0.30, lambert);
    vec3 col = day * (0.46 + 0.72 * light);

    // NASA VIIRS city lights appear only on the night side.
    float lamps = (1.0 - smoothstep(-0.28, 0.18, lambert)) * uNight;
    col += night * lamps * 1.35;

    // A restrained sun glint on water, estimated from the blue-dominated Blue Marble pixels.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 halfDir = normalize(sun + viewDir);
    float ocean = smoothstep(0.02, 0.15, day.b - max(day.r, day.g * 0.92));
    float spec = pow(max(dot(n, halfDir), 0.0), 54.0) * ocean * light;
    col += vec3(0.55, 0.72, 0.95) * spec * 0.42;

    // Blue limb, so the planet sits in air rather than in a flat cut-out.
    float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
    col += vec3(0.16, 0.36, 0.82) * fres * 0.5;

    // Satellite true colour already contains clouds and haze; flatten it a little.
    col = mix(col, day * 0.96, uSatellite * 0.42);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class NasaGlobe {
  readonly host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sphere: THREE.Mesh;
  private overlay: THREE.Mesh;
  private overlayMat: THREE.MeshBasicMaterial;
  private earthMat: THREE.ShaderMaterial;
  private marker = new THREE.Group();
  private markerRing: THREE.Mesh;
  private label: HTMLElement;
  private loader = new THREE.TextureLoader();
  private clock = new THREE.Clock();
  private running = false;
  private overlayToken = 0;
  private overlayTarget = 0;
  private baseToken = 0;
  private baseMode: 'map' | 'satellite' | 'clouds' = 'map';
  private satKey = '';
  private mapTex: THREE.Texture | null = null;
  private satTex: THREE.Texture | null = null;
  private nightTex: THREE.Texture | null = null;
  private sunGoal = new THREE.Vector3(0.45, 0.5, 0.72).normalize();
  private nightTarget = 1;
  private liveSun = false;
  private flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null = null;
  private firstFlight = true;
  /** The view centre in lat/lon and the camera distance: the globe is driven from here. */
  private viewLat = 8;
  private viewLon = 22;
  private viewDist = 5.0;
  /** Eastward spin, degrees per second (the same rate as the photoreal globe). */
  private spinning = false;
  private spinRate = 2.2;
  private drag: { x: number; y: number } | null = null;
  private down = { x: 0, y: 0, t: 0 };
  private resizeObserver: ResizeObserver;
  private compact = window.matchMedia('(max-width: 760px)').matches;

  onPick: ((lat: number, lon: number) => void) | null = null;
  onStatus: ((text: string) => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    host.replaceChildren();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearAlpha(0);
    this.renderer.domElement.setAttribute('aria-label', 'NASA Earth globe');
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 120);
    this.camera.position.set(3.2, 1.8, 3.55);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.35;
    this.controls.maxDistance = 5.5;
    this.controls.rotateSpeed = 0.42;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotate = false;
    // The globe drives the camera from lat/lon so that dragging and spinning match the
    // photoreal renderer exactly: the ground follows the cursor, the planet turns eastward.
    this.controls.enableRotate = false;
    this.controls.enableZoom = false;
    const el = this.renderer.domElement;
    const onMove = (ev: PointerEvent) => {
      if (!this.drag) return;
      const dx = ev.clientX - this.drag.x;
      const dy = ev.clientY - this.drag.y;
      this.drag.x = ev.clientX;
      this.drag.y = ev.clientY;
      const k = 0.22 * (this.viewDist / 5);
      this.nudge(-dx * k, dy * k);
    };
    // The listeners live on the window so a drag that leaves the canvas still ends cleanly.
    const endDrag = () => {
      this.drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
    el.addEventListener('pointerdown', (ev) => {
      this.drag = { x: ev.clientX, y: ev.clientY };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });
    el.addEventListener('wheel', (ev) => {
      this.viewDist = THREE.MathUtils.clamp(this.viewDist * Math.exp(ev.deltaY * 0.0012), 1.35, 5.5);
      this.applyView();
      ev.preventDefault();
    }, { passive: false });

    this.loader.setCrossOrigin('anonymous');

    // Day / night Earth shader. Textures are sampled as raw sRGB and written straight to the
    // canvas, which is the same colour path the old MeshBasicMaterial used.
    const black = new THREE.DataTexture(new Uint8Array([8, 14, 28, 255]), 1, 1);
    black.needsUpdate = true;
    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: black },
        baseMap: { value: black },
        nightMap: { value: black },
        uSun: { value: this.sunGoal.clone() },
        uNight: { value: 0 },
        uSatellite: { value: 0 },
        uCloud: { value: 0 },
      },
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    });
    const base = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), this.earthMat);
    base.name = 'earth';
    this.sphere = base;
    this.scene.add(base);

    this.loadBlueMarble();
    this.loadNightLights();

    // The variable overlay sits a hair above the surface so it never z-fights.
    this.overlayMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.overlay = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0015, 128, 96), this.overlayMat);
    this.overlay.renderOrder = 2;
    this.scene.add(this.overlay);

    // A thin atmospheric limb, drawn behind the planet.
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: 'varying vec3 vN; varying vec3 vP; uniform vec3 uSun; void main(){ vec3 v = normalize(cameraPosition - vP); float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.4); float lit = smoothstep(-0.5, 0.5, dot(normalize(vN), normalize(uSun))); gl_FragColor = vec4(0.30, 0.56, 1.0, 1.0) * rim * (0.32 + 0.9 * lit); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
        uniforms: { uSun: { value: this.sunGoal.clone() } },
      }),
    );
    atmo.name = 'atmosphere';
    atmo.renderOrder = 1;
    this.scene.add(atmo);

    // A quiet star field so the planet is not floating in a flat colour.
    const starCount = 1400;
    const positions = new Float32Array(starCount * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < starCount; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() < 0.001) v.set(1, 0, 0);
      v.normalize().multiplyScalar(18 + Math.random() * 22);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.055, color: 0xbfd4ff, transparent: true, opacity: 0.62, depthWrite: false })));

    this.marker.visible = false;
    this.marker.renderOrder = 4;
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xff4fa3 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 12), pinMat);
    cone.position.y = 0.025;
    this.marker.add(cone);
    this.markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.024, 0.033, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 0.002;
    this.marker.add(this.markerRing);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0012, 0.09, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8ac2, transparent: true, opacity: 0.55 }),
    );
    beam.position.y = 0.045;
    this.marker.add(beam);
    this.scene.add(this.marker);

    this.label = document.createElement('div');
    this.label.className = 'globe-tag';
    this.label.hidden = true;
    host.appendChild(this.label);

    this.attachEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.focus(8, 22, false, 5.0);
    this.controls.autoRotate = true;
  }

  private loadBlueMarble() {
    const high = this.compact ? 2048 : 4096;
    const apply = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const old = this.mapTex;
      this.mapTex = tex;
      if (this.baseMode === 'map') {
        this.earthMat.uniforms.dayMap.value = tex;
        this.earthMat.uniforms.uSatellite.value = 0;
      }
      // The base is also the gap filler under daily satellite swaths.
      this.earthMat.uniforms.baseMap.value = tex;
      if (old && old !== tex) old.dispose();
    };
    const upgrade = () => {
      if (high <= 2048) return;
      this.loader.load(
        baseGlobeUrl(high),
        (hi) => {
          apply(hi);
          this.onStatus?.('NASA Blue Marble · shaded relief + bathymetry');
        },
        undefined,
        () => { /* the 2048 px mosaic stays */ },
      );
    };
    // A local 2048 px mosaic paints the planet on the first frame; NASA GIBS then upgrades it.
    this.loader.load(
      '/earth/blue-marble-2048.jpg',
      (tex) => {
        apply(tex);
        this.onStatus?.('NASA Blue Marble · shaded relief + bathymetry');
        upgrade();
      },
      undefined,
      () => {
        this.loader.load(
          baseGlobeUrl(1024),
          (tex) => { apply(tex); this.onStatus?.('NASA Blue Marble · shaded relief + bathymetry'); upgrade(); },
          undefined,
          () => this.onStatus?.('NASA Blue Marble is not responding; the variable overlay still draws.'),
        );
      },
    );
  }

  private loadNightLights() {
    this.loader.load(
      '/earth/city-lights-1024.png',
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.nightTex = tex;
        this.earthMat.uniforms.nightMap.value = tex;
        this.earthMat.uniforms.uNight.value = this.nightTarget;
      },
      undefined,
      () => { /* the globe still works without city lights */ },
    );
  }

  /**
   * Switch the base map. "map" is the Blue Marble mosaic. "satellite" is the daily MODIS Terra
   * true-colour scene, gaps and all. "clouds" lifts only the bright daily clouds onto the
   * seamless Blue Marble base, which is the good-looking view for the Globe tab.
   */
  setBase(mode: 'map' | 'satellite' | 'clouds', year: number, month: number, width = 2048) {
    if (mode === 'map') {
      this.baseMode = 'map';
      this.baseToken += 1;
      if (this.mapTex) {
        this.earthMat.uniforms.dayMap.value = this.mapTex;
        this.earthMat.uniforms.uSatellite.value = 0;
        this.earthMat.uniforms.uCloud.value = 0;
        this.onStatus?.('NASA Blue Marble · shaded relief + bathymetry');
      }
      return;
    }
    this.baseMode = mode;
    const cloudsOnly = mode === 'clouds';
    const layer = satelliteLayer();
    const { y, m, d } = this.satelliteDate(year, month);
    const stamp = `${String(d).padStart(2, '0')} ${monthName(m)} ${y}`;
    const label = cloudsOnly ? `NASA GIBS · MODIS Terra daily clouds over Blue Marble, ${stamp}` : `NASA GIBS · MODIS Terra true colour, ${stamp}`;
    const key = `${y}-${m}`;
    const show = () => {
      this.earthMat.uniforms.dayMap.value = this.satTex!;
      this.earthMat.uniforms.uSatellite.value = cloudsOnly ? 0 : 1;
      this.earthMat.uniforms.uCloud.value = cloudsOnly ? 1 : 0;
      this.onStatus?.(label);
    };
    if (this.satTex && this.satKey === key) {
      show();
      return;
    }
    this.baseToken += 1;
    const token = this.baseToken;
    this.satKey = key;
    this.onStatus?.(label);
    this.loader.load(
      gibsDailyUrl(layer, y, m, d, width),
      (tex) => {
        if (token !== this.baseToken) { tex.dispose(); return; }
        tex.colorSpace = THREE.NoColorSpace;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        if (this.satTex) this.satTex.dispose();
        this.satTex = tex;
        show();
      },
      undefined,
      () => {
        if (token !== this.baseToken) return;
        this.baseMode = 'map';
        if (this.mapTex) this.earthMat.uniforms.dayMap.value = this.mapTex;
        this.earthMat.uniforms.uSatellite.value = 0;
        this.earthMat.uniforms.uCloud.value = 0;
        this.onStatus?.('No MODIS scene for that month; showing NASA Blue Marble.');
      },
    );
  }

  private satelliteDate(year: number, month: number) {
    const now = new Date();
    const end = new Date(now.getTime() - 24 * 3600e3); // yesterday, so the daily scene exists
    let y = Math.max(2000, Math.min(year, end.getUTCFullYear()));
    let m = Math.min(12, Math.max(1, month));
    if (y === end.getUTCFullYear() && m > end.getUTCMonth() + 1) m = end.getUTCMonth() + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let d = Math.min(15, last);
    if (y === end.getUTCFullYear() && m === end.getUTCMonth() + 1) d = Math.min(d, end.getUTCDate());
    return { y, m, d };
  }

  private attachEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (moved > 6 || performance.now() - this.down.t > 450) return;
      const rect = el.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
      const hit = ray.intersectObject(this.sphere, false)[0];
      if (!hit) return;
      const { lat, lon } = vector3ToLatLon(hit.point);
      this.onPick?.(lat, lon);
    });
  }

  /** Load the NASA GIBS monthly layer for a variable, or clear it with null. */
  setOverlay(variable: VariableId | null, year: number, month: number) {
    this.overlayToken += 1;
    const token = this.overlayToken;
    const info = variable ? variableById(variable) : null;
    if (!info?.gibs) {
      this.overlayTarget = 0;
      this.onStatus?.(info?.source === 'water'
        ? `${info.short} is a ground-gauge record; NASA GIBS has no river-discharge layer.`
        : `No matching NASA GIBS imagery layer for ${info?.short ?? 'this variable'}; the trend still comes from NASA POWER.`);
      return;
    }
    const y = Math.min(year, info.gibsLastYear ?? year);
    this.onStatus?.(`NASA GIBS · ${info.short}, ${String(month).padStart(2, '0')}/${y}`);
    this.loader.load(
      gibsUrl(info.gibs, y, month, this.compact ? 1024 : 2048),
      (tex) => {
        if (token !== this.overlayToken) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        if (this.overlayMat.map) this.overlayMat.map.dispose();
        this.overlayMat.map = tex;
        this.overlayMat.needsUpdate = true;
        this.overlayTarget = 0.74;
      },
      undefined,
      () => {
        if (token !== this.overlayToken) return;
        this.overlayTarget = 0;
        this.onStatus?.('NASA GIBS has no image for that variable and month.');
      },
    );
  }

  /** Suppress the Places opening fly-in; the Globe tab drops pins without moving the camera. */
  settle() {
    this.firstFlight = false;
    this.flight = null;
  }

  /** Point the camera at a coordinate, keeping the current zoom (or a given distance). */
  focus(lat: number, lon: number, animate = true, distance?: number, duration = 1.15) {
    const latC = THREE.MathUtils.clamp(lat, -75, 75);
    const p = latLonToVector3(latC, lon, 1).normalize();
    const dist = THREE.MathUtils.clamp(distance ?? this.camera.position.length(), 1.8, 5.0);
    const to = p.multiplyScalar(dist);
    this.viewLat = latC;
    this.viewLon = lon;
    this.viewDist = dist;
    this.controls.autoRotate = false;
    if (!animate) {
      this.camera.position.copy(to);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }
    this.flight = { from: this.camera.position.clone(), to, t: 0, dur: duration };
  }

  /**
   * Turn the globe the way the photoreal globe turns: the ground follows the cursor and
   * the planet spins eastward, both at the same speed as the Cesium renderer.
   */
  nudge(dLon: number, dLat: number) {
    this.viewLon = ((this.viewLon + dLon + 540) % 360) - 180;
    this.viewLat = THREE.MathUtils.clamp(this.viewLat + dLat, -75, 75);
    this.applyView();
  }

  private applyView() {
    const p = latLonToVector3(this.viewLat, this.viewLon, 1).normalize().multiplyScalar(this.viewDist);
    this.camera.position.copy(p);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setMarker(lat: number, lon: number, name: string, distance?: number) {
    const p = latLonToVector3(lat, lon, 1);
    this.marker.visible = true;
    this.marker.position.copy(p).multiplyScalar(1.001);
    this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    this.label.textContent = name;
    // Light the selected region, but leave a real terminator toward the limb.
    this.sunGoal.copy(latLonToVector3(lat + 14, lon + 24, 1)).normalize();
    if (this.firstFlight) {
      this.firstFlight = false;
      // Let the wide opening shot land for a moment, then travel to the region.
      window.setTimeout(() => this.focus(lat, lon, true, distance ?? 2.75, 2.2), 700);
    } else if (distance !== undefined) {
      this.focus(lat, lon, true, distance, 1.6);
    } else {
      this.focus(lat, lon);
    }
  }

  clearMarker() {
    this.marker.visible = false;
    this.label.hidden = true;
  }

  setSpin(on: boolean) {
    this.spinning = on;
    this.controls.autoRotate = false;
  }

  // ---- v2 console: read-outs and overlays for God's Eye View ----
  /** Where the camera looks (sub-camera point) and how far it is from the centre, in Earth radii. */
  get view() { return { lat: this.viewLat, lon: this.viewLon, dist: this.camera.position.length(), spinning: this.spinning }; }
  /** Latitude and longitude under a screen point, or null off the planet. */
  pickAt(clientX: number, clientY: number): { lat: number; lon: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.sphere, false)[0];
    return hit ? vector3ToLatLon(hit.point) : null;
  }
  /** Zoom to a camera distance in Earth radii (1.35 to 5.5). */
  setDistance(dist: number) {
    this.flight = null;
    this.viewDist = THREE.MathUtils.clamp(dist, 1.35, 5.5);
    this.applyView();
  }
  private grid: THREE.LineSegments | null = null;
  /** A latitude / longitude graticule every 15°, equator and prime meridian brighter. */
  setGrid(on: boolean, color = 0x8cffa8) {
    if (!this.grid) {
      const pts: number[] = [], strong: number[] = [];
      const push = (arr: number[], a: THREE.Vector3, b: THREE.Vector3) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let lat = -75; lat <= 75; lat += 15) {
        for (let lon = -180; lon < 180; lon += 3) push(lat === 0 ? strong : pts, latLonToVector3(lat, lon, R * 1.003), latLonToVector3(lat, lon + 3, R * 1.003));
      }
      for (let lon = -180; lon < 180; lon += 15) {
        for (let lat = -84; lat < 84; lat += 3) push(lon === 0 ? strong : pts, latLonToVector3(lat, lon, R * 1.003), latLonToVector3(lat + 3, lon, R * 1.003));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...pts, ...strong], 3));
      g.addGroup(0, pts.length / 3, 0);
      g.addGroup(pts.length / 3, strong.length / 3, 1);
      this.grid = new THREE.LineSegments(g, [
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }),
      ]);
      this.grid.renderOrder = 3;
      this.scene.add(this.grid);
    }
    this.grid.visible = on;
  }

  /** Cross-fade the NASA VIIRS night lights (1 = full, 0 = off). */
  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
  }

  /** Put the Sun at the real subsolar point, so the terminator and city lights are honest. */
  setLiveSun(on: boolean) {
    this.liveSun = on;
    if (!on) return;
    const now = new Date();
    const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const doy = Math.floor((day - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400e3);
    const decl = -23.44 * Math.cos((2 * Math.PI / 365.24) * (doy + 10));
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const lon = 180 - hours * 15;
    this.sunGoal.copy(latLonToVector3(decl, lon, 1)).normalize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
    this.resize();
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick = () => {
    if (!this.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.flight) {
      this.flight.t = Math.min(1, this.flight.t + dt / this.flight.dur);
      const e = 1 - Math.pow(1 - this.flight.t, 3);
      this.camera.position.lerpVectors(this.flight.from, this.flight.to, e);
      if (this.flight.t >= 1) this.flight = null;
    } else if (this.spinning && !this.drag) {
      // Eastward: the ground moves right, the same way the real Earth turns.
      this.viewLon = ((this.viewLon - this.spinRate * dt + 540) % 360) - 180;
      this.applyView();
    }
    this.controls.update();

    // Globe tab: the real subsolar point is the light source, once a second is plenty.
    if (this.liveSun) {
      const now = new Date();
      const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const doy = Math.floor((day - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400e3);
      const decl = -23.44 * Math.cos((2 * Math.PI / 365.24) * (doy + 10));
      const hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
      this.sunGoal.copy(latLonToVector3(decl, 180 - hours * 15, 1)).normalize();
    }

    // Ease the sun toward the selected region; the atmosphere follows the same direction.
    const sun = this.earthMat.uniforms.uSun.value as THREE.Vector3;
    sun.lerp(this.sunGoal, Math.min(1, dt * 0.9)).normalize();
    const atmo = this.scene.getObjectByName('atmosphere') as THREE.Mesh | undefined;
    if (atmo) (atmo.material as THREE.ShaderMaterial).uniforms.uSun.value.copy(sun);

    // Fade the night lights instead of snapping them.
    const night = this.earthMat.uniforms.uNight.value as number;
    this.earthMat.uniforms.uNight.value = night + (this.nightTarget - night) * Math.min(1, dt * 3.5);

    const op = this.overlayMat.opacity + (this.overlayTarget - this.overlayMat.opacity) * Math.min(1, dt * 5);
    this.overlayMat.opacity = op;
    this.overlay.visible = op > 0.01;

    if (this.marker.visible) {
      const t = this.clock.elapsedTime;
      this.markerRing.scale.setScalar(1 + Math.sin(t * 2.0) * 0.16);
      (this.markerRing.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(t * 2.0) * 0.22;
      const p = this.marker.position.clone().normalize();
      const front = p.dot(this.camera.position.clone().normalize()) > 0.08;
      const projected = this.marker.position.clone().project(this.camera);
      const rect = this.host.getBoundingClientRect();
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      const inView = projected.z < 1 && x > 20 && x < rect.width - 20 && y > 30 && y < rect.height - 20;
      this.label.hidden = !front || !inView;
      if (!this.label.hidden) {
        this.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 8}px)`;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mapTex?.dispose();
    this.satTex?.dispose();
    this.nightTex?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}

function monthName(m: number) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1] || '';
}
