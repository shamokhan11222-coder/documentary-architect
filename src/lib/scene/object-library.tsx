import type { ObjectType } from "./scene-model";

export interface ObjectMeta {
  /** width and height of the object bounding box at scale=1. */
  w: number;
  h: number;
  render: (props: { cx: number; cy: number; scale: number; color?: string; data?: Record<string, unknown> }) => React.ReactNode;
}

const STROKE = "#111";
const SW = 3.2;
const line = { stroke: STROKE, strokeWidth: SW, strokeLinecap: "round" as const, fill: "none" };

function group(cx: number, cy: number, w: number, h: number, scale: number, children: React.ReactNode) {
  // Draw with local origin at (0,0) = bbox top-left, then transform to place bbox center at (cx,cy).
  return (
    <g transform={`translate(${cx - (w * scale) / 2}, ${cy - (h * scale) / 2}) scale(${scale})`}>
      {children}
    </g>
  );
}

export const OBJECTS: Record<ObjectType, ObjectMeta> = {
  tree: {
    w: 90, h: 160,
    render: ({ cx, cy, scale }) => group(cx, cy, 90, 160, scale, (
      <>
        <line x1={45} y1={160} x2={45} y2={100} {...line} />
        <path d="M 10 100 Q 45 20 80 100 Z" fill="#fff" {...line} />
      </>
    )),
  },
  sun: {
    w: 80, h: 80,
    render: ({ cx, cy, scale }) => group(cx, cy, 80, 80, scale, (
      <>
        <circle cx={40} cy={40} r={22} fill="#FFD84D" {...line} />
        {[0,45,90,135,180,225,270,315].map((a) => {
          const rad = (a*Math.PI)/180;
          return <line key={a} x1={40+Math.cos(rad)*30} y1={40+Math.sin(rad)*30}
                       x2={40+Math.cos(rad)*38} y2={40+Math.sin(rad)*38} {...line} />;
        })}
      </>
    )),
  },
  moon: {
    w: 60, h: 60,
    render: ({ cx, cy, scale }) => group(cx, cy, 60, 60, scale, (
      <path d="M 45 10 A 25 25 0 1 0 45 55 A 18 18 0 1 1 45 10 Z" fill="#F5F1D9" {...line} />
    )),
  },
  cloud: {
    w: 120, h: 50,
    render: ({ cx, cy, scale }) => group(cx, cy, 120, 50, scale, (
      <path d="M 20 40 Q 10 20 30 22 Q 35 8 55 15 Q 70 4 85 18 Q 108 18 105 38 Q 110 45 95 45 L 30 45 Q 15 46 20 40 Z" fill="#fff" {...line} />
    )),
  },
  streetlight: {
    w: 40, h: 180,
    render: ({ cx, cy, scale }) => group(cx, cy, 40, 180, scale, (
      <>
        <line x1={20} y1={180} x2={20} y2={30} {...line} />
        <path d="M 20 30 Q 20 15 35 15" {...line} />
        <rect x={30} y={12} width={12} height={12} fill="#FFE680" {...line} />
      </>
    )),
  },
  campfire: {
    w: 90, h: 70,
    render: ({ cx, cy, scale }) => group(cx, cy, 90, 70, scale, (
      <>
        <line x1={10} y1={65} x2={45} y2={50} {...line} />
        <line x1={80} y1={65} x2={45} y2={50} {...line} />
        <line x1={20} y1={62} x2={70} y2={62} {...line} />
        <path d="M 30 55 Q 40 20 45 40 Q 50 15 60 55 Z" fill="#FF8A3C" {...line} />
        <path d="M 35 55 Q 42 35 45 45 Q 48 30 55 55 Z" fill="#FFD84D" stroke="#FF8A3C" strokeWidth={SW*0.6} />
      </>
    )),
  },
  tent: {
    w: 160, h: 110,
    render: ({ cx, cy, scale }) => group(cx, cy, 160, 110, scale, (
      <>
        <path d="M 10 105 L 80 10 L 150 105 Z" fill="#fff" {...line} />
        <path d="M 80 10 L 80 105" {...line} />
        <path d="M 60 105 L 80 60 L 100 105 Z" fill="#F2F2F2" {...line} />
      </>
    )),
  },
  chair: {
    w: 70, h: 90,
    render: ({ cx, cy, scale }) => group(cx, cy, 70, 90, scale, (
      <>
        <line x1={5} y1={5} x2={5} y2={85} {...line} />
        <line x1={5} y1={45} x2={65} y2={45} {...line} />
        <line x1={65} y1={45} x2={65} y2={85} {...line} />
        <line x1={5} y1={85} x2={65} y2={85} {...line} />
      </>
    )),
  },
  table: {
    w: 120, h: 70,
    render: ({ cx, cy, scale }) => group(cx, cy, 120, 70, scale, (
      <>
        <line x1={5} y1={20} x2={115} y2={20} {...line} />
        <line x1={15} y1={20} x2={15} y2={70} {...line} />
        <line x1={105} y1={20} x2={105} y2={70} {...line} />
      </>
    )),
  },
  machine: {
    w: 130, h: 150,
    render: ({ cx, cy, scale }) => group(cx, cy, 130, 150, scale, (
      <>
        <rect x={5} y={5} width={120} height={140} fill="#BDBDBD" {...line} />
        <rect x={20} y={20} width={90} height={40} fill="#E0E0E0" {...line} />
        <circle cx={40} cy={90} r={8} fill="#fff" {...line} />
        <circle cx={70} cy={90} r={8} fill="#fff" {...line} />
        <circle cx={100} cy={90} r={8} fill="#fff" {...line} />
        <rect x={20} y={115} width={90} height={20} fill="#fff" {...line} />
      </>
    )),
  },
  "parking-meter": {
    w: 50, h: 160,
    render: ({ cx, cy, scale }) => group(cx, cy, 50, 160, scale, (
      <>
        <line x1={25} y1={160} x2={25} y2={60} {...line} />
        <rect x={10} y={20} width={30} height={45} fill="#fff" {...line} />
        <circle cx={25} cy={40} r={8} fill="#fff" {...line} />
      </>
    )),
  },
  arrow: {
    w: 120, h: 30,
    render: ({ cx, cy, scale, data }) => {
      const rot = (data?.rotation as number | undefined) ?? 0;
      return (
        <g transform={`translate(${cx}, ${cy}) rotate(${rot}) scale(${scale}) translate(-60, -15)`}>
          <line x1={5} y1={15} x2={105} y2={15} {...line} />
          <path d="M 105 15 L 90 5 M 105 15 L 90 25" {...line} />
        </g>
      );
    },
  },
  "red-circle": {
    w: 60, h: 60,
    render: ({ cx, cy, scale }) => group(cx, cy, 60, 60, scale, (
      <circle cx={30} cy={30} r={26} fill="none" stroke="#E23A3A" strokeWidth={SW * 1.3} />
    )),
  },
  checkmark: {
    w: 60, h: 60,
    render: ({ cx, cy, scale }) => group(cx, cy, 60, 60, scale, (
      <path d="M 8 32 L 24 48 L 52 14" fill="none" stroke="#2FA84F" strokeWidth={SW * 1.6} strokeLinecap="round" strokeLinejoin="round" />
    )),
  },
  cross: {
    w: 60, h: 60,
    render: ({ cx, cy, scale }) => group(cx, cy, 60, 60, scale, (
      <g stroke="#E23A3A" strokeWidth={SW * 1.5} strokeLinecap="round">
        <line x1={12} y1={12} x2={48} y2={48} />
        <line x1={48} y1={12} x2={12} y2={48} />
      </g>
    )),
  },
  house: {
    w: 160, h: 140,
    render: ({ cx, cy, scale }) => group(cx, cy, 160, 140, scale, (
      <>
        <rect x={20} y={60} width={120} height={75} fill="#fff" {...line} />
        <path d="M 10 60 L 80 10 L 150 60 Z" fill="#fff" {...line} />
        <rect x={65} y={90} width={30} height={45} fill="#fff" {...line} />
        <rect x={30} y={75} width={20} height={20} fill="#fff" {...line} />
        <rect x={110} y={75} width={20} height={20} fill="#fff" {...line} />
      </>
    )),
  },
  road: {
    w: 960, h: 40,
    render: ({ cx, cy, scale }) => group(cx, cy, 960, 40, scale, (
      <>
        <rect x={0} y={5} width={960} height={30} fill="#555" />
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={i * 60 + 10} y={18} width={30} height={4} fill="#FFEB80" />
        ))}
      </>
    )),
  },
  board: {
    w: 320, h: 200,
    render: ({ cx, cy, scale, data }) => {
      const lines = (data?.lines as string[] | undefined) ?? [];
      return group(cx, cy, 320, 200, scale, (
        <>
          <rect x={0} y={0} width={320} height={200} fill="#2F7A4A" stroke="#5B3A1A" strokeWidth={SW * 2} />
          {lines.slice(0, 5).map((t, i) => (
            <text key={i} x={20} y={45 + i * 30} fill="#fff" fontSize={22} fontFamily="ui-sans-serif, system-ui">{t}</text>
          ))}
        </>
      ));
    },
  },
  "circle-row": {
    w: 700, h: 100,
    render: ({ cx, cy, scale, data }) => {
      const count = (data?.count as number | undefined) ?? 7;
      const highlight = (data?.highlight as number | undefined) ?? -1;
      const spacing = 700 / (count + 1);
      return group(cx, cy, 700, 100, scale, (
        <>
          {Array.from({ length: count }).map((_, i) => {
            const x = spacing * (i + 1);
            const isHi = i === highlight;
            return (
              <circle key={i} cx={x} cy={50} r={30}
                fill="#fff"
                stroke={isHi ? "#E23A3A" : STROKE}
                strokeWidth={isHi ? SW * 1.6 : SW}
              />
            );
          })}
        </>
      ));
    },
  },
};

export function getObjectMeta(type: ObjectType): ObjectMeta {
  return OBJECTS[type];
}