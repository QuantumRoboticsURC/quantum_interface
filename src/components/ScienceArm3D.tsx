import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import * as THREE from "three";

interface ScienceArm3DProps {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

const l1 = 0.1;
const l2 = 0.43;
const l3 = 0.43;
const l4 = 0.25;

function Link({
  position,
  rotation,
  length,
  color,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  length: number;
  color: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.02, 0.02, length, 16]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function DrillBit() {
  return (
    <group>
      <mesh position={[l4 / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.008, 0.006, l4, 12]} />
        <meshStandardMaterial color="#b0b0b0" metalness={0.85} roughness={0.15} />
      </mesh>
      <mesh position={[l4, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.009, 0.025, 8]} />
        <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
}

export default function ScienceArm3D({ q1, q2, q3, q4 }: ScienceArm3DProps) {
  const baseRef = useRef<THREE.Group>(null);
  const deg2rad = (d: number) => (d * Math.PI) / 180;

  return (
    <div className="h-[400px] w-full bg-gray-900 rounded-lg">
      <Canvas shadows>
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[2, 3, 2]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <PerspectiveCamera makeDefault position={[1.2, 0.8, 1.2]} />
        <OrbitControls enablePan enableZoom enableRotate />
        <Environment files="/empty_warehouse_01_1k.hdr" background />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <axesHelper args={[0.5]} />
        <gridHelper args={[2, 20, "white", "gray"]} />

        {/* Base */}
        <mesh position={[0, l1 / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.1, 0.1, l1, 32]} />
          <meshStandardMaterial color="gray" metalness={0.4} roughness={0.6} />
        </mesh>

        {/* Arm chain */}
        <group ref={baseRef} position={[0, l1, 0]} rotation={[0, deg2rad(q1), 0]}>
          <group rotation={[0, 0, deg2rad(q2)]}>
            <Link position={[l2 / 2, 0, 0]} length={l2} color="blue" />

            <group position={[l2, 0, 0]} rotation={[0, 0, deg2rad(q3)]}>
              <Link position={[l3 / 2, 0, 0]} length={l3} color="red" />

              {/* Joint 4: drill servo — revolute, changes drill orientation */}
              <group position={[l3, 0, 0]} rotation={[0, 0, deg2rad(q4)]}>
                <DrillBit />
              </group>
            </group>
          </group>
        </group>
      </Canvas>
    </div>
  );
}
