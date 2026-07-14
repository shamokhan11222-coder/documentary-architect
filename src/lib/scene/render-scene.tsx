import { RigGroup } from "../rig/render-svg";
import { getPose } from "../rig/poses";
import type { Rig } from "../rig/rig-model";
import type { SceneSpec } from "./scene-model";
import { SCENE_H, SCENE_W } from "./scene-model";
import { resolveScene, type ResolvedScene } from "./layout";

interface Props {
  scene: SceneSpec;
  rig: Rig;
  showBBox?: boolean;
  showLayers?: boolean;
  transparent?: boolean;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
}

export function SceneSvg(props: Props) {
  const resolved = resolveScene(props.scene, props.rig);
  return <SceneSvgResolved {...props} resolved={resolved} />;
}

function SceneSvgResolved({
  scene, rig, resolved, showBBox, showLayers, transparent, svgRef, className,
}: Props & { resolved: ResolvedScene }) {
  const { groundY, objects, characters } = resolved;
  const bg = backgroundColors(scene, transparent);

  // Sort objects by layer for correct z-order interleaving with characters.
  const beforeChars = objects.filter((o) => o.layer < 20).sort((a, b) => a.layer - b.layer);
  const afterChars = objects.filter((o) => o.layer >= 20).sort((a, b) => a.layer - b.layer);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* background */}
      {!transparent && (
        <rect x={0} y={0} width={SCENE_W} height={SCENE_H} fill={bg.sky} />
      )}
      {!transparent && scene.environment !== "infographic" && (
        <rect x={0} y={groundY} width={SCENE_W} height={SCENE_H - groundY} fill={bg.ground} />
      )}
      {scene.environment !== "infographic" && (
        <line x1={0} y1={groundY} x2={SCENE_W} y2={groundY}
              stroke="#111" strokeWidth={2.5} strokeLinecap="round" />
      )}

      {beforeChars.map((o, i) => (
        <g key={`b-${i}`}>{o.meta.render({ cx: o.cx, cy: o.cy, scale: o.scale, color: o.spec.color, data: o.spec.data })}</g>
      ))}

      {characters.map((c, i) => {
        const pose = getPose(c.spec.pose);
        return (
          <g key={`c-${i}`} transform={`translate(${c.worldX}, ${c.groundY}) scale(${c.scale}) translate(-100, ${-c.footYLocal})`}>
            <RigGroup
              rig={rig}
              pose={pose}
              expression={{
                eyeStyle: rig.traits.eyeStyle,
                mouthStyle: (c.spec.expression as never) ?? rig.traits.mouthStyle,
                eyeDirection: c.spec.eyeDirection ?? "center",
                eyebrow: c.spec.eyebrow ?? "neutral",
              }}
            />
          </g>
        );
      })}

      {afterChars.map((o, i) => (
        <g key={`a-${i}`}>{o.meta.render({ cx: o.cx, cy: o.cy, scale: o.scale, color: o.spec.color, data: o.spec.data })}</g>
      ))}

      {(scene.labels ?? []).map((l, i) => (
        <text key={`l-${i}`} x={l.x} y={l.y} fontSize={l.size ?? 20} fill="#111"
              fontFamily="ui-sans-serif, system-ui" fontWeight={600}>{l.text}</text>
      ))}

      {showBBox && (
        <g fill="none" stroke="#3b82f6" strokeDasharray="4 3" strokeWidth={1.5}>
          {characters.map((c, i) => (
            <rect key={`cb-${i}`} x={c.bbox.x} y={c.bbox.y} width={c.bbox.w} height={c.bbox.h} />
          ))}
          {objects.map((o, i) => (
            <rect key={`ob-${i}`} x={o.bbox.x} y={o.bbox.y} width={o.bbox.w} height={o.bbox.h} stroke="#f59e0b" />
          ))}
        </g>
      )}

      {showLayers && (
        <g fill="#111" fontSize={11} fontFamily="ui-sans-serif, system-ui">
          {objects.map((o, i) => (
            <text key={`lb-${i}`} x={o.bbox.x + 4} y={o.bbox.y - 2}>{o.spec.type} · z{o.layer}</text>
          ))}
        </g>
      )}
    </svg>
  );
}

function backgroundColors(scene: SceneSpec, transparent: boolean | undefined) {
  if (transparent) return { sky: "transparent", ground: "transparent" };
  const sky = scene.background.skyColor ?? (
    scene.timeOfDay === "night" && scene.environment === "outdoor" ? "#1E2A5A" :
    scene.environment === "infographic" ? "#FFFFFF" :
    scene.environment === "indoor" ? "#FAFAF7" : "#EAF4FB"
  );
  const ground = scene.background.groundColor ?? (
    scene.environment === "infographic" ? "#FFFFFF" :
    scene.environment === "indoor" ? "#EDE7DA" :
    scene.timeOfDay === "night" ? "#3A3A55" : "#B7D89A"
  );
  return { sky, ground };
}

export { resolveScene };