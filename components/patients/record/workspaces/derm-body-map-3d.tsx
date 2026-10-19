"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";

import {
  BACK_ANCHORS,
  FRONT_ANCHORS,
  nearestAnchor,
  type Anchor,
} from "@/components/patients/record/workspaces/derm-body-map";
import { cn } from "@/lib/utils";
import type { DermLesion } from "@/types/database";

export type PinDrop = {
  body_view: "front" | "back";
  body_x: number;
  body_y: number;
  anchor: Anchor;
};

export type Map3DCommand =
  | { seq: number; kind: "zoom"; factor: number }
  | { seq: number; kind: "reset" };

/* -------------------------------------------------------------------------- */
/* Procedural low-poly body built from primitives, dimensioned so a click      */
/* maps to the same normalised (body_x, body_y) as the 2D silhouette:         */
/*   x3d = (x2d − 100) / 100      (silhouette width 200 units)                */
/*   y3d = 4 − y2d / 100          (silhouette height 400 units → 4 units)     */
/* -------------------------------------------------------------------------- */

const SKIN = "#d6c2ae";

function LowPolyBody({
  onSurfaceClick,
}: {
  onSurfaceClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <group onPointerDown={onSurfaceClick}>
      {/* Head — silhouette circle (100,40,r26). */}
      <mesh position={[0, 3.6, 0]}>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
      </mesh>
      {/* Neck — rect (92,62,16×16). */}
      <mesh position={[0, 3.3, 0]}>
        <capsuleGeometry args={[0.07, 0.12, 4, 10]} />
        <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
      </mesh>
      {/* Torso — rect (64,74,72×150), centre y3d ≈ 2.51. */}
      <RoundedBox
        args={[0.72, 1.5, 0.32]}
        radius={0.14}
        smoothness={3}
        position={[0, 2.51, 0]}
      >
        <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Arm — rect (side,80,20×130). */}
          <mesh position={[side * 0.5, 2.55, 0]}>
            <capsuleGeometry args={[0.095, 1.1, 4, 10]} />
            <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
          </mesh>
          {/* Hand — circle (side,216,r12). */}
          <mesh position={[side * 0.5, 1.84, 0]}>
            <sphereGeometry args={[0.11, 12, 10]} />
            <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
          </mesh>
          {/* Leg — rect (side,220,22×150). */}
          <mesh position={[side * 0.16, 1.05, 0]}>
            <capsuleGeometry args={[0.11, 1.25, 4, 10]} />
            <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
          </mesh>
          {/* Foot — ellipse (side,378,15×9). */}
          <mesh position={[side * 0.16, 0.14, 0.07]}>
            <boxGeometry args={[0.14, 0.08, 0.28]} />
            <meshStandardMaterial color={SKIN} flatShading roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PinMarkers({
  lesions,
  selectedId,
  onSelect,
}: {
  lesions: DermLesion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {lesions.map((lesion) => {
        if (lesion.body_x === null || lesion.body_y === null) return null;
        const x = (lesion.body_x - 0.5) * 2;
        const y = 4 - lesion.body_y * 4;
        // Pins sit just proud of the torso; the exact depth is approximated
        // because only the flat (x, y) projection is persisted.
        const z = lesion.body_view === "front" ? 0.19 : -0.19;
        const active = lesion.id === selectedId;
        return (
          <group key={lesion.id} position={[x, y, z]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelect(lesion.id);
              }}
            >
              <sphereGeometry args={[active ? 0.055 : 0.042, 12, 10]} />
              <meshBasicMaterial color={active ? "#b91c1c" : "#dc2626"} />
            </mesh>
            <Html
              center
              zIndexRange={[30, 0]}
              style={{ pointerEvents: "none" }}
            >
              <span
                className={cn(
                  "select-none rounded-pill border border-white/60 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm",
                  active ? "bg-[#b91c1c]" : "bg-[#dc2626]",
                )}
              >
                {lesion.pin_number}
              </span>
            </Html>
          </group>
        );
      })}
    </>
  );
}

const HOME_POSITION = new THREE.Vector3(0, 2.2, 5.6);
const HOME_TARGET = new THREE.Vector3(0, 2.2, 0);
const MIN_DISTANCE = 2.4;
const MAX_DISTANCE = 10;

function CommandRunner({ command }: { command: Map3DCommand | null }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as
    { target: THREE.Vector3; update: () => void } | null | undefined;

  useEffect(() => {
    if (!command) return;
    if (command.kind === "reset") {
      camera.position.copy(HOME_POSITION);
      camera.lookAt(HOME_TARGET);
      if (controls) {
        controls.target.copy(HOME_TARGET);
        controls.update();
      }
      return;
    }
    const target = controls?.target ?? HOME_TARGET;
    const offset = camera.position.clone().sub(target);
    const nextLength = offset.length() * command.factor;
    if (nextLength < MIN_DISTANCE || nextLength > MAX_DISTANCE) return;
    camera.position.copy(target.clone().add(offset.setLength(nextLength)));
  }, [command, camera, controls]);

  return null;
}

export function DermBodyMap3D({
  lesions,
  selectedId,
  onSelect,
  onDrop,
  canManage,
  command,
}: {
  lesions: DermLesion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDrop?: (drop: PinDrop) => void;
  canManage: boolean;
  command?: Map3DCommand | null;
}) {
  function handleSurfaceClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (!canManage || !onDrop) return;
    const face = event.face;
    if (!face) return;
    const normal = face.normal
      .clone()
      .transformDirection(event.object.matrixWorld);
    const body_view: "front" | "back" = normal.z >= 0 ? "front" : "back";
    const px = event.point.x * 100 + 100;
    const py = (4 - event.point.y) * 100;
    if (px < 0 || px > 200 || py < 0 || py > 400) return;
    const anchors = body_view === "front" ? FRONT_ANCHORS : BACK_ANCHORS;
    onDrop({
      body_view,
      body_x: Number((px / 200).toFixed(4)),
      body_y: Number((py / 400).toFixed(4)),
      anchor: nearestAnchor(anchors, px, py),
    });
  }

  return (
    <div
      className={
        canManage
          ? "h-[420px] w-full cursor-crosshair overflow-hidden rounded-control border border-hairline bg-app/40"
          : "h-[420px] w-full overflow-hidden rounded-control border border-hairline bg-app/40"
      }
    >
      <Canvas
        camera={{ position: [0, 2.2, 5.6], fov: 40 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 8, 6]} intensity={1.3} />
        <directionalLight position={[-4, 3, -5]} intensity={0.4} />
        <LowPolyBody onSurfaceClick={handleSurfaceClick} />
        <PinMarkers
          lesions={lesions}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          target={[0, 2.2, 0]}
        />
        <CommandRunner command={command ?? null} />
      </Canvas>
    </div>
  );
}
