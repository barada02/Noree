import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export default function create(container, context) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color((context.theme && context.theme.background) || '#0c0c0d');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0.6, 6.2);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.05, 0.34, 240, 36),
    new THREE.MeshPhysicalMaterial({ color: 0xc96f3b, metalness: 1, roughness: 0.28, clearcoat: 0.6 })
  );
  knot.position.y = 0.4;
  scene.add(knot);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
  key.position.set(4, 6, 4);
  scene.add(key);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  return { dispose() { renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); } };
}
