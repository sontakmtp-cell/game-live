// Procedural 3D Asset Generator for TikTok LIVE Arcade
// Generates industrial phone, rope, grinder, and knife blade using Three.js

import * as THREE from './vendor/three.module.js';

/**
 * Tạo khung xà kim loại trên đỉnh gắn điểm neo
 */
export function createCeilingMount(anchorPos) {
  const group = new THREE.Group();

  // Thanh xà ngang
  const beamGeo = new THREE.BoxGeometry(1.6, 0.08, 0.12);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x3a424e,
    metalness: 0.8,
    roughness: 0.4,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(anchorPos.x, anchorPos.y + 0.06, anchorPos.z);
  beam.castShadow = true;
  group.add(beam);

  // Móc treo neo dây (eyelet)
  const ringGeo = new THREE.TorusGeometry(0.024, 0.006, 12, 24);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xc89b3c,
    metalness: 0.9,
    roughness: 0.2,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(anchorPos.x, anchorPos.y, anchorPos.z);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

/**
 * Tạo dây treo 3D dạng chuỗi phân đoạn (smooth segment chain)
 */
export function createRopeMesh(segments = 24, radius = 0.005) {
  const group = new THREE.Group();
  const cylinderGeo = new THREE.CylinderGeometry(radius, radius, 1, 8);
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xd4a559, // Màu sợi dù/cáp bện vàng đồng
    roughness: 0.6,
    metalness: 0.3,
  });

  const segmentMeshes = [];
  for (let i = 0; i < segments; i++) {
    const mesh = new THREE.Mesh(cylinderGeo, ropeMat);
    mesh.castShadow = true;
    group.add(mesh);
    segmentMeshes.push(mesh);
  }

  /**
   * Cập nhật các đốt dây theo mảng điểm {x, y, z}
   */
  function updateRopePoints(points) {
    if (!points || points.length < 2) return;
    for (let i = 0; i < segmentMeshes.length; i++) {
      const p1 = points[i];
      const p2 = points[i + 1] || points[i];
      const mesh = segmentMeshes[i];

      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;
      const midZ = (p1.z + p2.z) * 0.5;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;

      mesh.position.set(midX, midY, midZ);
      mesh.scale.set(1, len, 1);

      // Định hướng xiên theo vector (p1 -> p2)
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      mesh.quaternion.setFromUnitVectors(up, dir);
    }
  }

  return { group, updateRopePoints };
}

/**
 * Tạo điện thoại smartphone 3D procedural
 */
export function createPhoneMesh(dimensions = [0.16, 0.32, 0.016]) {
  const group = new THREE.Group();
  const [w, h, d] = dimensions;

  // Thân máy kim loại viền bo (treo phía dưới móc neo tại y=0)
  const bodyGeo = new THREE.BoxGeometry(w, h, d);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    metalness: 0.85,
    roughness: 0.25,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, -h * 0.5, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Màn hình OLED bóng kính mặt trước
  const screenGeo = new THREE.PlaneGeometry(w * 0.92, h * 0.94);
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x05070c,
    metalness: 0.95,
    roughness: 0.05,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, -h * 0.5, d * 0.5 + 0.0005);
  group.add(screen);

  // Viền camera cụm sau
  const bumpGeo = new THREE.BoxGeometry(w * 0.36, w * 0.36, 0.005);
  const bumpMat = new THREE.MeshStandardMaterial({
    color: 0x2d3444,
    metalness: 0.9,
    roughness: 0.2,
  });
  const bump = new THREE.Mesh(bumpGeo, bumpMat);
  bump.position.set(w * 0.22, -h * 0.2, -d * 0.5 - 0.0025);
  group.add(bump);

  // Móc treo trên đỉnh điện thoại (ngay tại gốc pivot y = 0 gắn với đầu dây)
  const topHookGeo = new THREE.TorusGeometry(0.014, 0.003, 8, 16);
  const hookMat = new THREE.MeshStandardMaterial({
    color: 0xc89b3c,
    metalness: 0.9,
    roughness: 0.2,
  });
  const topHook = new THREE.Mesh(topHookGeo, hookMat);
  topHook.position.set(0, 0, 0);
  topHook.rotation.x = Math.PI / 2;
  group.add(topHook);

  return group;
}

/**
 * Tạo cỗ máy nghiền công nghiệp (grinder) với 2 trục quay bánh răng
 */
export function createGrinderMesh(openingWidth = 0.8) {
  const group = new THREE.Group();

  // Khung máng phễu nghiền
  const funnelMat = new THREE.MeshStandardMaterial({
    color: 0x1f232b,
    metalness: 0.7,
    roughness: 0.5,
  });

  const wallLGeo = new THREE.BoxGeometry(0.05, 0.45, 0.6);
  const wallL = new THREE.Mesh(wallLGeo, funnelMat);
  wallL.position.set(-openingWidth * 0.5, 0, 0);
  wallL.rotation.z = -0.25;
  group.add(wallL);

  const wallR = new THREE.Mesh(wallLGeo, funnelMat);
  wallR.position.set(openingWidth * 0.5, 0, 0);
  wallR.rotation.z = 0.25;
  group.add(wallR);

  // 2 trục nghiền răng cưa quay ngược chiều nhau
  const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 16);
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0x8a929e,
    metalness: 0.9,
    roughness: 0.2,
  });

  const shaft1 = new THREE.Group();
  const core1 = new THREE.Mesh(shaftGeo, teethMat);
  core1.rotation.x = Math.PI / 2;
  shaft1.add(core1);

  // Thêm các cánh răng nghiền
  for (let i = 0; i < 8; i++) {
    const toothGeo = new THREE.BoxGeometry(0.16, 0.02, 0.05);
    const tooth = new THREE.Mesh(toothGeo, teethMat);
    tooth.position.z = (i - 3.5) * 0.06;
    tooth.rotation.z = (i * Math.PI) / 4;
    shaft1.add(tooth);
  }
  shaft1.position.set(-0.11, -0.15, 0);
  group.add(shaft1);

  const shaft2 = shaft1.clone();
  shaft2.position.set(0.11, -0.15, 0);
  group.add(shaft2);

  // Hàm update quay răng nghiền
  function update(dt) {
    const speed = 1.8 * dt;
    shaft1.rotation.z += speed;
    shaft2.rotation.z -= speed;
  }

  return { group, update };
}

/**
 * Tạo mô hình dao cắt công nghiệp di chuyển từ 2 cạnh vào
 */
export function createKnifeMesh(side = 'left') {
  const group = new THREE.Group();
  const dir = side === 'left' ? 1 : -1;

  // Lưỡi dao vát nhọn sắc: Mũi dao nằm chuẩn xác tại x = 0 (tọa độ tiếp xúc chuẩn)
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.42, -0.035);
  bladeShape.lineTo(-0.07, -0.015);
  bladeShape.lineTo(0, 0); // Mũi dao tại x = 0
  bladeShape.lineTo(-0.07, 0.015);
  bladeShape.lineTo(-0.42, 0.035);
  bladeShape.closePath();

  const extrudeSettings = { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002 };
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeSettings);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xdde4ec, // Thép sáng bóng
    metalness: 0.95,
    roughness: 0.12,
  });

  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.castShadow = true;

  // Cán dao kim loại thủy lực nằm phía sau lưỡi dao
  const handleGeo = new THREE.BoxGeometry(0.35, 0.06, 0.03);
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x481c1c, // Đỏ công nghiệp
    metalness: 0.5,
    roughness: 0.4,
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(-0.55, 0, 0);

  const subGroup = new THREE.Group();
  subGroup.add(blade);
  subGroup.add(handle);

  if (side === 'left') {
    subGroup.rotation.y = 0;
    blade.position.set(0, 0, -0.003);
  } else {
    subGroup.rotation.y = Math.PI;
    blade.position.set(0, 0, 0.003);
  }
  group.add(subGroup);

  return group;
}
