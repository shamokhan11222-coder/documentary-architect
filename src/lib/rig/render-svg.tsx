import type { Rig, Pose, Expression } from "./rig-model";
import { RIG_VIEWBOX, DEFAULT_EXPRESSION } from "./rig-model";

interface Props {
  rig: Rig;
  pose: Pose;
  expression?: Expression;
  scale?: number;
  className?: string;
  filterId?: string; // must be unique per document if roughness used
  svgRef?: React.Ref<SVGSVGElement>;
}

/** Renders the rig purely from vector primitives — never a bitmap. */
export function RigSvg({ rig, pose, expression, scale = 1, className, filterId, svgRef }: Props) {
  const exp = expression ?? DEFAULT_EXPRESSION;
  const { w, h } = RIG_VIEWBOX;
  const fid = filterId ?? `rig-rough-${Math.random().toString(36).slice(2, 9)}`;
  const roughness = rig.traits.outlineRoughness ?? 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale={roughness * 2.5} />
        </filter>
      </defs>
      <g
        transform={`translate(${w / 2}, 0) scale(${pose.facing * scale}, ${scale}) translate(${-w / 2}, 0)`}
        filter={roughness > 0 ? `url(#${fid})` : undefined}
      >
        {drawFigure(rig, pose, exp)}
      </g>
    </svg>
  );
}

function drawFigure(rig: Rig, pose: Pose, exp: Expression) {
  const { lengths, traits } = rig;
  const stroke = traits.strokeColor;
  const sw = traits.lineThickness;
  const pelvisX = 100;
  const pelvisY = 130 + pose.rootY;

  // Rotate whole body around pelvis by torsoRotation
  const rot = pose.torsoRotation;
  const groupTransform = `rotate(${rot} ${pelvisX} ${pelvisY})`;

  // Neck top (shoulders origin)
  const neckTop = { x: pelvisX, y: pelvisY - lengths.torso };
  // Head center above neck
  const headCenter = { x: neckTop.x, y: neckTop.y - lengths.neck - traits.headRadius };

  // Compute arm points
  const lArm = buildLimb(neckTop, pose.lShoulder, pose.lElbow, lengths.upperArm, lengths.lowerArm, -1);
  const rArm = buildLimb(neckTop, pose.rShoulder, pose.rElbow, lengths.upperArm, lengths.lowerArm, 1);
  const lLeg = buildLimb({ x: pelvisX, y: pelvisY }, pose.lHip, pose.lKnee, lengths.upperLeg, lengths.lowerLeg, -1);
  const rLeg = buildLimb({ x: pelvisX, y: pelvisY }, pose.rHip, pose.rKnee, lengths.upperLeg, lengths.lowerLeg, 1);

  const commonLine = { stroke, strokeWidth: sw, strokeLinecap: "round" as const, fill: "none" };

  return (
    <g transform={groupTransform}>
      {/* torso */}
      <line x1={pelvisX} y1={pelvisY} x2={neckTop.x} y2={neckTop.y} {...commonLine} />
      {/* arms */}
      <line x1={neckTop.x} y1={neckTop.y} x2={lArm.mid.x} y2={lArm.mid.y} {...commonLine} />
      <line x1={lArm.mid.x} y1={lArm.mid.y} x2={lArm.end.x} y2={lArm.end.y} {...commonLine} />
      <line x1={neckTop.x} y1={neckTop.y} x2={rArm.mid.x} y2={rArm.mid.y} {...commonLine} />
      <line x1={rArm.mid.x} y1={rArm.mid.y} x2={rArm.end.x} y2={rArm.end.y} {...commonLine} />
      {/* legs */}
      <line x1={pelvisX} y1={pelvisY} x2={lLeg.mid.x} y2={lLeg.mid.y} {...commonLine} />
      <line x1={lLeg.mid.x} y1={lLeg.mid.y} x2={lLeg.end.x} y2={lLeg.end.y} {...commonLine} />
      <line x1={pelvisX} y1={pelvisY} x2={rLeg.mid.x} y2={rLeg.mid.y} {...commonLine} />
      <line x1={rLeg.mid.x} y1={rLeg.mid.y} x2={rLeg.end.x} y2={rLeg.end.y} {...commonLine} />
      {/* hands / feet */}
      {traits.handStyle !== "none" && renderTip(lArm.end, sw, traits.handStyle, stroke)}
      {traits.handStyle !== "none" && renderTip(rArm.end, sw, traits.handStyle, stroke)}
      {traits.footStyle !== "none" && renderTip(lLeg.end, sw, traits.footStyle, stroke)}
      {traits.footStyle !== "none" && renderTip(rLeg.end, sw, traits.footStyle, stroke)}
      {/* head + face */}
      <g transform={`rotate(${pose.headTilt} ${neckTop.x} ${neckTop.y})`}>
        <circle
          cx={headCenter.x}
          cy={headCenter.y}
          r={traits.headRadius}
          fill="white"
          stroke={stroke}
          strokeWidth={sw}
        />
        {renderFace(headCenter, traits.headRadius, sw, stroke, exp)}
      </g>
    </g>
  );
}

function buildLimb(
  origin: { x: number; y: number },
  jointAngleDeg: number,
  secondAngleDeg: number,
  upperLen: number,
  lowerLen: number,
  _side: -1 | 1,
) {
  // Angle 0 = straight down. Positive rotates toward +X (character's right in local frame).
  const a1 = degToRad(jointAngleDeg);
  const mid = {
    x: origin.x + Math.sin(a1) * upperLen,
    y: origin.y + Math.cos(a1) * upperLen,
  };
  const a2 = degToRad(jointAngleDeg + secondAngleDeg);
  const end = {
    x: mid.x + Math.sin(a2) * lowerLen,
    y: mid.y + Math.cos(a2) * lowerLen,
  };
  return { mid, end };
}

function renderTip(p: { x: number; y: number }, sw: number, style: string, stroke: string) {
  if (style === "dot") return <circle cx={p.x} cy={p.y} r={sw * 0.9} fill={stroke} />;
  if (style === "stub") return <circle cx={p.x} cy={p.y} r={sw * 1.4} fill="white" stroke={stroke} strokeWidth={sw * 0.6} />;
  return null;
}

function renderFace(
  center: { x: number; y: number },
  r: number,
  sw: number,
  stroke: string,
  exp: Expression,
) {
  const eyeY = center.y - r * 0.15;
  const eyeDx = r * 0.4;
  const off = eyeOffset(exp.eyeDirection, r * 0.15);
  const mouthY = center.y + r * 0.4;

  return (
    <g>
      {renderEye(center.x - eyeDx + off.x, eyeY + off.y, r * 0.14, sw, stroke, exp.eyeStyle)}
      {renderEye(center.x + eyeDx + off.x, eyeY + off.y, r * 0.14, sw, stroke, exp.eyeStyle)}
      {renderBrow(center.x - eyeDx, eyeY - r * 0.32, r * 0.35, sw, stroke, exp.eyebrow, -1)}
      {renderBrow(center.x + eyeDx, eyeY - r * 0.32, r * 0.35, sw, stroke, exp.eyebrow, 1)}
      {renderMouth(center.x, mouthY, r * 0.5, sw, stroke, exp.mouthStyle)}
    </g>
  );
}

function eyeOffset(dir: Expression["eyeDirection"], d: number) {
  switch (dir) {
    case "up": return { x: 0, y: -d };
    case "down": return { x: 0, y: d };
    case "left": return { x: -d, y: 0 };
    case "right": return { x: d, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function renderEye(x: number, y: number, r: number, sw: number, stroke: string, style: Expression["eyeStyle"]) {
  if (style === "closed") return <line x1={x - r} y1={y} x2={x + r} y2={y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />;
  if (style === "crosses") return (
    <g stroke={stroke} strokeWidth={sw} strokeLinecap="round">
      <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
      <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} />
    </g>
  );
  if (style === "circles") return <circle cx={x} cy={y} r={r} fill="white" stroke={stroke} strokeWidth={sw} />;
  return <circle cx={x} cy={y} r={Math.max(sw * 0.7, r * 0.55)} fill={stroke} />;
}

function renderBrow(cx: number, cy: number, w: number, sw: number, stroke: string, kind: Expression["eyebrow"], side: -1 | 1) {
  if (kind === "neutral") return null;
  let tilt = 0;
  if (kind === "worried") tilt = -8 * side;
  if (kind === "angry") tilt = 15 * side;
  if (kind === "surprised") tilt = 0;
  const half = w / 2;
  const dy = Math.tan(degToRad(tilt)) * half;
  return (
    <line
      x1={cx - half} y1={cy - dy}
      x2={cx + half} y2={cy + dy}
      stroke={stroke} strokeWidth={sw} strokeLinecap="round"
    />
  );
}

function renderMouth(cx: number, cy: number, w: number, sw: number, stroke: string, style: Expression["mouthStyle"]) {
  const half = w / 2;
  if (style === "line") return <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />;
  if (style === "open") return <ellipse cx={cx} cy={cy} rx={half * 0.6} ry={half * 0.4} fill="white" stroke={stroke} strokeWidth={sw} />;
  const dir = style === "smile" ? 1 : style === "frown" ? -1 : 0.4;
  const bend = half * 0.7 * dir;
  return (
    <path
      d={`M ${cx - half} ${cy} Q ${cx} ${cy + bend} ${cx + half} ${cy}`}
      fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"
    />
  );
}

function degToRad(d: number) { return (d * Math.PI) / 180; }